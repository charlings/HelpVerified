"""Paystack, behind a small interface (backend.md §7, security-and-compliance.md §5).

Card data never reaches this API: families pay on Paystack's hosted checkout. Value is granted only after
a webhook whose signature checks out *and* a fresh `verify` call that confirms status, amount and currency.
Every call uses the secret key over TLS; responses are never logged whole.

Refusals are classified by Paystack's machine-readable `code`, not the HTTP status (ADR 0017, OD9 item 1):
`duplicate_reference` (O1), `transaction_not_found` (O4: HTTP 400 in test mode; HTTP 404 in the spec, D10) and
`transaction_reversed` (O6) each mean something different to the caller.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol

import httpx

from app.core.errors import PaymentProviderRejected, PaymentProviderUnavailable, TransactionNotFound
from app.core.logging import get_logger

API_BASE = "https://api.paystack.co"
log = get_logger("app.paystack")

DUPLICATE_REFERENCE = "duplicate_reference"
TRANSACTION_NOT_FOUND = "transaction_not_found"
TRANSACTION_REVERSED = "transaction_reversed"  # "A refund already exist for this transaction" (O6)


@dataclass(frozen=True)
class Initialized:
    authorization_url: str
    access_code: str
    reference: str


@dataclass(frozen=True)
class Verified:
    reference: str
    status: str  # "success", "failed", "abandoned" (also the initial state, O2), "reversal-pending", ...
    amount_kobo: int
    currency: str
    paid_at: datetime | None
    transaction_id: int | None = None


@dataclass(frozen=True)
class RemoteRefund:
    id: int
    status: str  # "pending", "processing", "needs-attention", "failed", "processed"
    amount_kobo: int
    transaction_reference: str | None
    transaction_id: int | None


@dataclass(frozen=True)
class RefundPage:
    items: list[RemoteRefund]
    page_count: int


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
        channels: list[str] | None = None,
    ) -> Initialized: ...

    async def verify(self, reference: str) -> Verified: ...

    async def refund(self, reference: str, amount_kobo: int) -> RemoteRefund: ...

    async def fetch_refund(self, refund_id: int) -> RemoteRefund: ...

    async def list_refunds(
        self, *, transaction_id: int | None, since: date, until: date, page: int, per_page: int
    ) -> RefundPage: ...

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


def _refund(data: dict[str, Any]) -> RemoteRefund:
    """A refund from create, fetch or list. Its transaction is an object on create and fetch (test mode) and
    a number with `transaction_reference` alongside on list (O7)."""
    transaction = data.get("transaction")
    if isinstance(transaction, dict):
        reference = transaction.get("reference")
        transaction_id = transaction.get("id")
    else:
        reference = data.get("transaction_reference")
        transaction_id = transaction
    return RemoteRefund(
        id=int(data["id"]),
        status=str(data.get("status", "")),
        amount_kobo=int(data.get("amount") or 0),
        transaction_reference=str(reference) if reference else data.get("transaction_reference"),
        transaction_id=int(transaction_id) if isinstance(transaction_id, int) else None,
    )


class PaystackClient:
    def __init__(
        self,
        secret_key: str,
        timeout: float = 15.0,
        base_url: str = API_BASE,
        transport: httpx.AsyncBaseTransport | None = None,  # tests pass an httpx.MockTransport
    ) -> None:
        self._headers = {"Authorization": f"Bearer {secret_key}"}
        self._timeout = timeout
        self._base = base_url
        self._transport = transport

    async def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        """Unreachable, timed out, a 5xx or an unreadable body → PaymentProviderUnavailable (worth retrying).
        Paystack answering 4xx or `status: false` → PaymentProviderRejected. Neither carries Paystack's
        words to the client: its short message goes to the log only."""
        operation = path.split("/")[1]  # "transaction", "refund", "subscription": no references in logs
        try:
            async with httpx.AsyncClient(
                base_url=self._base, headers=self._headers, timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            log.warning("paystack.unreachable", operation=operation, error=type(exc).__name__)
            raise PaymentProviderUnavailable() from exc
        if response.status_code >= 500:
            log.warning("paystack.server_error", operation=operation, status=response.status_code)
            raise PaymentProviderUnavailable()
        try:
            body: dict[str, Any] = response.json()
        except ValueError as exc:
            log.warning("paystack.bad_response", operation=operation, status=response.status_code)
            raise PaymentProviderUnavailable() from exc
        if response.status_code >= 400 or not body.get("status"):
            # Paystack's short message and code ("Duplicate Transaction Reference", duplicate_reference) are
            # safe to log; the body isn't, as it can hold customer details.
            code = body.get("code") if isinstance(body.get("code"), str) else None
            log.warning(
                "paystack.refused",
                operation=operation,
                status=response.status_code,
                message=body.get("message"),
                code=code,
            )
            if code == TRANSACTION_NOT_FOUND or response.status_code == 404:
                raise TransactionNotFound(provider_code=TRANSACTION_NOT_FOUND)
            raise PaymentProviderRejected(provider_code=code)
        data: Any = body.get("data")
        if isinstance(data, list):  # list endpoints: the page and its meta
            return {"items": data, "meta": body.get("meta") or {}}
        return data or {}

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
        if channels:
            payload["channels"] = channels  # accepted, and reported back by verify (test mode, 2026-10-19)
        data = await self._call("POST", "/transaction/initialize", json=payload)
        return Initialized(data["authorization_url"], data["access_code"], data["reference"])

    async def verify(self, reference: str) -> Verified:
        data = await self._call("GET", f"/transaction/verify/{reference}")
        transaction_id = data.get("id")
        return Verified(
            reference=str(data.get("reference", reference)),
            status=str(data.get("status", "")),
            amount_kobo=int(data.get("amount") or 0),
            currency=str(data.get("currency", "")),
            paid_at=_datetime(data.get("paid_at") or data.get("paidAt")),
            transaction_id=int(transaction_id) if isinstance(transaction_id, int) else None,
        )

    async def refund(self, reference: str, amount_kobo: int) -> RemoteRefund:
        data = await self._call("POST", "/refund", json={"transaction": reference, "amount": amount_kobo})
        return _refund(data)

    async def fetch_refund(self, refund_id: int) -> RemoteRefund:
        return _refund(await self._call("GET", f"/refund/{refund_id}"))

    async def list_refunds(
        self, *, transaction_id: int | None, since: date, until: date, page: int, per_page: int
    ) -> RefundPage:
        """`from`, `to`, `page` and `perPage` are documented (D13). `transaction` isn't: in test mode it
        filtered by Paystack's numeric transaction id (2026-10-19), so callers still match on their side."""
        params: dict[str, Any] = {
            "from": since.isoformat(),
            "to": until.isoformat(),
            "page": page,
            "perPage": per_page,
        }
        if transaction_id is not None:
            params["transaction"] = transaction_id
        data = await self._call("GET", "/refund", params=params)
        meta = data.get("meta") or {}
        return RefundPage(
            items=[_refund(item) for item in data.get("items") or [] if isinstance(item, dict)],
            page_count=int(meta.get("pageCount") or 0),
        )

    async def fetch_subscription(self, code: str) -> RemoteSubscription:
        data = await self._call("GET", f"/subscription/{code}")
        return RemoteSubscription(
            code=str(data.get("subscription_code", code)),
            status=str(data.get("status", "")),
            next_payment_date=_datetime(data.get("next_payment_date")),
        )
