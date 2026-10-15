"""Google sign-in end to end against PostgreSQL and Redis, with Google faked (ADR 0016)."""

from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi.testclient import TestClient

from app.integrations.google import GoogleIdentity
from tests.conftest import ApiFactory, run_sql
from tests.fakes import FAKE_GOOGLE_AUTHORIZE, FakeGoogle
from tests.helpers import API, WEB_ORIGIN, bearer, create_user, error_code, login, set_status

WEB = "http://localhost:3000"
ADA = GoogleIdentity(sub="google-sub-ada", email="ada@gmail.com", email_verified=True, name="Ada Okafor")


def query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}


def start(api: TestClient, next_path: str | None = None) -> httpx.Response:
    params = {"next": next_path} if next_path else None
    response: httpx.Response = api.get(f"{API}/auth/google/start", params=params, follow_redirects=False)
    return response


def sign_in_with_google(
    api: TestClient, google: FakeGoogle, identity: GoogleIdentity = ADA, next_path: str | None = None
) -> httpx.Response:
    """Start, consent as `identity`, and come back to the callback; returns the callback's redirect."""
    started = start(api, next_path)
    assert started.status_code == 303, started.text
    authorization_url = started.headers["location"]
    code = google.consent(authorization_url, identity)
    response: httpx.Response = api.get(
        f"{API}/auth/google/callback",
        params={"code": code, "state": query(authorization_url)["state"]},
        follow_redirects=False,
    )
    return response


def lands_on(response: httpx.Response, path: str) -> dict[str, str]:
    """Asserts a redirect to the web app's `path`; returns its query."""
    assert response.status_code == 303, response.text
    location = response.headers["location"]
    assert location.split("?")[0] == f"{WEB}{path}", location
    return query(location)


def google_error(response: httpx.Response) -> str:
    return lands_on(response, "/login")["google_error"]


def refreshed_token(api: TestClient) -> str:
    response = api.post(f"{API}/auth/refresh", headers=WEB_ORIGIN)
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def complete(api: TestClient, role: str = "family", **overrides: str) -> httpx.Response:
    body = {"full_name": "Ada Okafor", "role": role, "privacy_notice_version": "2026-10-05"} | overrides
    response: httpx.Response = api.post(f"{API}/auth/google/complete", json=body, headers=WEB_ORIGIN)
    return response


# Start


def test_start_sends_the_browser_to_google_with_state_pkce_and_nonce(api: TestClient) -> None:
    response = start(api)

    assert response.status_code == 303
    location = response.headers["location"]
    assert location.startswith(FAKE_GOOGLE_AUTHORIZE)
    params = query(location)
    assert params["redirect_uri"] == "http://testserver/api/v1/auth/google/callback"
    assert len(params["code_challenge"]) == 43  # base64url SHA-256: the verifier itself never leaves us
    assert params["nonce"]
    cookie = response.headers["set-cookie"]
    assert f"hv_google_state={params['state']}" in cookie
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth/google" in cookie


def test_start_is_rate_limited_per_ip(api: TestClient) -> None:
    for _ in range(5):
        assert start(api).status_code == 303

    assert google_error(start(api)) == "rate_limited"


def test_google_sign_in_is_off_without_the_google_settings(make_api: ApiFactory) -> None:
    api = make_api(GOOGLE_CLIENT_ID=None, GOOGLE_CLIENT_SECRET=None)

    assert google_error(start(api)) == "unavailable"
    callback = api.get(
        f"{API}/auth/google/callback", params={"code": "x", "state": "y"}, follow_redirects=False
    )
    assert google_error(callback) == "unavailable"


# New users


def test_a_new_google_user_chooses_a_role_then_gets_a_verified_passwordless_account(
    api: TestClient, google: FakeGoogle
) -> None:
    callback = sign_in_with_google(api, google)

    lands_on(callback, "/signup/google")
    assert "hv_refresh" not in callback.headers.get("set-cookie", "")
    pending = api.get(f"{API}/auth/google/pending", headers=WEB_ORIGIN)
    assert pending.json() == {"email": "ada@gmail.com", "full_name": "Ada Okafor"}
    assert run_sql("SELECT count(*) FROM users") == [(0,)]  # nothing stored until they choose

    response = complete(api, role="family", full_name="Ada O.")

    assert response.status_code == 201, response.text
    user = response.json()["user"]
    assert user | {"id": None} == {
        "id": None,
        "email": "ada@gmail.com",
        "full_name": "Ada O.",
        "role": "family",
        "email_verified": True,
        "phone": None,
        "agency": None,
    }
    me = api.get(f"{API}/me", headers=bearer(response.json()["access_token"]))
    assert me.json()["email"] == "ada@gmail.com"
    [(password_hash, google_sub, version)] = run_sql(
        "SELECT password_hash, google_sub, privacy_notice_version FROM users"
    )
    assert (password_hash, google_sub, version) == (None, "google-sub-ada", "2026-10-05")
    assert refreshed_token(api)  # the refresh cookie was set, as at login


