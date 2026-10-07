"""Helpers for API tests: create accounts and sign in."""

import uuid
from typing import Any

from fastapi.testclient import TestClient

from app.core.security import hash_password
from tests.conftest import run_sql

API = "/api/v1"
PASSWORD = "correct horse battery"
WEB_ORIGIN = {"Origin": "http://localhost:3000"}


def signup_body(email: str = "ada@example.com", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "email": email,
        "password": PASSWORD,
        "full_name": "Ada Okafor",
        "role": "family",
        "privacy_notice_version": "2026-10-05",
    }
    return body | overrides


def create_user(
    email: str = "ada@example.com",
    *,
    role: str = "family",
    verified: bool = True,
    status: str = "active",
    password: str = PASSWORD,
) -> uuid.UUID:
    """Inserts a user directly (super admins and suspended users can't sign up)."""
    user_id = uuid.uuid4()
    run_sql(
        "INSERT INTO users (id, email, password_hash, full_name, role, status, email_verified_at) VALUES "
        "(:id, :email, :hash, 'Test User', CAST(:role AS user_role), CAST(:status AS account_status), "
        "CASE WHEN :verified THEN now() END)",
        id=user_id,
        email=email,
        hash=hash_password(password),
        role=role,
        status=status,
        verified=verified,
    )
    return user_id


def set_status(user_id: uuid.UUID, status: str) -> None:
    run_sql(
        "UPDATE users SET status = CAST(:status AS account_status) WHERE id = :id", status=status, id=user_id
    )


def login(api: TestClient, email: str = "ada@example.com", password: str = PASSWORD) -> str:
    response = api.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def error_code(response: Any) -> str:
    code: str = response.json()["error"]["code"]
    return code
