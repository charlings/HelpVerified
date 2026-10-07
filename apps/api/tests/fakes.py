"""Test doubles for integrations."""

import uuid
from datetime import datetime
from urllib.parse import urlencode

from app.integrations.cloudinary import Asset, SignedUpload, sign
from app.integrations.email import EmailMessage
from app.integrations.payments import Checkout

FAKE_DOWNLOAD_HOST = "https://fake-cloudinary.test"


class FakeCloudinary:
    """Holds "uploaded" assets in memory. Signs like the real client, so signatures can be checked."""

    def __init__(self, api_key: str = "123456789012345", api_secret: str = "test-cloudinary-secret") -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.assets: dict[str, Asset] = {}

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


class MemoryEmailSender:
    """Keeps sent messages in a list instead of delivering them."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)

    def last(self, kind: str, to: str | None = None) -> EmailMessage:
        for message in reversed(self.sent):
            if message.kind == kind and (to is None or message.to.lower() == to.lower()):
                return message
        raise AssertionError(f"no {kind} email sent to {to or 'anyone'}")

    def token(self, kind: str, to: str | None = None) -> str:
        link = self.last(kind, to).link
        assert link is not None
        return link.split("token=", 1)[1]


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