def test_a_new_google_agency_admin_gets_an_agency_admin_account(api: TestClient, google: FakeGoogle) -> None:
    sign_in_with_google(api, google)

    response = complete(api, role="agency_admin")

    assert response.status_code == 201
    assert response.json()["user"]["role"] == "agency_admin"


def test_a_pending_sign_up_completes_only_once(api: TestClient, google: FakeGoogle) -> None:
    sign_in_with_google(api, google)
    cookie = api.cookies.get("hv_google_pending")
    assert complete(api).status_code == 201

    api.cookies.set("hv_google_pending", cookie or "", path="/api/v1/auth/google")
    again = complete(api)

    assert again.status_code == 410
    assert error_code(again) == "TOKEN_EXPIRED"
    assert run_sql("SELECT count(*) FROM users") == [(1,)]


def test_pending_and_complete_need_a_pending_sign_up(api: TestClient) -> None:
    pending = api.get(f"{API}/auth/google/pending", headers=WEB_ORIGIN)
    completed = complete(api)

    assert (pending.status_code, error_code(pending)) == (410, "TOKEN_EXPIRED")
    assert (completed.status_code, error_code(completed)) == (410, "TOKEN_EXPIRED")


def test_complete_validates_fields_and_keeps_the_pending_sign_up(api: TestClient, google: FakeGoogle) -> None:
    sign_in_with_google(api, google)

    response = complete(api, role="super_admin", full_name="A", privacy_notice_version="")

    assert response.status_code == 422
    assert set(response.json()["error"]["details"]["fields"]) == {
        "role",
        "full_name",
        "privacy_notice_version",
    }
    assert complete(api).status_code == 201


def test_complete_is_a_conflict_if_the_email_was_registered_meanwhile(
    api: TestClient, google: FakeGoogle
) -> None:
    sign_in_with_google(api, google)
    create_user("ADA@gmail.com")

    response = complete(api)

    assert (response.status_code, error_code(response)) == (409, "EMAIL_TAKEN")


