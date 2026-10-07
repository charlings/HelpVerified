"""Refresh rotation and reuse, logout, email verification and password reset (spec items 13, 14)."""

from datetime import UTC, datetime, timedelta

import time_machine
from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.fakes import MemoryEmailSender
from tests.helpers import API, PASSWORD, WEB_ORIGIN, bearer, create_user, error_code, login, signup_body


def refresh_cookie(api: TestClient) -> str | None:
    value: str | None = api.cookies.get("hv_refresh", path="/api/v1/auth")
    return value


# Refresh


def test_refresh_rotates_the_cookie_and_returns_a_new_token(api: TestClient) -> None:
    create_user()
    login(api)
    first = refresh_cookie(api)

    response = api.post(f"{API}/auth/refresh", headers=WEB_ORIGIN)

    assert response.status_code == 200
    assert api.get(f"{API}/me", headers=bearer(response.json()["access_token"])).status_code == 200
    assert refresh_cookie(api) not in (None, first)


def test_reusing_a_rotated_refresh_token_revokes_the_whole_chain(api: TestClient) -> None:
    create_user()
    login(api)
    stolen = refresh_cookie(api)
    assert api.post(f"{API}/auth/refresh").status_code == 200  # legitimate rotation
    current = refresh_cookie(api)

    api.cookies.set("hv_refresh", stolen or "", path="/api/v1/auth")
    reuse = api.post(f"{API}/auth/refresh")

    assert reuse.status_code == 401
    assert error_code(reuse) == "UNAUTHENTICATED"
    # The legitimate, newer token is now dead too: the user must sign in again.
    api.cookies.set("hv_refresh", current or "", path="/api/v1/auth")
    assert api.post(f"{API}/auth/refresh").status_code == 401
    [(live,)] = run_sql("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL")
    assert live == 0


def test_refresh_needs_a_cookie_and_an_unexpired_token(api: TestClient) -> None:
    create_user()

    assert error_code(api.post(f"{API}/auth/refresh")) == "UNAUTHENTICATED"
    login(api)
    with time_machine.travel(datetime.now(UTC) + timedelta(days=15), tick=False):
        assert api.post(f"{API}/auth/refresh").status_code == 401


def test_refresh_and_logout_reject_other_origins(api: TestClient) -> None:
    create_user()
    login(api)

    evil = {"Origin": "https://evil.example"}

    assert error_code(api.post(f"{API}/auth/refresh", headers=evil)) == "FORBIDDEN"
    assert error_code(api.post(f"{API}/auth/logout", headers=evil)) == "FORBIDDEN"


def test_logout_ends_the_session(api: TestClient) -> None:
    create_user()
    login(api)

    response = api.post(f"{API}/auth/logout", headers=WEB_ORIGIN)

    assert response.status_code == 204
    assert response.content == b""
    assert 'hv_refresh=""' in response.headers["set-cookie"] or "Max-Age=0" in response.headers["set-cookie"]
    [(live,)] = run_sql("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL")
    assert live == 0


def test_logout_without_a_session_is_fine(api: TestClient) -> None:
    assert api.post(f"{API}/auth/logout").status_code == 204


# Email verification


def test_verify_email_link_works_once(api: TestClient, outbox: MemoryEmailSender) -> None:
    api.post(f"{API}/auth/signup", json=signup_body(role="agency_admin"))
    token = outbox.token("verify_email")

    first = api.post(f"{API}/auth/verify-email", json={"token": token})
    second = api.post(f"{API}/auth/verify-email", json={"token": token})

    assert first.status_code == 200
    assert first.json() == {"verified": True, "role": "agency_admin"}
    assert second.status_code == 410
    assert error_code(second) == "TOKEN_EXPIRED"
    assert api.get(f"{API}/me", headers=bearer(login(api))).json()["email_verified"] is True


def test_verify_email_link_expires_after_24_hours(api: TestClient, outbox: MemoryEmailSender) -> None:
    api.post(f"{API}/auth/signup", json=signup_body())
    token = outbox.token("verify_email")

    with time_machine.travel(datetime.now(UTC) + timedelta(hours=24, seconds=1), tick=False):
        response = api.post(f"{API}/auth/verify-email", json={"token": token})

    assert response.status_code == 410


def test_unknown_verify_token_is_expired(api: TestClient) -> None:
    assert error_code(api.post(f"{API}/auth/verify-email", json={"token": "made-up"})) == "TOKEN_EXPIRED"


def test_resend_verification_replaces_the_old_link(api: TestClient, outbox: MemoryEmailSender) -> None:
    api.post(f"{API}/auth/signup", json=signup_body())
    old = outbox.token("verify_email")

    response = api.post(f"{API}/auth/resend-verification", json={"email": "ada@example.com"})
    new = outbox.token("verify_email")

    assert response.status_code == 202
    assert response.content == b""
    assert new != old
    assert api.post(f"{API}/auth/verify-email", json={"token": old}).status_code == 410
    assert api.post(f"{API}/auth/verify-email", json={"token": new}).status_code == 200


def test_resend_says_nothing_about_unknown_or_verified_emails(
    api: TestClient, outbox: MemoryEmailSender
) -> None:
    create_user("verified@example.com", verified=True)

    unknown = api.post(f"{API}/auth/resend-verification", json={"email": "nobody@example.com"})
    verified = api.post(f"{API}/auth/resend-verification", json={"email": "verified@example.com"})

    assert unknown.status_code == verified.status_code == 202
    assert outbox.sent == []


# Password reset


def test_password_reset_flow(api: TestClient, outbox: MemoryEmailSender) -> None:
    create_user()
    login(api)  # an existing session, which the reset must end

    assert api.post(f"{API}/auth/forgot-password", json={"email": "ada@example.com"}).status_code == 202
    token = outbox.token("reset_password", "ada@example.com")
    response = api.post(f"{API}/auth/reset-password", json={"token": token, "password": "a brand new phrase"})

    assert response.status_code == 204
    assert api.post(f"{API}/auth/refresh").status_code == 401  # signed out everywhere
    old = api.post(f"{API}/auth/login", json={"email": "ada@example.com", "password": PASSWORD})
    assert old.status_code == 401
    assert login(api, password="a brand new phrase")
    reused = api.post(f"{API}/auth/reset-password", json={"token": token, "password": "another new phrase"})
    assert reused.status_code == 410


def test_reset_link_expires_after_an_hour(api: TestClient, outbox: MemoryEmailSender) -> None:
    create_user()
    api.post(f"{API}/auth/forgot-password", json={"email": "ada@example.com"})
    token = outbox.token("reset_password")

    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=61), tick=False):
        response = api.post(
            f"{API}/auth/reset-password", json={"token": token, "password": "a brand new phrase"}
        )

    assert response.status_code == 410


def test_reset_rejects_a_weak_password(api: TestClient, outbox: MemoryEmailSender) -> None:
    create_user()
    api.post(f"{API}/auth/forgot-password", json={"email": "ada@example.com"})

    response = api.post(
        f"{API}/auth/reset-password", json={"token": outbox.token("reset_password"), "password": "12345678"}
    )

    assert response.status_code == 422
    assert "password" in response.json()["error"]["details"]["fields"]


def test_forgot_password_says_nothing_about_unknown_emails(
    api: TestClient, outbox: MemoryEmailSender
) -> None:
    response = api.post(f"{API}/auth/forgot-password", json={"email": "nobody@example.com"})

    assert response.status_code == 202
    assert outbox.sent == []
