"""Test doubles for integrations."""

import asyncio
import base64
import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx

from app.core.errors import PaymentProviderRejected, PaymentProviderUnavailable
from app.integrations.cloudinary import Asset, SignedUpload, sign
from app.integrations.email import EmailMessage
from app.integrations.firestore import MirroredNotification, MirrorError
from app.integrations.google import GoogleAuthError, GoogleIdentity
from app.integrations.payments import Checkout
from app.integrations.paystack import Initialized, RemoteSubscription, Verified

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
    """Paystack in memory: checkouts, the customer paying, verify, refunds and subscriptions."""

    def __init__(self) -> None:
        self.transactions: dict[str, dict[str, Any]] = {}
        self.refunds: list[str] = []
        self.subscriptions: dict[str, RemoteSubscription] = {}
        self.down = False  # True: every call fails as unreachable
        self.refuse_refunds = False  # only refunds fail (verify still works)
        self.reject_checkouts = False  # True: initialize is refused, as for an email Paystack won't take
        self.initialize_delay = 0.0  # seconds: keeps a checkout in flight for the concurrency tests
        self.initialize_calls = 0

    def reset(self) -> None:
        self.transactions.clear()
        self.refunds.clear()
        self.subscriptions.clear()
        self.down = False
        self.refuse_refunds = False
        self.reject_checkouts = False
        self.initialize_delay = 0.0
        self.initialize_calls = 0

    def _check(self) -> None:
        if self.down:
            raise PaymentProviderUnavailable()

    async def initialize(
        self,
        email: str,
        amount_kobo: int,
        reference: str,
        callback_url: str,
        metadata: dict[str, Any],
        plan: str | None = None,
    ) -> Initialized:
        self.initialize_calls += 1
        if self.initialize_delay:
            await asyncio.sleep(self.initialize_delay)
        self._check()
        if self.reject_checkouts:
            raise PaymentProviderRejected()
        if reference in self.transactions:
            raise PaymentProviderRejected()  # Paystack refuses a duplicate reference
        self.transactions[reference] = {
            "email": email,
            "amount": amount_kobo,
            "currency": "NGN",
            "status": "abandoned",
            "callback_url": callback_url,
            "metadata": metadata,
            "plan": plan,
            "paid_at": None,
        }
        return Initialized(f"https://checkout.paystack.test/{reference}", f"ac_{reference}", reference)

    def pay(self, reference: str, *, amount_kobo: int | None = None, currency: str = "NGN") -> None:
        """The customer completes checkout (optionally with a tampered amount)."""
        txn = self.transactions[reference]
        txn.update(status="success", paid_at=datetime.now(UTC), currency=currency)
        if amount_kobo is not None:
            txn["amount"] = amount_kobo

    async def verify(self, reference: str) -> Verified:
        self._check()
        txn = self.transactions.get(reference)
        if txn is None:
            raise PaymentProviderRejected()  # "Transaction reference not found"
        return Verified(reference, txn["status"], txn["amount"], txn["currency"], txn["paid_at"])

    async def refund(self, reference: str) -> None:
        self._check()
        if self.refuse_refunds:
            raise PaymentProviderRejected()
        self.refunds.append(reference)

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
