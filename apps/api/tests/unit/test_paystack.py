"""Paystack signing, key safety, scrubbing, and the callback pages existing in the web app."""

import hashlib
import hmac
from pathlib import Path

import pytest

from app.core.config import MissingSettingsError, load_settings
from app.integrations.paystack import valid_signature
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
