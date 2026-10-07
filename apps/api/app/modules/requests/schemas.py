"""Request and proposal payloads (api-contracts.md §3, §4; shapes from apps/web/src/mocks/family-domain.ts and
placements-domain.ts)."""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, ValidationInfo, field_validator
from pydantic_core import PydanticCustomError

from app.core.validation import Lga, NigerianState

RoleName = Literal["nanny", "driver", "cleaner"]
RequestStatusName = Literal["open", "matched", "cancelled", "closed"]
ProposalStatusName = Literal["pending", "accepted", "declined", "withdrawn", "superseded"]
Kobo = Annotated[int, Field(gt=0, le=10**12)]


class RequestCreate(BaseModel):
    """POST /requests. Rules match the web form's createRequestSchema; the start date is checked in the
    service against today's date in Nigeria."""

    role: RoleName
    schedule: Literal["full_time", "part_time"]
    live_in: bool
    state: NigerianState
    lga: Lga
    start_date: date
    trial_days: Annotated[int, Field(ge=7, le=30)]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=80)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=1500)]
    budget_min_kobo: Kobo | None = None
    budget_max_kobo: Kobo | None = None

    @field_validator("budget_max_kobo")
    @classmethod
    def _budget_range(cls, high: int | None, info: ValidationInfo) -> int | None:
        low = info.data.get("budget_min_kobo")
        if low is not None and high is not None and low > high:
            raise PydanticCustomError("budget_range", "The maximum must be at least the minimum.")
        return high


class RequestFields(BaseModel):
    id: uuid.UUID
    role: RoleName
    title: str
    description: str
    schedule: Literal["full_time", "part_time"]
    live_in: bool
    state: str
    lga: str
    budget_min_kobo: int | None
    budget_max_kobo: int | None
    start_date: date
    trial_days: int
    status: RequestStatusName
    created_at: datetime


class FamilyRequestOut(RequestFields):
    proposals_count: int = Field(description="Proposals the family can see (withdrawn ones are hidden)")
    pending_proposals: int
    replaces_placement_id: uuid.UUID | None
    placement_id: uuid.UUID | None = Field(description="The latest placement made from this request")


class AgencyRequestOut(RequestFields):
    my_proposals: int = Field(description="Proposals the caller's agency has made for this request")


class ProposalCreate(BaseModel):
    worker_id: uuid.UUID
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class WorkerRef(BaseModel):
    id: uuid.UUID
    full_name: str
    role: RoleName


class AgencyProposalOut(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    worker: WorkerRef
    note: str | None
    status: ProposalStatusName
    created_at: datetime


class Badge(BaseModel):
    kind: Literal["id", "guarantor", "references", "address"]
    verified_at: datetime


class AgencyRef(BaseModel):
    id: uuid.UUID
    name: str


class WorkerPublicOut(BaseModel):
    """What a family may see of a worker: first name, role, experience, languages, agency and the dates
    their checks were verified. No surname, NIN digits, address, contacts or documents (security §1)."""

    id: uuid.UUID
    first_name: str
    role: RoleName
    years_experience: int
    languages: list[str]
    live_in_ok: bool
    agency: AgencyRef
    badges: list[Badge]
    available: bool


class FamilyProposalOut(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    worker: WorkerPublicOut
    note: str | None
    status: ProposalStatusName
    created_at: datetime
