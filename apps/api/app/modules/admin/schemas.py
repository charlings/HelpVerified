"""Super-admin payloads (api-contracts.md "Admin payloads (M7)"; mock: admin-domain.ts, admin.ts)."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, StringConstraints

from app.core.validation import Reason
from app.modules.admin.models import AuditLog
from app.modules.agencies.models import Agency
from app.modules.agencies.schemas import AgencyStatusName, RoleName, SubscriptionOut, WorkerCounts
from app.modules.users.models import User
from app.modules.verification.schemas import ItemOut, KindName
from app.modules.workers.schemas import AdminWorkerOut

AgencyAction = Literal["approve", "reject", "suspend", "reinstate"]


class Actor(BaseModel):
    id: uuid.UUID
    name: str
    role: Literal["super_admin", "agency_admin", "family"]


class AuditEntry(BaseModel):
    id: str
    action: str
    actor: Actor | None
    entity: str
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
            action=entry.action,
            actor=Actor(id=actor.id, name=actor.full_name, role=actor.role.value) if actor else None,
            entity=entry.entity,
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


class AgencyActionIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class FlagIn(BaseModel):
    kind: KindName
    reason: Reason


class AdminWorkerDetail(AdminWorkerOut):
    checks: list[ItemOut]