def test_complete_refuses_other_origins(api: TestClient, google: FakeGoogle) -> None:
    sign_in_with_google(api, google)

    response = api.post(
        f"{API}/auth/google/complete",
        json={"full_name": "Ada Okafor", "role": "family", "privacy_notice_version": "v"},
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403


# Existing accounts


def test_a_linked_google_user_is_signed_in_and_the_web_app_restores_the_session(
    api: TestClient, google: FakeGoogle
) -> None:
    sign_in_with_google(api, google)
    complete(api)
    api.cookies.clear()

    callback = sign_in_with_google(api, google)

    assert lands_on(callback, "/login") == {"google": "signed_in"}
    me = api.get(f"{API}/me", headers=bearer(refreshed_token(api)))
    assert me.json()["email"] == "ada@gmail.com"


def test_next_is_carried_to_the_web_app_and_unsafe_values_are_dropped(
    api: TestClient, google: FakeGoogle
) -> None:
    create_user("ada@gmail.com")

    kept = sign_in_with_google(api, google, next_path="/family/requests?tab=open")
    dropped = sign_in_with_google(api, google, next_path="//evil.example/steal")

    assert lands_on(kept, "/login") == {"google": "signed_in", "next": "/family/requests?tab=open"}
    assert lands_on(dropped, "/login") == {"google": "signed_in"}


def test_google_links_to_a_verified_account_with_the_same_email_and_its_password_still_works(
    api: TestClient, google: FakeGoogle
) -> None:
    user_id = create_user("Ada@Gmail.com", verified=True)

    callback = sign_in_with_google(api, google)

    assert lands_on(callback, "/login")["google"] == "signed_in"
    assert run_sql("SELECT google_sub FROM users WHERE id = :id", id=user_id) == [("google-sub-ada",)]
    assert login(api, "ada@gmail.com")


def test_linking_an_unverified_account_removes_its_password_and_sessions(
    api: TestClient, google: FakeGoogle
) -> None:
    # Someone registered ada@gmail.com with a password they know, without proving the address.
    user_id = create_user("ada@gmail.com", verified=False)
    login(api, "ada@gmail.com")
    squatter_refresh = api.cookies.get("hv_refresh")
    api.cookies.clear()

    callback = sign_in_with_google(api, google)

    assert lands_on(callback, "/login")["google"] == "signed_in"
    [(password_hash, verified_at)] = run_sql(
        "SELECT password_hash, email_verified_at FROM users WHERE id = :id", id=user_id
    )
    assert password_hash is None
    assert verified_at is not None
    failed = api.post(
        f"{API}/auth/login", json={"email": "ada@gmail.com", "password": "correct horse battery"}
    )
    assert error_code(failed) == "INVALID_CREDENTIALS"
    api.cookies.clear()
    api.cookies.set("hv_refresh", squatter_refresh or "", path="/api/v1/auth")
    assert api.post(f"{API}/auth/refresh", headers=WEB_ORIGIN).status_code == 401


def test_an_email_linked_to_a_different_google_account_is_refused(
    api: TestClient, google: FakeGoogle
) -> None:
    create_user("ada@gmail.com")
    run_sql("UPDATE users SET google_sub = 'another-google-account'")

    callback = sign_in_with_google(api, google)

    assert google_error(callback) == "other_google_account"
    assert "hv_refresh" not in callback.headers.get("set-cookie", "")


def test_suspended_accounts_are_refused_whether_linked_or_matched_by_email(
    api: TestClient, google: FakeGoogle
) -> None:
    user_id = create_user("ada@gmail.com")
    set_status(user_id, "suspended")

    by_email = sign_in_with_google(api, google)
    run_sql("UPDATE users SET google_sub = 'google-sub-ada'")
    by_sub = sign_in_with_google(api, google)

    assert google_error(by_email) == "suspended"
    assert google_error(by_sub) == "suspended"
    assert run_sql("SELECT count(*) FROM refresh_tokens") == [(0,)]


def test_a_google_email_google_has_not_verified_is_refused(api: TestClient, google: FakeGoogle) -> None:
    create_user("ada@gmail.com")
    unverified = GoogleIdentity(sub="google-sub-x", email="ada@gmail.com", email_verified=False, name=None)

    callback = sign_in_with_google(api, google, unverified)

    assert google_error(callback) == "email_not_verified"
    assert run_sql("SELECT google_sub FROM users") == [(None,)]


# The callback's own checks


def test_a_callback_from_another_browser_is_refused(api: TestClient, google: FakeGoogle) -> None:
    """Login CSRF: an attacker's own code and state, replayed in the victim's browser (no state cookie)."""
    started = start(api)
    authorization_url = started.headers["location"]
    code = google.consent(authorization_url, ADA)
    api.cookies.clear()

    callback = api.get(
        f"{API}/auth/google/callback",
        params={"code": code, "state": query(authorization_url)["state"]},
        follow_redirects=False,
    )

    assert google_error(callback) == "expired"
    assert google.codes  # the code was never spent


def test_a_state_works_once(api: TestClient, google: FakeGoogle) -> None:
    create_user("ada@gmail.com")
    started = start(api)
    authorization_url = started.headers["location"]
    state = query(authorization_url)["state"]
    first = api.get(
        f"{API}/auth/google/callback",
        params={"code": google.consent(authorization_url, ADA), "state": state},
        follow_redirects=False,
    )
    api.cookies.set("hv_google_state", state, path="/api/v1/auth/google")

    second = api.get(
        f"{API}/auth/google/callback",
        params={"code": google.consent(authorization_url, ADA), "state": state},
        follow_redirects=False,
    )

    assert lands_on(first, "/login")["google"] == "signed_in"
    assert google_error(second) == "expired"


def test_cancelling_on_google_and_google_failures_are_reported(api: TestClient, google: FakeGoogle) -> None:
    cancelled = api.get(
        f"{API}/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    google.down = True
    failed = sign_in_with_google(api, google)

    assert google_error(cancelled) == "cancelled"
    assert google_error(failed) == "failed"
