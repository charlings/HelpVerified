"""Auth payloads (api-contracts.md §3, `/auth`; shapes match apps/web/src/mocks/handlers/auth.ts)."""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints
from pydantic_core import PydanticCustomError

from app.core.security import PASSWORD_MAX, password_problem
from app.modules.users.schemas import FullName, UserOut


def _acceptable_password(value: str) -> str:
    problem = password_problem(value)
    if problem:
        raise PydanticCustomError("password", problem)
    return value


NewPassword = Annotated[str, AfterValidator(_acceptable_password)]
Token = Annotated[str, StringConstraints(min_length=1, max_length=200)]


class SignupIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "ada@example.com",
                    "password": "a long passphrase",
                    "full_name": "Ada Okafor",
                    "role": "family",
                    "privacy_notice_version": "2026-10-05",
                }
            ]
        }
    )

    email: EmailStr
    password: NewPassword
    full_name: FullName
    role: Literal["family", "agency_admin"]
    privacy_notice_version: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
    ]


class SignupOut(BaseModel):
    user: UserOut


class LoginIn(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=PASSWORD_MAX)]


class LoginOut(BaseModel):
    access_token: str
    user: UserOut


class RefreshOut(BaseModel):
    access_token: str


class EmailIn(BaseModel):
    email: EmailStr


class VerifyEmailIn(BaseModel):
    token: Token


class VerifyEmailOut(BaseModel):
    verified: Literal[True]
    role: Literal["super_admin", "agency_admin", "family"]


class ResetPasswordIn(BaseModel):
    token: Token
    password: NewPassword


PrivacyNoticeVersion = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class GooglePendingOut(BaseModel):
    """The Google identity waiting to become an account (`GET /auth/google/pending`)."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"email": "ada@gmail.com", "full_name": "Ada Okafor"}]}
    )

    email: str
    full_name: str | None = Field(description="The name on the Google account, if it has one")


class GoogleCompleteIn(BaseModel):
    """`POST /auth/google/complete`: what Google can't tell us. The email comes from Google."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"full_name": "Ada Okafor", "role": "family", "privacy_notice_version": "2026-10-05"}
            ]
        }
    )

    full_name: FullName
    role: Literal["family", "agency_admin"]
    privacy_notice_version: PrivacyNoticeVersion
