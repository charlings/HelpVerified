"""What the placement service needs from payments: "start a checkout for this placement".

`PaymentService` (app/modules/payments/service.py) implements it with Paystack; tests of placement logic
alone use a fake. Keeping the seam small means accept doesn't depend on how money moves.
"""

import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Checkout:
    authorization_url: str
    reference: str


class PaymentGateway(Protocol):
    async def start_placement_checkout(self, placement_id: uuid.UUID, payer_email: str) -> Checkout: ...
