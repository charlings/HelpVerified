"""Paystack, behind a small interface (backend.md §7, security-and-compliance.md §5).

Card data never reaches this API: families pay on Paystack's hosted checkout. Value is granted only after
a webhook whose signature checks out *and* a fresh `verify` call that confirms status, amount and currency.
Every call uses the secret key over TLS; responses are never logged whole.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

import httpx

from app.core.errors import PaymentProviderError
from app.core.logging import get_logger

API_BASE = "https://api.paystack.co"
log = get_logger("app.paystack")


@dataclass(frozen=True)
class Initialized:
    authorization_url: str
    access_code: str
    reference: str


@dataclass(frozen=True)
class Verified:
    reference: str
    status: str  # "success", "failed", "abandoned", ...
    amount_kobo: int
    currency: str
    paid_at: datetime | None


@dataclass(frozen=True)
class RemoteSubscription:
    code: str
    status: str  # "active", "non-renewing", "attention", "completed", "cancelled"
    next_payment_date: datetime | None


class PaystackApi(Protocol):
    async def initialize(
        self,
        email: str,
        amount_kobo: int,
        reference: str,
        callback_url: str,
        metadata: dict[str, Any],
        plan: str | None = None,
    ) -> Initialized: ...

    async def verify(self, reference: str) -> Verified: ...

    async def refund(self, reference: str) -> None: ...

    async def fetch_subscription(self, code: str) -> RemoteSubscription: ...


def valid_signature(raw_body: bytes, signature: str | None, secret_key: str) -> bool:
    """`x-paystack-signature` is the HMAC-SHA512 of the raw body with the secret key."""
    if not signature:
        return False
    expected = hmac.new(secret_key.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


def _datetime(value: Any) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


class PaystackClient:
    def __init__(self, secret_key: str, timeout: float = 15.0, base_url: str = API_BASE) -> None:
        self._headers = {"Authorization": f"Bearer {secret_key}"}
        self._timeout = timeout
        self._base = base_url

    async def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        operation = path.split("/")[1]  # "transaction", "refund", "subscription": no references in logs
        try:
            async with httpx.AsyncClient(
                base_url=self._base, headers=self._headers, timeout=self._timeout
            ) as client:
                response = await client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            log.warning("paystack.unreachable", operation=operation, error=type(exc).__name__)
            raise PaymentProviderError() from exc
        try:
            body: dict[str, Any] = response.json()
        except ValueError as exc:
            log.warning("paystack.bad_response", operation=operation, status=response.status_code)
            raise PaymentProviderError() from exc
        if response.status_code >= 400 or not body.get("status"):
            # Paystack's short message ("Invalid key", "Duplicate Transaction Reference") is safe to log;
            # the body isn't, as it can hold customer details.
            log.warning(
                "paystack.refused",
                operation=operation,
                status=response.status_code,
                message=body.get("message"),
            )
            raise PaymentProviderError()
        data: dict[str, Any] = body.get("data") or {}
        return data

    async def initialize(
        self,
        email: str,
        amount_kobo: int,
        reference: str,
        callback_url: str,
        metadata: dict[str, Any],
        plan: str | None = None,
    ) -> Initialized:
        payload: dict[str, Any] = {
            "email": email,
            "amount": amount_kobo,
            "currency": "NGN",
            "reference": reference,
            "callback_url": callback_url,
            "metadata": metadata,
        }
        if plan:
            payload["plan"] = plan
        data = await self._call("POST", "/transaction/initialize", json=payload)
        return Initialized(data["authorization_url"], data["access_code"], data["reference"])

    async def verify(self, reference: str) -> Verified:
        data = await self._call("GET", f"/transaction/verify/{reference}")
        return Verified(
            reference=str(data.get("reference", reference)),
            status=str(data.get("status", "")),
            amount_kobo=int(data.get("amount") or 0),
            currency=str(data.get("currency", "")),
            paid_at=_datetime(data.get("paid_at") or data.get("paidAt")),
        )

    async def refund(self, reference: str) -> None:
        await self._call("POST", "/refund", json={"transaction": reference})

    async def fetch_subscription(self, code: str) -> RemoteSubscription:
        data = await self._call("GET", f"/subscription/{code}")
        return RemoteSubscription(
            code=str(data.get("subscription_code", code)),
            status=str(data.get("status", "")),
            next_payment_date=_datetime(data.get("next_payment_date")),
        )
