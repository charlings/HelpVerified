"""Placement payloads (api-contracts.md §4 PlacementOut; shape from the web mock's placements-domain.ts)."""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.validation import Reason
from app.modules.placements.state_machine import PlacementAction
from app.modules.requests.schemas import AgencyRef, FamilyRequestOut, WorkerRef

StatusName = Literal["pending_payment", "trial", "confirmed", "ended", "cancelled"]
EndReasonName = Literal[
    "completed", "replaced", "family_ended", "agency_ended", "worker_left", "payment_expired", "admin_ended"
]


class FamilyRef(BaseModel):
    id: uuid.UUID
    name: str


class PlacementSummary(BaseModel):
    id: uuid.UUID
    status: StatusName
    worker: WorkerRef
    family: FamilyRef
    agency: AgencyRef
    request_id: uuid.UUID
    hold_expires_at: datetime | None = Field(description="While awaiting payment: when the hold lapses")
    trial_starts_on: date | None
    trial_ends_on: date | None
    confirmed_at: datetime | None
    ended_at: datetime | None
    end_reason: EndReasonName | None
    replacements_used: int
    created_at: datetime


class EventOut(BaseModel):
    from_: StatusName | None = Field(alias="from", serialization_alias="from")
    to: StatusName
    at: datetime
    actor: Literal["family", "agency", "admin", "system"]
    reason: str | None

    model_config = {"populate_by_name": True}


class PlacementOut(PlacementSummary):
    allowed_actions: list[PlacementAction] = Field(
        description="What the caller may do next (server-computed)"
    )
    events: list[EventOut]


class CheckoutOut(BaseModel):
    authorization_url: str
    reference: str


class AcceptOut(BaseModel):
    placement: PlacementSummary
    payment: CheckoutOut | None = Field(description="null when the fee is waived (a free replacement)")


class ReasonIn(BaseModel):
    reason: Reason


class ReplacementOut(BaseModel):
    placement: PlacementOut
    new_request: FamilyRequestOut
