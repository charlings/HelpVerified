"""Payment and billing payloads (api-contracts.md §3, §4, M6 notes; mock: payments.ts, billing.ts)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.modules.payments.models import Payment

PaymentStatusName = Literal["pending", "success", "failed", "refunded"]
DESCRIPTIONS = {"placement_fee": "Placement fee", "subscription": "Agency subscription"}


class PaymentOut(BaseModel):
    id: uuid.UUID
    kind: Literal["placement_fee", "subscription"]
    description: str
    amount_kobo: int
    currency: Literal["NGN"]
    reference: str
    status: PaymentStatusName
    paid_at: datetime | None
    created_at: datetime

    @classmethod
    def of(cls, payment: Payment) -> PaymentOut:
        return cls(
            id=payment.id,
            kind=payment.kind.value,
            description=DESCRIPTIONS[payment.kind.value],
            amount_kobo=payment.amount_kobo,
            currency="NGN",
            reference=payment.paystack_reference,
            status=payment.status.value,
            paid_at=payment.paid_at,
            created_at=payment.created_at,
        )


class PaymentVerification(BaseModel):
    """What the callback page shows after Paystack's redirect; the API, not the redirect, decides."""

    reference: str
    status: PaymentStatusName
    amount_kobo: int
    placement_id: uuid.UUID | None
    placement_status: Literal["pending_payment", "trial", "confirmed", "ended", "cancelled"] | None


class BillingSubscription(BaseModel):
    plan_name: str
    plan_code: str
    status: Literal["active", "non_renewing", "past_due", "cancelled"]
    current_period_end: datetime | None
