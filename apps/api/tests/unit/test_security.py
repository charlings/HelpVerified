import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.errors import Unauthenticated
from app.core.security import (
    decode_access_token,
    encode_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    password_problem,
    verify_password,
)

SECRET = "a-test-secret-that-is-long-enough-123456"
NOW = datetime(2026, 10, 7, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("password", "problem"),
    [
        ("short", "at least 8"),
        ("x" * 129, "128 characters or fewer"),
        ("password123", "too common"),
        ("PassWord123", "too common"),  # case-insensitive
        ("Nigeria2026", "too common"),
    ],
)
def test_weak_passwords_are_rejected(password: str, problem: str) -> None:
    assert problem in (password_problem(password) or "")


def test_reasonable_password_is_accepted() -> None:
    assert password_problem("correct horse battery") is None


def test_password_hash_is_argon2id_and_verifies() -> None:
    hashed = hash_password("correct horse battery")

    assert hashed.startswith("$argon2id$")
    assert verify_password("correct horse battery", hashed)
    assert not verify_password("wrong password", hashed)


def test_missing_hash_never_verifies() -> None:
    assert not verify_password("anything at all", None)
    assert not verify_password("anything at all", "not-a-hash")


def test_opaque_tokens_are_random_and_hashed() -> None:
    token = new_opaque_token()

    assert len(token) >= 43  # 256 bits, URL-safe base64
    assert token != new_opaque_token()
    assert hash_token(token) == hash_token(token)
    assert token not in hash_token(token)


def test_access_token_round_trip() -> None:
    user_id = uuid.uuid4()
    token = encode_access_token(user_id, "family", SECRET, NOW, timedelta(minutes=15))

    claims = decode_access_token(token, SECRET, NOW + timedelta(minutes=14))

    assert claims.user_id == user_id
    assert claims.role == "family"


@pytest.mark.parametrize(
    "tamper",
    [
        pytest.param(lambda t: t, id="expired"),
        pytest.param(lambda t: t[:-2] + ("AA" if t[-2:] != "AA" else "BB"), id="bad-signature"),
        pytest.param(lambda t: "not.a.jwt", id="garbage"),
        pytest.param(
            lambda t: jwt.encode({"sub": "x", "role": "family", "exp": 9e9, "iat": 0}, "other-secret-" * 4),
            id="other-secret",
        ),
        pytest.param(
            lambda t: jwt.encode({"sub": str(uuid.uuid4()), "role": "family"}, SECRET), id="no-expiry"
        ),
    ],
)
def test_invalid_access_tokens_are_unauthenticated(tamper: object) -> None:
    token = encode_access_token(uuid.uuid4(), "family", SECRET, NOW, timedelta(minutes=15))

    with pytest.raises(Unauthenticated):
        decode_access_token(tamper(token), SECRET, NOW + timedelta(minutes=16))  # type: ignore[operator]
