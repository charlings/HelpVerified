"""audit_log: who did what to which entity (database.md §3; actions in api-contracts.md, M7 notes)."""

import uuid
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Identity, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt


class AuditAction(StrEnum):
    agency_approved = "agency.approved"
    agency_rejected = "agency.rejected"
    agency_suspended = "agency.suspended"
    agency_reinstated = "agency.reinstated"
    worker_check_flagged = "worker.check_flagged"
    document_viewed = "document.viewed"
    placement_ended = "placement.ended"


class AuditLog(CreatedAt, Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(Text, index=True)
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    # {"label": display name, "reason"?: ..., "kind"?: check kind, "worker_id"?: for document views}
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'"))
    ip: Mapped[str | None] = mapped_column(INET)
