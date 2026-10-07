"""Exceeding each rate limit returns 429 RATE_LIMITED with Retry-After (spec item 17)."""

from datetime import UTC, datetime, timedelta

import time_machine
from fastapi.testclient import TestClient

from tests.conftest import ApiFactory
from tests.helpers import API, PASSWORD, bearer, create_user, error_code, login, signup_body


def assert_limited(response: object) -> None:
    assert response.status_code == 429  # type: ignore[attr-defined]
    assert error_code(response) == "RATE_LIMITED"
    assert int(response.headers["retry-after"]) >= 1  # type: ignore[attr-defined]


def test_login_allows_5_attempts_a_minute_per_ip_and_email(api: TestClient) -> None:
    create_user()
    attempt = {"email": "ada@example.com", "password": "wrong password"}
    start = datetime.now(UTC)

    with time_machine.travel(start, tick=False):
        for _ in range(5):
            assert api.post(f"{API}/auth/login", json=attempt).status_code == 401
        limited = api.post(f"{API}/auth/login", json=attempt)
        # Even the right password waits: the limit is checked before the credentials.
        right = api.post(f"{API}/auth/login", json={"email": "ada@example.com", "password": PASSWORD})
        other_email = api.post(f"{API}/auth/login", json={"email": "bola@example.com", "password": "x"})

    assert_limited(limited)
    assert int(limited.headers["retry-after"]) <= 60
    assert_limited(right)
    assert other_email.status_code == 401  # a different email has its own window
    with time_machine.travel(start + timedelta(seconds=61), tick=False):
        assert (
            api.post(f"{API}/auth/login", json={"email": "ada@example.com", "password": PASSWORD}).status_code
            == 200
        )


def test_signup_is_limited_per_ip_and_email(api: TestClient) -> None:
    body = signup_body("x@example.com")
    assert api.post(f"{API}/auth/signup", json=body).status_code == 201
    for _ in range(4):
        assert api.post(f"{API}/auth/signup", json=body).status_code == 409

    assert_limited(api.post(f"{API}/auth/signup", json=body))


def test_reset_and_resend_allow_3_an_hour_per_email(api: TestClient) -> None:
    for _ in range(3):
        assert api.post(f"{API}/auth/forgot-password", json={"email": "ada@example.com"}).status_code == 202

    assert_limited(api.post(f"{API}/auth/forgot-password", json={"email": "ADA@example.com"}))
    assert_limited(api.post(f"{API}/auth/resend-verification", json={"email": "ada@example.com"}))
    assert api.post(f"{API}/auth/forgot-password", json={"email": "bola@example.com"}).status_code == 202


def test_signed_in_calls_are_limited_per_user(make_api: ApiFactory) -> None:
    api = make_api(RATE_LIMIT_USER_PER_MIN=3)
    create_user()
    headers = bearer(login(api))

    for _ in range(3):
        assert api.get(f"{API}/me", headers=headers).status_code == 200

    assert_limited(api.get(f"{API}/me", headers=headers))
