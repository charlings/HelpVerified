"""Live check of the Paystack integration in TEST mode (B5). No real money moves with a test key.

Uses PAYSTACK_SECRET_KEY from apps/api/.env (it refuses to run with a live key).

    cd apps/api
    uv run python -m scripts.paystack_live_check start          # opens a test checkout, prints its link
    uv run python -m scripts.paystack_live_check check <ref>    # reads it back through `verify`

Between the two, you can open the link and pay with Paystack's test card (4084 0840 8408 4081, any future
expiry, CVV 408, PIN 0000, OTP 123456) to see `check` report success with the right amount.
"""

import asyncio
import secrets
import sys

from app.core.config import load_settings
from app.integrations.paystack import PaystackClient


async def start() -> int:
    settings = load_settings()
    key = settings.PAYSTACK_SECRET_KEY.get_secret_value()
    if not key.startswith("sk_test_"):
        print("Refusing: this check only runs with a TEST secret key.")
        return 1
    client = PaystackClient(key)
    reference = f"HV-LIVECHECK-{secrets.token_hex(4).upper()}"
    initialized = await client.initialize(
        email="live-check@example.com",  # Paystack rejects reserved TLDs such as .test
        amount_kobo=settings.PLACEMENT_FEE_KOBO,
        reference=reference,
        callback_url=f"{settings.WEB_BASE_URL.rstrip('/')}/family/payments/callback",
        metadata={"kind": "live_check"},
    )
    print("1. initialize: ok")
    print("   reference:", initialized.reference)
    print("   checkout:  ", initialized.authorization_url)
    verified = await client.verify(reference)
    print(
        f"2. verify (before paying): status={verified.status}",
        f"amount={verified.amount_kobo} {verified.currency}",
    )
    ok = verified.reference == reference and verified.status != "success" and verified.currency == "NGN"
    print("START", "PASSED" if ok else "FAILED")
    return 0 if ok else 1


async def check(reference: str) -> int:
    settings = load_settings()
    verified = await PaystackClient(settings.PAYSTACK_SECRET_KEY.get_secret_value()).verify(reference)
    print(f"verify: status={verified.status}", f"amount={verified.amount_kobo} {verified.currency}")
    print(f"        paid_at={verified.paid_at}")
    paid = verified.status == "success" and verified.amount_kobo == settings.PLACEMENT_FEE_KOBO
    print("PAID AND MATCHES THE FEE" if paid else "NOT PAID (YET)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "start":
        sys.exit(asyncio.run(start()))
    if len(sys.argv) >= 3 and sys.argv[1] == "check":
        sys.exit(asyncio.run(check(sys.argv[2])))
    print(__doc__)
    sys.exit(2)
