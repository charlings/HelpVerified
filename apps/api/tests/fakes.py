"""Test doubles for integrations."""

import asyncio
import base64
import hashlib
import uuid
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx

from app.core.errors import PaymentProviderRejected, PaymentProviderUnavailable, TransactionNotFound
from app.integrations.cloudinary import Asset, SignedUpload, sign
from app.integrations.email import EmailMessage
from app.integrations.firestore import MirroredNotification, MirrorError
from app.integrations.google import GoogleAuthError, GoogleIdentity
from app.integrations.payments import Checkout
from app.integrations.paystack import Initialized, RefundPage, RemoteRefund, RemoteSubscription, Verified

FAKE_DOWNLOAD_HOST = "https://fake-cloudinary.test"
FAKE_GOOGLE_AUTHORIZE = "https://accounts.google.test/auth"


class FakeCloudinary:
    """Holds "uploaded" assets in memory. Signs like the real client, so signatures can be checked."""

    def __init__(self, api_key: str = "123456789012345", api_secret: str = "test-cloudinary-secret") -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.assets: dict[str, Asset] = {}
        self.destroyed: list[str] = []
        self.down = False

    def reset(self) -> None:
        self.assets.clear()
        self.destroyed.clear()
        self.down = False

    def sign_upload(self, folder: str, delivery_type: str, timestamp: int) -> SignedUpload:
        params: dict[str, str | int] = {"folder": folder, "timestamp": timestamp, "type": delivery_type}
        return SignedUpload(
            upload_url="https://api.cloudinary.com/v1_1/hv-test/auto/upload",
            api_key=self.api_key,
            timestamp=timestamp,
            signature=sign(params, self.api_secret),
            folder=folder,
            type=delivery_type,
        )

    def upload(self, folder: str, delivery_type: str, *, fmt: str = "pdf", size: int = 180_000) -> str:
        """What the browser does with the signed parameters; returns the new public_id."""
        public_id = f"{folder}/{uuid.uuid4().hex}"
        resource_type = "image"  # Cloudinary stores PDFs uploaded with `auto` as images
        self.assets[public_id] = Asset(public_id, delivery_type, resource_type, fmt, size)
        return public_id

    async def find_asset(self, public_id: str, delivery_type: str) -> Asset | None:
        asset = self.assets.get(public_id)
        return asset if asset and asset.type == delivery_type else None

    def private_download_url(self, asset: Asset, expires_at: datetime, timestamp: int) -> str:
        query = {"public_id": asset.public_id, "expires_at": int(expires_at.timestamp()), "signature": "fake"}
        return f"{FAKE_DOWNLOAD_HOST}/download?{urlencode(query)}"

    async def destroy(self, asset: Asset, timestamp: int) -> None:
        if self.down:
            raise httpx.ConnectError("cloudinary down")
        self.assets.pop(asset.public_id, None)
        self.destroyed.append(asset.public_id)


