"""Sign-up, sign-in and /me against PostgreSQL and Redis."""

from datetime import UTC, datetime, timedelta

import time_machine
from fastapi.testclient import TestClient

from tests.conftest import ApiFactory, run_sql
from tests.fakes import FailingEmailSender, MemoryEmailSender
from tests.helpers import API, PASSWORD, bearer, create_user, error_code, login, set_status, signup_body

# Sign-up


def test_signup_creates_an_unverified_user_and_emails_a_link(
    api: TestClient, outbox: MemoryEmailSender
) -> None:
    response = api.post(f"{API}/auth/signup", json=signup_body())

    assert response.status_code == 201
    user = response.json()["user"]
    assert user | {"id": None} == {
        "id": None,
        "email": "ada@example.com",
        "full_name": "Ada Okafor",
        "role": "family",
        "email_verified": False,
        "phone": None,
        "agency": None,
    }
    link = outbox.last("verify_email", "ada@example.com").link
    assert link is not None
    assert link.startswith("http://localhost:3000/verify-email?token=")


def test_signup_stores_only_an_argon2_hash_and_the_privacy_version(api: TestClient) -> None:
    api.post(f"{API}/auth/signup", json=signup_body())

    [(password_hash, version, accepted_at)] = run_sql(
        "SELECT password_hash, privacy_notice_version, privacy_accepted_at FROM users"
    )
    assert isinstance(password_hash, str)
    assert password_hash.startswith("$argon2id$")
    assert PASSWORD not in password_hash
    assert version == "2026-10-05"
    assert accepted_at is not None


def test_signup_with_a_taken_email_is_a_conflict_whatever_the_case(api: TestClient) -> None:
    api.post(f"{API}/auth/signup", json=signup_body("ada@example.com"))

    response = api.post(f"{API}/auth/signup", json=signup_body("ADA@Example.com"))

    assert response.status_code == 409
    assert error_code(response) == "EMAIL_TAKEN"


def test_signup_validates_fields(api: TestClient) -> None:
    response = api.post(
        f"{API}/auth/signup",
        json=signup_body("not-an-email", password="password123", full_name="A", role="super_admin")
        | {"privacy_notice_version": ""},
    )

    assert response.status_code == 422
    fields = response.json()["error"]["details"]["fields"]
    assert set(fields) == {"email", "password", "full_name", "role", "privacy_notice_version"}
    assert "too common" in fields["password"][0]


def test_signup_succeeds_even_if_the_email_fails(make_api: ApiFactory, outbox: MemoryEmailSender) -> None:
    api = make_api()
    api.app.state.email_sender = FailingEmailSender()  # type: ignore[attr-defined]

    response = api.post(f"{API}/auth/signup", json=signup_body())

    assert response.status_code == 201  # the user can ask for a new link


# Sign-in


def test_login_returns_a_token_and_sets_the_refresh_cookie(api: TestClient) -> None:
    create_user()

    response = api.post(f"{API}/auth/login", json={"email": "ADA@example.com", "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "ada@example.com"
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("hv_refresh=")
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert "SameSite=lax" in cookie
    [(last_login,)] = run_sql("SELECT last_login_at FROM users")
    assert last_login is not None


def test_wrong_password_and_unknown_email_look_the_same(api: TestClient) -> None:
    create_user()

    wrong = api.post(f"{API}/auth/login", json={"email": "ada@example.com", "password": "not the password"})
    unknown = api.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]
    assert "set-cookie" not in wrong.headers


def test_suspended_user_cannot_sign_in(api: TestClient) -> None:
    create_user(status="suspended")

    response = api.post(f"{API}/auth/login", json={"email": "ada@example.com", "password": PASSWORD})

    assert response.status_code == 403
    assert error_code(response) == "ACCOUNT_SUSPENDED"


# /me


def test_me_returns_the_signed_in_user(api: TestClient) -> None:
    create_user(role="agency_admin")
    token = login(api)

    response = api.get(f"{API}/me", headers=bearer(token))

    assert response.status_code == 200
    assert response.json()["role"] == "agency_admin"
    assert response.json()["email_verified"] is True


def test_me_needs_a_valid_unexpired_token(api: TestClient) -> None:
    create_user()
    token = login(api)

    assert error_code(api.get(f"{API}/me")) == "UNAUTHENTICATED"
    assert error_code(api.get(f"{API}/me", headers=bearer("garbage"))) == "UNAUTHENTICATED"
    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=16), tick=False):
        expired = api.get(f"{API}/me", headers=bearer(token))
    assert expired.status_code == 401
    assert error_code(expired) == "UNAUTHENTICATED"


def test_suspension_takes_effect_on_the_next_call(api: TestClient) -> None:
    user_id = create_user()
    token = login(api)
    set_status(user_id, "suspended")

    response = api.get(f"{API}/me", headers=bearer(token))

    assert response.status_code == 403
    assert error_code(response) == "ACCOUNT_SUSPENDED"


def test_patch_me_updates_name_and_phone(api: TestClient) -> None:
    create_user()
    headers = bearer(login(api))

    updated = api.patch(f"{API}/me", headers=headers, json={"full_name": "Ada O.", "phone": "0803 123 4567"})
    cleared = api.patch(f"{API}/me", headers=headers, json={"phone": None})

    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Ada O."
    assert updated.json()["phone"] == "08031234567"
    assert cleared.json()["phone"] is None
    assert cleared.json()["full_name"] == "Ada O."  # unchanged when not sent


def test_patch_me_validates(api: TestClient) -> None:
    create_user()
    headers = bearer(login(api))

    bad_phone = api.patch(f"{API}/me", headers=headers, json={"phone": "12345"})
    other_field = api.patch(f"{API}/me", headers=headers, json={"role": "super_admin"})

    assert bad_phone.status_code == 422
    assert "phone" in bad_phone.json()["error"]["details"]["fields"]
    assert other_field.status_code == 422  # role can't be changed here
