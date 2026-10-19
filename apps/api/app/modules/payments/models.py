"""Payments, refunds and webhook events (database.md §3, Billing; ADR 0017). Money is integer kobo.

A placement-fee row is one checkout attempt with one Paystack reference (ADR 0017, "Checkout-attempt
states"); a subscription row keeps the B5 lifecycle (pending, success, failed). Refunds live in their own
table: a refund is complete only when Paystack confirms `processed`.
"""

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
    SmallInteger,
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
    # Subscriptions (B5).
    pending = "pending"
    success = "success"
    # Both: a subscription that didn't go through; a placement-fee attempt Paystack confirmed failed (OD3).
    failed = "failed"
    # Placement-fee attempts (ADR 0017).
    initiating = "initiating"  # committed before the initialise call
    open = "open"  # Paystack returned a link
    unknown = "unknown"  # initialise's outcome isn't established
    rejected = "rejected"  # a definite refusal, confirmed with the same reference
    orphaned = "orphaned"  # the reference exists at Paystack, but its link never reached us
    closed = "closed"  # no longer active (hold ended, superseded, ineligible); still watched
    succeeded = "succeeded"  # applied to the placement (at most one per placement)
    refund_due = "refund_due"  # a real payment that can't be applied; refunds are tracked
    refunded = "refunded"  # the amount owed back is confirmed `processed`


ACTIVE_ATTEMPTS = (PaymentStatus.initiating, PaymentStatus.open, PaymentStatus.unknown)
# Attempts that may still receive a success from Paystack, so settlement and watching consider them.
PAYABLE_ATTEMPTS = (
    PaymentStatus.open,
    PaymentStatus.unknown,
    PaymentStatus.rejected,
    PaymentStatus.failed,
    PaymentStatus.orphaned,
    PaymentStatus.closed,
)
SETTLED = (PaymentStatus.success, PaymentStatus.succeeded, PaymentStatus.refund_due, PaymentStatus.refunded)


class ClosedReason(StrEnum):
    hold_ended = "hold_ended"
    superseded = "superseded"  # a sibling attempt was applied
    ineligible = "ineligible"  # a late initialise reply for a placement no longer awaiting payment


class RefundStatus(StrEnum):
    requested = "requested"  # never sent
    submitting = "submitting"  # committed before the call
    uncertain = "uncertain"  # sent (or maybe sent); outcome not established
    pending = "pending"
    processing = "processing"
    needs_attention = "needs_attention"
    admin_review = "admin_review"
    processed = "processed"  # the only completed state
    provider_failed = "provider_failed"  # money credited back to our balance (released)
    provider_declined = "provider_declined"  # a definite refusal of the request (released)
    voided = "voided"  # cancelled before any call (released)


RELEASED_REFUNDS = (RefundStatus.provider_failed, RefundStatus.provider_declined, RefundStatus.voided)
FINAL_REFUNDS = (RefundStatus.processed, *RELEASED_REFUNDS)


class Payment(Timestamps, Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index(
            "payments_one_open_attempt_per_placement",
            "placement_id",
            unique=True,
            postgresql_where=text("kind = 'placement_fee' AND status IN ('initiating', 'open', 'unknown')"),
        ),
        Index(
            "payments_one_succeeded_per_placement",
            "placement_id",
            unique=True,
            postgresql_where=text("kind = 'placement_fee' AND status = 'succeeded'"),
        ),
        Index(
            "uq_payments_placement_id_attempt_no",
            "placement_id",
            "attempt_no",
            unique=True,
            postgresql_where=text("attempt_no IS NOT NULL"),
        ),
        Index(
            "ix_payments_next_reconcile_at",
            "next_reconcile_at",
            postgresql_where=text("next_reconcile_at IS NOT NULL"),
        ),
        Index("ix_payments_watch_until", "watch_until", postgresql_where=text("watch_until IS NOT NULL")),
        CheckConstraint("amount_kobo > 0", name="amount"),
        CheckConstraint("currency = 'NGN'", name="currency"),
        CheckConstraint(
            "(kind = 'placement_fee' AND placement_id IS NOT NULL) "
            "OR (kind = 'subscription' AND agency_id IS NOT NULL)",
            name="kind_target",
        ),
        CheckConstraint("status NOT IN ('success', 'succeeded') OR paid_at IS NOT NULL", name="paid_at"),
        CheckConstraint("attempt_no IS NULL OR attempt_no BETWEEN 1 AND 3", name="attempt_no"),
        CheckConstraint("status <> 'orphaned' OR authorization_url IS NULL", name="orphaned_has_no_link"),
        CheckConstraint(
            "refund_committed_kobo >= 0 AND refund_committed_kobo <= amount_kobo", name="refund_committed"
        ),
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
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # Paystack's, for the record
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # when fully `processed`
    # Checkout attempts (ADR 0017).
    attempt_no: Mapped[int | None] = mapped_column(SmallInteger)
    closed_reason: Mapped[str | None] = mapped_column(Text)
    watch_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paystack_transaction_id: Mapped[int | None] = mapped_column(BigInteger)
    provider_status: Mapped[str | None] = mapped_column(Text)
    provider_code: Mapped[str | None] = mapped_column(Text)
    provider_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reconcile_attempts: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    next_reconcile_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Kept by a trigger on payment_refunds; the CHECK above keeps it within the captured amount (I8).
    refund_committed_kobo: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))


class PaymentRefund(Timestamps, Base):
    __tablename__ = "payment_refunds"
    __table_args__ = (
        Index(
            "payment_refunds_one_in_flight_per_payment",
            "payment_id",
            unique=True,
            postgresql_where=text("status IN ('submitting', 'uncertain')"),
        ),
        CheckConstraint("amount_kobo > 0", name="amount"),
        CheckConstraint("resubmissions BETWEEN 0 AND 1", name="resubmissions"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"), index=True)
    amount_kobo: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[RefundStatus] = mapped_column(
        pg_enum(RefundStatus, "refund_status"), server_default=RefundStatus.requested.value, index=True
    )
    paystack_refund_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resubmissions: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    clean_checks: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    provider_status: Mapped[str | None] = mapped_column(Text)
    provider_code: Mapped[str | None] = mapped_column(Text)
    provider_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


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
