"""audit_log: who did what to which entity (database.md §3; actions in api-contracts.md, M7 notes).
admin_alerts: unresolved money states an admin must act on (ADR 0017 section F)."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, Text, func, text
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
    worker_evidence_deleted = "worker.evidence_deleted"  # retention job (B6); actor is the system
    alert_acknowledged = "alert.acknowledged"  # ADR 0017 (OD4)
    alert_resolved = "alert.resolved"


class AlertKind(StrEnum):
    checkout_unresolved = "checkout_unresolved"
    unmatched_charge = "unmatched_charge"
    refund_attention = "refund_attention"
    refund_stuck = "refund_stuck"
    refund_admin_review = "refund_admin_review"
    late_payment = "late_payment"
    duplicate_charge = "duplicate_charge"
    settlement_failed = "settlement_failed"
    legacy_unresolved = "legacy_unresolved"


class AdminAlert(Base):
    """One open alert per (kind, subject_key); acknowledging doesn't resolve it (ADR 0017, OD4)."""

    __tablename__ = "admin_alerts"
    __table_args__ = (
        Index(
            "admin_alerts_one_open_per_subject",
            "kind",
            "subject_key",
            unique=True,
            postgresql_where=text("resolved_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    kind: Mapped[str] = mapped_column(Text)
    subject_key: Mapped[str] = mapped_column(Text)  # "payment:<uuid>", "refund:<uuid>" or "reference:<ref>"
    payment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payments.id"))
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'"))
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)


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
