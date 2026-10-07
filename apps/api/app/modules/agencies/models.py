"""Agencies, their members and subscriptions (database.md §3)."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, Timestamps
from app.db.types import pg_enum


class AgencyStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    suspended = "suspended"
    rejected = "rejected"


class WorkerRole(StrEnum):
    nanny = "nanny"
    driver = "driver"
    cleaner = "cleaner"


class SubscriptionStatus(StrEnum):
    active = "active"
    non_renewing = "non_renewing"
    past_due = "past_due"
    cancelled = "cancelled"


class Agency(Timestamps, Base):
    __tablename__ = "agencies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(Text)
    cac_number: Mapped[str] = mapped_column(Text, unique=True)
    email: Mapped[str] = mapped_column(CITEXT)
    phone: Mapped[str] = mapped_column(Text)
    address_line: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(Text)
    lga: Mapped[str] = mapped_column(Text)
    roles_offered: Mapped[list[WorkerRole]] = mapped_column(
        ARRAY(pg_enum(WorkerRole, "worker_role")), server_default=text("'{}'")
    )
    status: Mapped[AgencyStatus] = mapped_column(
        pg_enum(AgencyStatus, "agency_status"), server_default=AgencyStatus.pending.value, index=True
    )
    status_reason: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)


class AgencyMember(CreatedAt, Base):
    __tablename__ = "agency_members"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)


class Subscription(Timestamps, Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), unique=True)
    plan_code: Mapped[str] = mapped_column(Text)
    paystack_subscription_code: Mapped[str | None] = mapped_column(Text, unique=True)
    paystack_customer_code: Mapped[str | None] = mapped_column(Text)
    status: Mapped[SubscriptionStatus] = mapped_column(pg_enum(SubscriptionStatus, "subscription_status"))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
