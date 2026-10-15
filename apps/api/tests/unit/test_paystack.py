"""Paystack signing, key safety, scrubbing, and the callback pages existing in the web app."""

import asyncio
import hashlib
import hmac
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from app.core.config import MissingSettingsError, load_settings
from app.core.errors import PaymentProviderRejected, PaymentProviderUnavailable
from app.integrations.paystack import PaystackClient, valid_signature
from app.modules.payments.service import BILLING_CALLBACK_PATH, PLACEMENT_CALLBACK_PATH, new_reference, scrub

WEB_ROUTES = Path(__file__).parents[4] / "apps/web/src/config/routes.ts"


def test_signature_is_hmac_sha512_of_the_raw_body() -> None:
    body = b'{"event":"charge.success"}'
    good = hmac.new(b"sk_test_abc", body, hashlib.sha512).hexdigest()

    assert valid_signature(body, good, "sk_test_abc")
    assert not valid_signature(body, good, "sk_test_other")
    assert not valid_signature(body + b" ", good, "sk_test_abc")  # the raw body, byte for byte
    assert not valid_signature(body, None, "sk_test_abc")
    assert not valid_signature(body, "", "sk_test_abc")


@pytest.mark.parametrize(
    ("app_env", "key", "accepted"),
    [
        ("test", "sk_test_abcdef123456", True),
        ("development", "sk_live_abcdef123456", False),
        ("test", "sk_live_abcdef123456", False),
        ("test", "pk_test_abcdef123456", False),  # a public key in the secret's place
    ],
)
def test_live_keys_only_in_production(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, app_env: str, key: str, accepted: bool
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", key)

    if accepted:
        assert load_settings().PAYSTACK_SECRET_KEY.get_secret_value() == key
    else:
        with pytest.raises(MissingSettingsError) as raised:
            load_settings()
        assert key not in str(raised.value)  # the key itself is never echoed


SECRET = "sk_test_unit_secret_0123456789"
CHECKOUT = {
    "email": "family@demo.hv",
    "amount_kobo": 2_000_000,
    "reference": "HV-PF-UNIT",
    "callback_url": "http://localhost:3000/family/payments/callback",
    "metadata": {},
}


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> PaystackClient:
    return PaystackClient(SECRET, base_url="https://paystack.test", transport=httpx.MockTransport(handler))


def _raise(exc: Exception) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc

    return handler


@pytest.mark.parametrize(
    "handler",
    [
        _raise(httpx.ConnectError("connection refused")),
        _raise(httpx.ReadTimeout("timed out")),
        lambda _: httpx.Response(503, text="<html>Service Unavailable</html>"),
        lambda _: httpx.Response(200, text="not json"),
    ],
    ids=["connect-error", "timeout", "5xx", "unreadable-body"],
)
def test_an_unreachable_or_failing_provider_is_unavailable(
    handler: Callable[[httpx.Request], httpx.Response],
) -> None:
    with pytest.raises(PaymentProviderUnavailable) as raised:
        asyncio.run(_client(handler).initialize(**CHECKOUT))

    error = raised.value
    assert (error.code, error.status) == ("PAYMENT_PROVIDER_ERROR", 502)
    assert error.details == {"reason": "unavailable"}
    assert "could not be reached" in error.message


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(400, json={"status": False, "message": '"email" must be a valid email'}),
        httpx.Response(401, json={"status": False, "message": "Invalid key"}),
        httpx.Response(200, json={"status": False, "message": "Duplicate Transaction Reference"}),
    ],
    ids=["400-bad-email", "401-bad-key", "status-false"],
)
def test_a_refusal_is_rejected_without_paystacks_words(response: httpx.Response) -> None:
    with pytest.raises(PaymentProviderRejected) as raised:
        asyncio.run(_client(lambda _: response).initialize(**CHECKOUT))

    error = raised.value
    assert (error.code, error.status) == ("PAYMENT_PROVIDER_ERROR", 502)
    assert error.details == {"reason": "rejected"}
    assert error.message == "The payment provider declined this payment request."
    shown = f"{error.message} {error.details}"
    for private in (response.json()["message"], SECRET, "family@demo.hv"):
        assert private not in shown


def test_a_success_returns_the_checkout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == f"Bearer {SECRET}"
        data = {
            "authorization_url": "https://checkout.paystack.test/x",
            "access_code": "ac",
            "reference": "R",
        }
        return httpx.Response(200, json={"status": True, "data": data})

    initialized = asyncio.run(_client(handler).initialize(**CHECKOUT))

    assert initialized.authorization_url == "https://checkout.paystack.test/x"


def test_scrub_drops_card_authorization() -> None:
    event = {
        "event": "charge.success",
        "data": {
            "reference": "R1",
            "authorization": {"authorization_code": "AUTH_x"},
            "ip_address": "1.2.3.4",
        },
    }

    assert scrub(event) == {"event": "charge.success", "data": {"reference": "R1"}}


def test_references_are_unique_and_prefixed() -> None:
    first, second = new_reference("PF"), new_reference("PF")

    assert first != second
    assert first.startswith("HV-PF-")
    assert len(first) == len("HV-PF-") + 12


def test_callback_pages_exist_in_the_web_routes() -> None:
    routes = WEB_ROUTES.read_text(encoding="utf-8")

    assert f'paymentCallback: "{PLACEMENT_CALLBACK_PATH}"' in routes
    assert f'billing: "{BILLING_CALLBACK_PATH}"' in routes
