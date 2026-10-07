"""User payloads (api-contracts.md §3, `/me`; shape matches the web mock's `userOut`)."""

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.validation import Phone
from app.modules.agencies.models import Agency
from app.modules.users.models import User

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]


class AgencySummary(BaseModel):
    id: uuid.UUID
    name: str
    status: Literal["pending", "approved", "suspended", "rejected"]


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
        default=None, description="The caller's agency (agency admins who have registered one)"
    )

    @classmethod
    def of(cls, user: User, agency: Agency | None = None) -> UserOut:
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            email_verified=user.email_verified_at is not None,
            phone=user.phone,
            agency=AgencySummary(id=agency.id, name=agency.name, status=agency.status.value)
            if agency
            else None,
        )


class MeUpdate(BaseModel):
    """PATCH /me: only the fields sent are changed; `phone: null` removes the phone number."""

    model_config = ConfigDict(extra="forbid")

    full_name: FullName | None = None
    phone: Phone | None = None
