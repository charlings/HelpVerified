"""Agency payloads (api-contracts.md §3 and §4; shapes from apps/web/src/mocks/handlers/agencies.ts,
agency-dashboard.ts and admin-domain.ts)."""

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints
from pydantic_core import PydanticCustomError

from app.core.validation import Lga, NigerianState, Phone
from app.modules.agencies.models import Agency

_CAC = re.compile(r"^(RC|BN|IT)\s?(\d{4,8})$", re.IGNORECASE)
AgencyStatusName = Literal["pending", "approved", "suspended", "rejected"]
RoleName = Literal["nanny", "driver", "cleaner"]


def normalise_cac(value: str) -> str:
    """'rc1234567' and 'RC 1234567' are the same number; stored as 'RC 1234567'."""
    match = _CAC.match(value.strip())
    if not match:
        raise PydanticCustomError("cac_number", "Enter your CAC number, like RC 1234567 or BN 1234567.")
    return f"{match.group(1).upper()} {match.group(2)}"


def _unique_roles(value: list[RoleName]) -> list[RoleName]:
    return list(dict.fromkeys(value))


Roles = Annotated[list[RoleName], Field(min_length=1, max_length=3), AfterValidator(_unique_roles)]


class AgencyCreate(BaseModel):
    """POST /agencies (onboarding). Rules match the web form's agencySchema."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    cac_number: Annotated[str, AfterValidator(normalise_cac)]
    email: EmailStr
    phone: Phone
    address_line: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
    state: NigerianState
    lga: Lga
    roles_offered: Roles


class AgencyUpdate(BaseModel):
    """PATCH /agencies/me: contact and coverage details. Name and CAC number are fixed once registered."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    phone: Phone | None = None
    address_line: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)] | None
    ) = None
    state: NigerianState | None = None
    lga: Lga | None = None
    roles_offered: Roles | None = None


class AgencyCreated(BaseModel):
    id: uuid.UUID
    name: str
    status: AgencyStatusName


class AgencyProfile(BaseModel):
    id: uuid.UUID
    name: str
    cac_number: str
    email: str
    phone: str
    address_line: str
    state: str
    lga: str
    roles_offered: list[RoleName]
    status: AgencyStatusName
    created_at: datetime

    @classmethod
    def of(cls, agency: Agency) -> AgencyProfile:
        return cls(
            id=agency.id,
            name=agency.name,
            cac_number=agency.cac_number,
            email=agency.email,
            phone=agency.phone,
            address_line=agency.address_line,
            state=agency.state,
            lga=agency.lga,
            roles_offered=[r.value for r in agency.roles_offered],
            status=agency.status.value,
            created_at=agency.created_at,
        )


class SubscriptionOut(BaseModel):
    status: Literal["active", "non_renewing", "past_due", "cancelled"]
    current_period_end: datetime | None


class WorkerCounts(BaseModel):
    total: int
    draft: int
    listed: int
    delisted: int
    suspended: int


class DashboardAgency(BaseModel):
    id: uuid.UUID
    name: str
    status: AgencyStatusName
    status_reason: str | None


class TrialEnding(BaseModel):
    id: uuid.UUID
    worker_name: str
    family_name: str
    trial_ends_on: date


class AgencyDashboard(BaseModel):
    agency: DashboardAgency
    subscription: SubscriptionOut | None
    active: bool = Field(description="Approved with an active subscription: may list workers and propose")
    workers: WorkerCounts
    checks_needing_attention: int
    open_requests: int = Field(description="Open requests matching the agency's roles and state (from B4)")
    trials_ending: list[TrialEnding] = Field(description="Trials ending within 3 days (from B4)")
