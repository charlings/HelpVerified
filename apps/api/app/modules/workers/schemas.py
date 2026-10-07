"""Worker payloads (api-contracts.md §4 WorkerOut; shape from apps/web/src/mocks/domain.ts workerOut).
Responses never include the NIN hash; only the last 4 digits."""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    StringConstraints,
    ValidationInfo,
    field_validator,
)
from pydantic_core import PydanticCustomError

from app.core.validation import Lga, NigerianState
from app.modules.agencies.models import Agency
from app.modules.placements.models import Placement
from app.modules.workers.models import Worker

RoleName = Literal["nanny", "driver", "cleaner"]
ListingName = Literal["draft", "listed", "delisted", "suspended"]
StatusName = Literal["not_started", "submitted", "verified", "rejected", "expired"]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Language = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Kobo = Annotated[int, Field(gt=0, le=10**12)]


def _salary_range(low: int | None, high: int | None) -> None:
    if low is not None and high is not None and low > high:
        raise PydanticCustomError("salary_range", "The maximum must be at least the minimum.")


class WorkerCreate(BaseModel):
    """POST /workers. The NIN is accepted once and never returned or stored in clear (security §1)."""

    full_name: FullName
    role: RoleName
    years_experience: Annotated[int, Field(ge=0, le=60)]
    languages: Annotated[list[Language], Field(min_length=1, max_length=10)]
    live_in_ok: bool
    state: NigerianState
    lga: Lga
    expected_salary_min_kobo: Kobo | None = None
    expected_salary_max_kobo: Kobo | None = None
    bio: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    nin: SecretStr = Field(description="11-digit NIN; stored only as a keyed hash plus the last 4 digits")
    consent: Literal[True] = Field(
        description="The agency confirms the worker agreed to collection and sharing"
    )

    @field_validator("nin")
    @classmethod
    def _eleven_digits(cls, value: SecretStr) -> SecretStr:
        digits = value.get_secret_value().strip()
        if not (len(digits) == 11 and digits.isdigit()):
            raise PydanticCustomError("nin", "A NIN has exactly 11 digits.")
        return SecretStr(digits)

    @field_validator("expected_salary_max_kobo")
    @classmethod
    def _check_salary(cls, high: int | None, info: ValidationInfo) -> int | None:
        _salary_range(info.data.get("expected_salary_min_kobo"), high)
        return high


class WorkerUpdate(BaseModel):
    """PATCH /workers/{id}: profile fields only. The NIN, role and listing are not edited here."""

    model_config = ConfigDict(extra="forbid")

    full_name: FullName | None = None
    years_experience: Annotated[int, Field(ge=0, le=60)] | None = None
    languages: Annotated[list[Language], Field(min_length=1, max_length=10)] | None = None
    live_in_ok: bool | None = None
    state: NigerianState | None = None
    lga: Lga | None = None
    expected_salary_min_kobo: Kobo | None = None
    expected_salary_max_kobo: Kobo | None = None
    bio: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class ActivePlacement(BaseModel):
    id: uuid.UUID
    status: Literal["pending_payment", "trial", "confirmed"]
    trial_ends_on: date | None


class Verification(BaseModel):
    id: StatusName
    guarantor: StatusName
    references: StatusName
    address: StatusName


class WorkerOut(BaseModel):
    id: uuid.UUID
    full_name: str
    role: RoleName
    years_experience: int
    languages: list[str]
    live_in_ok: bool
    state: str
    lga: str
    expected_salary_min_kobo: int | None
    expected_salary_max_kobo: int | None
    bio: str | None
    photo_url: str | None
    nin_last4: str
    listing_status: ListingName
    listed_at: datetime | None
    available: bool = Field(description="No active placement (rule 2)")
    active_placement: ActivePlacement | None
    verification: Verification
    verified_count: int
    created_at: datetime

    @classmethod
    def of(
        cls,
        worker: Worker,
        statuses: dict[str, str],
        photo_url: str | None = None,
        active: Placement | None = None,
    ) -> WorkerOut:
        return cls(
            id=worker.id,
            full_name=worker.full_name,
            role=worker.role.value,
            years_experience=worker.years_experience,
            languages=list(worker.languages),
            live_in_ok=worker.live_in_ok,
            state=worker.state,
            lga=worker.lga,
            expected_salary_min_kobo=worker.expected_salary_min_kobo,
            expected_salary_max_kobo=worker.expected_salary_max_kobo,
            bio=worker.bio,
            photo_url=photo_url,
            nin_last4=worker.nin_last4,
            listing_status=worker.listing_status.value,
            listed_at=worker.listed_at,
            available=active is None,
            active_placement=ActivePlacement(
                id=active.id,
                status=active.status.value,
                trial_ends_on=active.trial_ends_on,
            )
            if active
            else None,
            verification=Verification.model_validate(statuses),
            verified_count=sum(1 for s in statuses.values() if s == "verified"),
            created_at=worker.created_at,
        )


class AgencyRef(BaseModel):
    id: uuid.UUID
    name: str


class AdminWorkerOut(WorkerOut):
    agency: AgencyRef

    @classmethod
    def with_agency(
        cls, worker: Worker, agency: Agency, statuses: dict[str, str], active: Placement | None = None
    ) -> AdminWorkerOut:
        return cls(
            **WorkerOut.of(worker, statuses, active=active).model_dump(),
            agency=AgencyRef(id=agency.id, name=agency.name),
        )
