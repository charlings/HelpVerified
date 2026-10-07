"""The placement-fee checkout, behind a small interface (backend.md §7).

B4 needs only "start a checkout for this placement and give me the link". Paystack, the `payments`
table, the webhook and `/placements/{id}/pay` arrive in B5 (ADR 0013). Until then the app runs with
`UnconfiguredPayments`, which answers 502 PAYMENT_PROVIDER_ERROR after the hold is created.
"""

import uuid
from dataclasses import dataclass
from typing import Protocol

from app.core.errors import PaymentProviderError


@dataclass(frozen=True)
class Checkout:
    authorization_url: str
    reference: str


class PaymentGateway(Protocol):
    async def start_placement_checkout(self, placement_id: uuid.UUID, payer_email: str) -> Checkout: ...


class UnconfiguredPayments:
    async def start_placement_checkout(self, placement_id: uuid.UUID, payer_email: str) -> Checkout:
        raise PaymentProviderError("Payments aren't set up yet. The worker is held while you try again.")
