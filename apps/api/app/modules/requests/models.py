"""Family requests and agency proposals (database.md §3)."""

import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps
from app.db.types import pg_enum
from app.modules.agencies.models import WorkerRole


class RequestStatus(StrEnum):
    open = "open"
    matched = "matched"  # a placement exists for it
    cancelled = "cancelled"  # by the family before a match
    closed = "closed"  # the placement ended or was replaced


class ProposalStatus(StrEnum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"  # by the family
    withdrawn = "withdrawn"  # by the agency
    superseded = "superseded"  # another proposal was accepted


class Request(Timestamps, Base):
    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint("schedule IN ('full_time', 'part_time')", name="schedule"),
        CheckConstraint("trial_days BETWEEN 7 AND 30", name="trial_days"),
        CheckConstraint(
            "budget_min_kobo IS NULL OR budget_max_kobo IS NULL OR budget_min_kobo <= budget_max_kobo",
            name="budget_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    role: Mapped[WorkerRole] = mapped_column(pg_enum(WorkerRole, "worker_role"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    schedule: Mapped[str] = mapped_column(Text)
    live_in: Mapped[bool] = mapped_column(Boolean)
    state: Mapped[str] = mapped_column(Text)
    lga: Mapped[str] = mapped_column(Text)
    budget_min_kobo: Mapped[int | None] = mapped_column(BigInteger)
    budget_max_kobo: Mapped[int | None] = mapped_column(BigInteger)
    start_date: Mapped[date] = mapped_column(Date)
    trial_days: Mapped[int] = mapped_column(SmallInteger, server_default=text("14"))
    status: Mapped[RequestStatus] = mapped_column(
        pg_enum(RequestStatus, "request_status"), server_default=RequestStatus.open.value, index=True
    )
    # requests ↔ placements reference each other; like migration 0004, this one is added afterwards.
    replaces_placement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("placements.id", use_alter=True), index=True
    )


class Proposal(Timestamps, Base):
    __tablename__ = "proposals"
    __table_args__ = (UniqueConstraint("request_id", "worker_id", name="uq_proposals_request_id_worker_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id"))
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id"), index=True)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProposalStatus] = mapped_column(
        pg_enum(ProposalStatus, "proposal_status"), server_default=ProposalStatus.pending.value, index=True
    )
