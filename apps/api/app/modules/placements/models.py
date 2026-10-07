"""Placements, their event history and replacement requests (database.md §3, §5, §6)."""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, Timestamps
from app.db.types import pg_enum


class PlacementStatus(StrEnum):
    pending_payment = "pending_payment"
    trial = "trial"
    confirmed = "confirmed"
    ended = "ended"
    cancelled = "cancelled"


ACTIVE = (PlacementStatus.pending_payment, PlacementStatus.trial, PlacementStatus.confirmed)
_ACTIVE_SQL = "status IN ('pending_payment', 'trial', 'confirmed')"


class EndReason(StrEnum):
    completed = "completed"
    replaced = "replaced"
    family_ended = "family_ended"
    agency_ended = "agency_ended"
    worker_left = "worker_left"
    payment_expired = "payment_expired"
    admin_ended = "admin_ended"


class ReplacementStatus(StrEnum):
    open = "open"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class Placement(Timestamps, Base):
    __tablename__ = "placements"
    __table_args__ = (
        # Rule 2: one active placement per worker (and per request). The constraint names are what the
        # repository matches to turn a unique violation into 409 WORKER_UNAVAILABLE.
        Index(
            "placements_one_active_per_worker", "worker_id", unique=True, postgresql_where=text(_ACTIVE_SQL)
        ),
        Index(
            "placements_one_active_per_request", "request_id", unique=True, postgresql_where=text(_ACTIVE_SQL)
        ),
        CheckConstraint("status <> 'pending_payment' OR hold_expires_at IS NOT NULL", name="hold"),
        CheckConstraint(
            "status NOT IN ('trial', 'confirmed') OR trial_starts_on IS NOT NULL", name="trial_dates"
        ),
        CheckConstraint("status <> 'confirmed' OR confirmed_at IS NOT NULL", name="confirmed_at"),
        CheckConstraint(
            "status NOT IN ('ended', 'cancelled') OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)",
            name="end_fields",
        ),
        CheckConstraint("replacements_used >= 0", name="replacements_used"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id"), index=True)
    proposal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("proposals.id"), unique=True)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"), index=True)
    status: Mapped[PlacementStatus] = mapped_column(pg_enum(PlacementStatus, "placement_status"), index=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_starts_on: Mapped[date | None] = mapped_column(Date)
    trial_ends_on: Mapped[date | None] = mapped_column(Date)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_reason: Mapped[EndReason | None] = mapped_column(pg_enum(EndReason, "placement_end_reason"))
    replacements_used: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))


class PlacementEvent(CreatedAt, Base):
    __tablename__ = "placement_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    placement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("placements.id"), index=True)
    from_status: Mapped[PlacementStatus | None] = mapped_column(pg_enum(PlacementStatus, "placement_status"))
    to_status: Mapped[PlacementStatus] = mapped_column(pg_enum(PlacementStatus, "placement_status"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)  # None: system
    reason: Mapped[str | None] = mapped_column(Text)


class ReplacementRequest(Timestamps, Base):
    __tablename__ = "replacement_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    placement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("placements.id"), index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[ReplacementStatus] = mapped_column(
        pg_enum(ReplacementStatus, "replacement_status"), server_default=ReplacementStatus.open.value
    )
    new_request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("requests.id"), index=True)
