"""Payments and webhook events (database.md §3, Billing). Money is integer kobo."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CHAR,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps
from app.db.types import pg_enum


class PaymentKind(StrEnum):
    placement_fee = "placement_fee"
    subscription = "subscription"


class PaymentStatus(StrEnum):
    pending = "pending"
    success = "success"
    failed = "failed"  # abandoned, or the hold was cancelled before payment
    refunded = "refunded"  # paid after the hold lapsed; the money goes back


class Payment(Timestamps, Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index(
            "payments_one_pending_fee_per_placement",
            "placement_id",
            unique=True,
            postgresql_where=text("kind = 'placement_fee' AND status = 'pending'"),
        ),
        CheckConstraint("amount_kobo > 0", name="amount"),
        CheckConstraint("currency = 'NGN'", name="currency"),
        CheckConstraint(
            "(kind = 'placement_fee' AND placement_id IS NOT NULL) "
            "OR (kind = 'subscription' AND agency_id IS NOT NULL)",
            name="kind_target",
        ),
        CheckConstraint("status <> 'success' OR paid_at IS NOT NULL", name="paid_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    kind: Mapped[PaymentKind] = mapped_column(pg_enum(PaymentKind, "payment_kind"))
    payer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    placement_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("placements.id"), index=True)
    agency_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agencies.id"), index=True)
    amount_kobo: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(CHAR(3), server_default=text("'NGN'"))
    paystack_reference: Mapped[str] = mapped_column(Text, unique=True)
    authorization_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"), server_default=PaymentStatus.pending.value, index=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_webhook_events_provider_event_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    provider: Mapped[str] = mapped_column(Text)
    event_id: Mapped[str] = mapped_column(Text)
    event_type: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
