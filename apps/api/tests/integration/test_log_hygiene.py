"""Logs never contain passwords, tokens or one-time links (spec item 21)."""

import pytest
from fastapi.testclient import TestClient

from tests.fakes import MemoryEmailSender
from tests.helpers import API, bearer, signup_body

NEW_PASSWORD = "an entirely new phrase"


def test_auth_flows_leave_no_secrets_in_the_logs(
    api: TestClient, outbox: MemoryEmailSender, capsys: pytest.CaptureFixture[str]
) -> None:
    body = signup_body()
    api.post(f"{API}/auth/signup", json=body)
    verify_token = outbox.token("verify_email")
    api.post(f"{API}/auth/verify-email", json={"token": verify_token})
    login = api.post(f"{API}/auth/login", json={"email": body["email"], "password": body["password"]})
    access_token = login.json()["access_token"]
    refresh_token = api.cookies.get("hv_refresh", path="/api/v1/auth")
    api.get(f"{API}/me", headers=bearer(access_token))
    api.post(f"{API}/auth/refresh")
    api.post(f"{API}/auth/forgot-password", json={"email": body["email"]})
    reset_token = outbox.token("reset_password")
    api.post(f"{API}/auth/reset-password", json={"token": reset_token, "password": NEW_PASSWORD})

    logs = capsys.readouterr()
    output = logs.out + logs.err
    assert '"request"' in output  # the access log was captured
    for secret in (body["password"], NEW_PASSWORD, verify_token, reset_token, access_token, refresh_token):
        assert secret
        assert secret not in output
