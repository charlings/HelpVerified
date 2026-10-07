"""Passwords (argon2id), access tokens (JWT, HS256) and opaque tokens (refresh, verify, reset).

security-and-compliance.md §4. Opaque tokens are 256-bit random values; only their
SHA-256 hash is stored, so a database leak does not reveal usable tokens.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.errors import Unauthenticated

PASSWORD_MIN = 8
PASSWORD_MAX = 128  # argon2 cost grows with input; also the web form's limit
_COMMON_PASSWORDS = Path(__file__).with_name("common_passwords.txt")
_hasher = PasswordHasher()  # argon2id with the library's current recommended parameters
# Verified against when the email is unknown, so a miss takes as long as a wrong password.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


@lru_cache
def _common_passwords() -> frozenset[str]:
    lines = _COMMON_PASSWORDS.read_text(encoding="utf-8").splitlines()
    return frozenset(line.strip().lower() for line in lines if line.strip() and not line.startswith("#"))


def password_problem(password: str) -> str | None:
    """Why a new password is not acceptable, or None. Messages are shown next to the field."""
    if len(password) < PASSWORD_MIN:
        return f"Use at least {PASSWORD_MIN} characters."
    if len(password) > PASSWORD_MAX:
        return f"Use {PASSWORD_MAX} characters or fewer."
    if password.lower() in _common_passwords():
        return "This password is too common. Choose something harder to guess."
    return None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-effort check: a missing hash (unknown email, Google-only account) still runs argon2."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except VerificationError, InvalidHashError:
        return False


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    role: str


def encode_access_token(user_id: uuid.UUID, role: str, secret: str, now: datetime, ttl: timedelta) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str, secret: str, now: datetime) -> AccessClaims:
    """Raises Unauthenticated for anything other than a valid, unexpired token we signed."""
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["sub", "role", "exp", "iat"], "verify_exp": False},
        )
        if int(payload["exp"]) <= int(now.timestamp()):
            raise Unauthenticated("Your session has expired. Please sign in again.")
        return AccessClaims(user_id=uuid.UUID(payload["sub"]), role=str(payload["role"]))
    except (jwt.InvalidTokenError, ValueError, KeyError) as exc:
        raise Unauthenticated() from exc