class MemoryEmailSender:
    """Keeps sent messages in a list instead of delivering them."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []
        self.down = False  # True: every send fails, as a provider outage would

    def reset(self) -> None:
        self.sent.clear()
        self.down = False

    async def send(self, message: EmailMessage) -> None:
        if self.down:
            raise ConnectionError("email provider down")
        self.sent.append(message)

    def to(self, address: str) -> list[EmailMessage]:
        return [m for m in self.sent if m.to.lower() == address.lower()]

    def last(self, kind: str, to: str | None = None) -> EmailMessage:
        for message in reversed(self.sent):
            if message.kind == kind and (to is None or message.to.lower() == to.lower()):
                return message
        raise AssertionError(f"no {kind} email sent to {to or 'anyone'}")

    def token(self, kind: str, to: str | None = None) -> str:
        link = self.last(kind, to).link
        assert link is not None
        return link.split("token=", 1)[1]


class FakePaystack:
    """Paystack in memory: checkouts, the customer paying, verify, refunds and subscriptions.

    It behaves as observed in test mode (ADR 0017, O1-O8): a reused reference is refused with
    `duplicate_reference` and no link; an unknown reference is `transaction_not_found`; a new checkout reads
    `abandoned`; a refund is `pending` until processed, the transaction `reversal-pending` meanwhile, then
    `reversed`; a refund that would take the total past the amount is refused with `transaction_reversed`."""

    def __init__(self) -> None:
        self.transactions: dict[str, dict[str, Any]] = {}
        self.refunds: list[str] = []  # references whose refund Paystack accepted, in order
        self.refund_records: dict[int, dict[str, Any]] = {}
        self.subscriptions: dict[str, RemoteSubscription] = {}
        self.down = False  # True: every call fails as unreachable
        self.refuse_refunds = False  # only refunds fail, as a definite refusal (verify still works)
        self.reject_checkouts = False  # True: initialize is refused, as for an email Paystack won't take
        self.initialize_delay = 0.0  # seconds: keeps a checkout in flight for the concurrency tests
        self.initialize_calls = 0
        self.refund_calls = 0
        # Ambiguous outcomes: Paystack does the work, then the reply is lost (a timeout on our side).
        self.lose_initialize_replies = 0
        self.lose_refund_replies = 0
        self.refund_unreachable = False  # refund requests never reach Paystack (nothing is created)
        self._next_id = 1000

    def reset(self) -> None:
        self.transactions.clear()
        self.refunds.clear()
        self.refund_records.clear()
        self.subscriptions.clear()
        self.down = False
        self.refuse_refunds = False
        self.reject_checkouts = False
        self.initialize_delay = 0.0
        self.initialize_calls = 0
        self.refund_calls = 0
        self.lose_initialize_replies = 0
        self.lose_refund_replies = 0
        self.refund_unreachable = False

    def _check(self) -> None:
        if self.down:
            raise PaymentProviderUnavailable()

    def _id(self) -> int:
        self._next_id += 1
        return self._next_id

    async def initialize(
        self,
        email: str,
        amount_kobo: int,
        reference: str,
        callback_url: str,
        metadata: dict[str, Any],
        plan: str | None = None,
        channels: list[str] | None = None,
    ) -> Initialized:
        self.initialize_calls += 1
        if self.initialize_delay:
            await asyncio.sleep(self.initialize_delay)
        self._check()
        if self.reject_checkouts:
            raise PaymentProviderRejected(provider_code="invalid_params")
        if reference in self.transactions:
            raise PaymentProviderRejected(provider_code="duplicate_reference")  # O1: no link
        self.transactions[reference] = {
            "id": self._id(),
            "email": email,
            "amount": amount_kobo,
            "currency": "NGN",
            "status": "abandoned",  # O2: also the initial state
            "callback_url": callback_url,
            "metadata": metadata,
            "plan": plan,
            "channels": channels,
            "paid_at": None,
        }
        if self.lose_initialize_replies:
            self.lose_initialize_replies -= 1
            raise PaymentProviderUnavailable()  # created at Paystack, but our call timed out
        return Initialized(f"https://checkout.paystack.test/{reference}", f"ac_{reference}", reference)

    def pay(self, reference: str, *, amount_kobo: int | None = None, currency: str = "NGN") -> None:
        """The customer completes checkout (optionally with a tampered amount)."""
        txn = self.transactions[reference]
        txn.update(status="success", paid_at=datetime.now(UTC), currency=currency)
        if amount_kobo is not None:
            txn["amount"] = amount_kobo

    def decline(self, reference: str) -> None:
        self.transactions[reference]["status"] = "failed"

    async def verify(self, reference: str) -> Verified:
        self._check()
        txn = self.transactions.get(reference)
        if txn is None:
            raise TransactionNotFound(provider_code="transaction_not_found")  # O4
        return Verified(reference, txn["status"], txn["amount"], txn["currency"], txn["paid_at"], txn["id"])

    async def refund(self, reference: str, amount_kobo: int) -> RemoteRefund:
        self.refund_calls += 1
        self._check()
        if self.refund_unreachable:
            raise PaymentProviderUnavailable()
        if self.refuse_refunds:
            raise PaymentProviderRejected(provider_code="declined")
        txn = self.transactions.get(reference)
        if txn is None or txn["status"] not in ("success", "reversal-pending", "reversed"):
            raise PaymentProviderRejected(provider_code="declined")  # "This transaction failed" (O7)
        committed = sum(r["amount"] for r in self.refund_records.values() if r["reference"] == reference)
        if committed + amount_kobo > txn["amount"]:
            raise PaymentProviderRejected(provider_code="transaction_reversed")  # O6
        refund_id = self._id()
        self.refund_records[refund_id] = {"reference": reference, "amount": amount_kobo, "status": "pending"}
        self.refunds.append(reference)
        txn["status"] = "reversal-pending"  # O5
        if self.lose_refund_replies:
            self.lose_refund_replies -= 1
            raise PaymentProviderUnavailable()  # accepted, but the reply was lost
        return self._remote(refund_id)

    def set_refund(self, refund_id: int, status: str) -> None:
        """Paystack moves a refund on: processing, needs-attention, failed or processed."""
        record = self.refund_records[refund_id]
        record["status"] = status
        if status == "processed":
            self.transactions[record["reference"]]["status"] = "reversed"

    def refund_id_for(self, reference: str) -> int:
        [refund_id] = [i for i, r in self.refund_records.items() if r["reference"] == reference]
        return refund_id

    def _remote(self, refund_id: int) -> RemoteRefund:
        record = self.refund_records[refund_id]
        txn = self.transactions[record["reference"]]
        return RemoteRefund(refund_id, record["status"], record["amount"], record["reference"], txn["id"])

    async def fetch_refund(self, refund_id: int) -> RemoteRefund:
        self._check()
        if refund_id not in self.refund_records:
            raise PaymentProviderRejected(provider_code="not_found")
        return self._remote(refund_id)

    async def list_refunds(
        self, *, transaction_id: int | None, since: date, until: date, page: int, per_page: int
    ) -> RefundPage:
        self._check()
        items = [self._remote(i) for i in sorted(self.refund_records)]
        if transaction_id is not None:
            items = [r for r in items if r.transaction_id == transaction_id]
        pages = max(1, -(-len(items) // per_page)) if items else 0
        start = (page - 1) * per_page
        return RefundPage(items[start : start + per_page], pages)

    async def fetch_subscription(self, code: str) -> RemoteSubscription:
        self._check()
        return self.subscriptions[code]


class FakePayments:
    """Hands out a checkout link per placement, as Paystack will (B5)."""

    def __init__(self) -> None:
        self.started: list[uuid.UUID] = []

    async def start_placement_checkout(self, placement_id: uuid.UUID, payer_email: str) -> Checkout:
        self.started.append(placement_id)
        reference = f"HV-PF-{placement_id.hex[:8].upper()}"
        return Checkout(authorization_url=f"https://checkout.test/{reference}", reference=reference)


class FailingEmailSender:
    async def send(self, message: EmailMessage) -> None:
        raise ConnectionError("email provider down")


class FakeGoogle:
    """Google's consent screen and token endpoint in memory. Like Google, it checks the PKCE verifier
    against the challenge and the redirect URI, spends each code once, and echoes the nonce."""

    def __init__(self) -> None:
        self.codes: dict[str, tuple[GoogleIdentity, dict[str, str]]] = {}
        self.down = False

    def reset(self) -> None:
        self.codes.clear()
        self.down = False

    def authorization_url(self, *, state: str, code_challenge: str, nonce: str, redirect_uri: str) -> str:
        query = {
            "state": state,
            "code_challenge": code_challenge,
            "nonce": nonce,
            "redirect_uri": redirect_uri,
        }
        return f"{FAKE_GOOGLE_AUTHORIZE}?{urlencode(query)}"

    def consent(self, authorization_url: str, identity: GoogleIdentity) -> str:
        """The user picks `identity` on the consent screen; returns the code Google sends back."""
        query = {k: v[0] for k, v in parse_qs(urlsplit(authorization_url).query).items()}
        code = f"code-{uuid.uuid4().hex}"
        self.codes[code] = (identity, query)
        return code

    async def identify(
        self, *, code: str, code_verifier: str, redirect_uri: str, nonce: str
    ) -> GoogleIdentity:
        if self.down:
            raise GoogleAuthError("ConnectError")
        entry = self.codes.pop(code, None)
        if entry is None:
            raise GoogleAuthError("code refused")
        identity, query = entry
        challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).rstrip(b"=")
        if challenge.decode() != query["code_challenge"] or redirect_uri != query["redirect_uri"]:
            raise GoogleAuthError("code refused")
        if nonce != query["nonce"]:
            raise GoogleAuthError("nonce mismatch")
        return identity


class FakeMirror:
    """Firestore in memory: the latest version of each mirrored document, keyed by (user_id, id)."""

    def __init__(self) -> None:
        self.documents: dict[tuple[uuid.UUID, uuid.UUID], MirroredNotification] = {}
        self.writes = 0
        self.down = False

    def reset(self) -> None:
        self.documents.clear()
        self.writes = 0
        self.down = False

    async def write(self, item: MirroredNotification) -> None:
        if self.down:
            raise MirrorError("firestore down")
        self.writes += 1
        self.documents[(item.user_id, item.id)] = item
