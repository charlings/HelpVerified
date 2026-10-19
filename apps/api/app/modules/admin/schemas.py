"""Super-admin payloads (api-contracts.md "Admin payloads (M7)"; mock: admin-domain.ts, admin.ts)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, cast

from pydantic import BaseModel, Field, StringConstraints

from app.core.validation import Reason
from app.modules.admin.models import AuditAction, AuditLog
from app.modules.agencies.models import Agency
from app.modules.agencies.schemas import AgencyStatusName, RoleName, SubscriptionOut, WorkerCounts
from app.modules.users.models import User
from app.modules.verification.schemas import ItemOut, KindName
from app.modules.workers.schemas import AdminWorkerOut

AgencyAction = Literal["approve", "reject", "suspend", "reinstate"]
AuditEntity = Literal["agency", "worker", "placement", "document", "alert"]
AlertKindName = Literal[
    "checkout_unresolved",
    "unmatched_charge",
    "refund_attention",
    "refund_stuck",
    "refund_admin_review",
    "late_payment",
    "duplicate_charge",
    "settlement_failed",
    "legacy_unresolved",
]
AlertStateName = Literal["open", "acknowledged", "resolved"]


class Actor(BaseModel):
    id: uuid.UUID
    name: str
    role: Literal["super_admin", "agency_admin", "family"]


class AuditEntry(BaseModel):
    id: str
    action: AuditAction
    actor: Actor | None
    entity: AuditEntity
    entity_id: uuid.UUID | None
    entity_label: str
    worker_id: uuid.UUID | None
    reason: str | None
    created_at: datetime

    @classmethod
    def of(cls, entry: AuditLog, actor: User | None) -> AuditEntry:
        data: dict[str, Any] = entry.data or {}
        return cls(
            id=str(entry.id),
            action=AuditAction(entry.action),
            actor=Actor(id=actor.id, name=actor.full_name, role=actor.role.value) if actor else None,
            entity=cast(AuditEntity, entry.entity),
            entity_id=entry.entity_id,
            entity_label=str(data.get("label", "")),
            worker_id=data.get("worker_id"),
            reason=data.get("reason"),
            created_at=entry.created_at,
        )


class AdminAgencySummary(BaseModel):
    id: uuid.UUID
    name: str
    cac_number: str
    state: str
    lga: str
    roles_offered: list[RoleName]
    status: AgencyStatusName
    workers_total: int
    created_at: datetime

    @classmethod
    def of(cls, agency: Agency, workers_total: int) -> AdminAgencySummary:
        return cls(
            id=agency.id,
            name=agency.name,
            cac_number=agency.cac_number,
            state=agency.state,
            lga=agency.lga,
            roles_offered=[r.value for r in agency.roles_offered],
            status=agency.status.value,
            workers_total=workers_total,
            created_at=agency.created_at,
        )


class AgencyAdmin(BaseModel):
    full_name: str
    email: str


class AdminAgencyDetail(AdminAgencySummary):
    email: str
    phone: str
    address_line: str
    approved_at: datetime | None
    status_reason: str | None
    admin: AgencyAdmin | None
    subscription: SubscriptionOut | None
    workers: WorkerCounts
    active_placements: int
    history: list[AuditEntry]
    allowed_actions: list[AgencyAction]


class AdminOverview(BaseModel):
    agencies_pending: int
    workers_listed: int
    placements_active: int
    trials_ending_soon: int = Field(description="Trials ending within the next 3 days")
    fees_paid_this_month_kobo: int = Field(description="Placement fees paid this calendar month (WAT)")
    open_alerts: int = Field(default=0, description="Unresolved payment and refund alerts (ADR 0017)")
    pending_agencies: list[AdminAgencySummary]
    recent_audit: list[AuditEntry]


class AgencyActionIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class FlagIn(BaseModel):
    kind: KindName
    reason: Reason


class AdminWorkerDetail(AdminWorkerOut):
    checks: list[ItemOut]


class AlertOut(BaseModel):
    """A persistent admin alert (ADR 0017 section F). `acknowledged` is still unresolved."""

    id: uuid.UUID
    kind: AlertKindName
    state: AlertStateName
    subject_key: str
    payment_id: uuid.UUID | None
    payment_reference: str | None
    details: dict[str, Any]
    opened_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by: str | None
    resolved_at: datetime | None
    resolved_by: str | None = Field(
        description="The admin's name; 'System' when provider evidence resolved it"
    )
    resolution_note: str | None


class AlertResolveIn(BaseModel):
    note: Reason
    paystack_refund_id: int | None = Field(
        default=None,
        gt=0,
        description="A refund found or made in the Paystack dashboard, to track to processed",
    )
