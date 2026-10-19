"""Payment and billing payloads (api-contracts.md §3, §4, M6 notes; mock: payments.ts, billing.ts).

The wire keeps a small status vocabulary (ADR 0017, "Checkout-attempt states" and X1): a refund that isn't
confirmed `processed` is `refund_pending`, never `refunded`, and `refund_status` says where it stands.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.modules.payments.models import Payment, PaymentKind, PaymentRefund, PaymentStatus, RefundStatus

PaymentStatusName = Literal["pending", "success", "failed", "refund_pending", "refunded"]
RefundStatusName = Literal["none", "in_progress", "needs_attention", "completed"]
DESCRIPTIONS = {"placement_fee": "Placement fee", "subscription": "Agency subscription"}

WIRE_STATUS: dict[PaymentStatus, PaymentStatusName] = {
    PaymentStatus.pending: "pending",
    PaymentStatus.success: "success",
    PaymentStatus.failed: "failed",
    PaymentStatus.initiating: "pending",
    PaymentStatus.open: "pending",
    PaymentStatus.unknown: "pending",
    PaymentStatus.rejected: "failed",
    PaymentStatus.orphaned: "failed",
    PaymentStatus.closed: "failed",
    PaymentStatus.succeeded: "success",
    PaymentStatus.refund_due: "refund_pending",
    PaymentStatus.refunded: "refunded",
}
ATTENTION = (
    RefundStatus.needs_attention,
    RefundStatus.admin_review,
    RefundStatus.provider_failed,
    RefundStatus.provider_declined,
)
IN_PROGRESS = (
    RefundStatus.requested,
    RefundStatus.submitting,
    RefundStatus.uncertain,
    RefundStatus.pending,
    RefundStatus.processing,
)


def refund_status_of(payment: Payment, refunds: list[PaymentRefund]) -> RefundStatusName:
    """`completed` only when the payment is `refunded` (every refund owed confirmed `processed`)."""
    if payment.kind is not PaymentKind.placement_fee:
        return "none"
    if payment.status is PaymentStatus.refunded:
        return "completed"
    if payment.status is not PaymentStatus.refund_due:
        return "none"
    if any(r.status in IN_PROGRESS for r in refunds):
        return "in_progress"
    if any(r.status in ATTENTION for r in refunds):
        return "needs_attention"
    return "in_progress"  # e.g. some processed, the rest not yet created


class PaymentOut(BaseModel):
    id: uuid.UUID
    kind: Literal["placement_fee", "subscription"]
    description: str
    amount_kobo: int
    currency: Literal["NGN"]
    reference: str
    status: PaymentStatusName
    refund_status: RefundStatusName
    paid_at: datetime | None
    created_at: datetime

    @classmethod
    def of(cls, payment: Payment, refunds: list[PaymentRefund] | None = None) -> PaymentOut:
        return cls(
            id=payment.id,
            kind=payment.kind.value,
            description=DESCRIPTIONS[payment.kind.value],
            amount_kobo=payment.amount_kobo,
            currency="NGN",
            reference=payment.paystack_reference,
            status=WIRE_STATUS[payment.status],
            refund_status=refund_status_of(payment, refunds or []),
            paid_at=payment.paid_at,
            created_at=payment.created_at,
        )


class PaymentVerification(BaseModel):
    """What the callback page shows after Paystack's redirect; the API, not the redirect, decides."""

    reference: str
    status: PaymentStatusName
    refund_status: RefundStatusName
    amount_kobo: int
    placement_id: uuid.UUID | None
    placement_status: Literal["pending_payment", "trial", "confirmed", "ended", "cancelled"] | None


class BillingSubscription(BaseModel):
    plan_name: str
    plan_code: str
    status: Literal["active", "non_renewing", "past_due", "cancelled"]
    current_period_end: datetime | None
