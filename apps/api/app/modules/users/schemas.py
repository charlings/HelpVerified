"""User payloads (api-contracts.md §3, `/me`; shape matches the web mock's `userOut`)."""

import re
import uuid
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints
from pydantic_core import PydanticCustomError

from app.modules.users.models import User

# Same rule as the web form (apps/web/src/features/auth/schemas.ts): +234 or 0, then 10 digits.
_NIGERIAN_PHONE = re.compile(r"^(\+234|0)[789][01]\d{8}$")


def _nigerian_phone(value: str) -> str:
    compact = re.sub(r"[\s()-]", "", value)
    if not _NIGERIAN_PHONE.match(compact):
        raise PydanticCustomError("phone", "Enter a Nigerian phone number, like 0803 123 4567.")
    return compact


FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Phone = Annotated[str, AfterValidator(_nigerian_phone)]


class AgencySummary(BaseModel):
    id: uuid.UUID
    name: str
    status: str


class UserOut(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": "6f1c2b0e-1d9a-4c4e-9a43-1f2b3c4d5e6f",
                    "email": "ada@example.com",
                    "full_name": "Ada Okafor",
                    "role": "family",
                    "email_verified": True,
                    "phone": None,
                    "agency": None,
                }
            ]
        }
    )

    id: uuid.UUID
    email: str
    full_name: str
    role: Literal["super_admin", "agency_admin", "family"]
    email_verified: bool
    phone: str | None
    agency: AgencySummary | None = Field(
        default=None, description="The caller's agency (agency admins, from B3)"
    )

    @classmethod
    def of(cls, user: User) -> UserOut:
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            email_verified=user.email_verified_at is not None,
            phone=user.phone,
            agency=None,
        )


class MeUpdate(BaseModel):
    """PATCH /me: only the fields sent are changed; `phone: null` removes the phone number."""

    model_config = ConfigDict(extra="forbid")

    full_name: FullName | None = None
    phone: Phone | None = None
