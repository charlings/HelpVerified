"""`POST /contact`: the public contact form (B7). Messages are emailed to CONTACT_INBOX, never stored."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.integrations.email import SmtpEmailSender
from tests.conftest import TEST_ENV, ApiFactory
from tests.fakes import MemoryEmailSender
from tests.helpers import API, error_code


def body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "Ada Okafor",
        "email": "ada@example.com",
        "phone": "0803 123 4567",
        "topic": "family",
        "message": "We're looking for a live-in nanny in Lekki from next month.",
    }
    return base | overrides


def test_a_message_is_accepted_and_emailed_to_the_inbox(api: TestClient, outbox: MemoryEmailSender) -> None:
    response = api.post(f"{API}/contact", json=body())

    assert response.status_code == 202, response.text
    assert response.json() == {"received": True}
    email = outbox.last("contact_message")
    assert email.to == "contact@helpverified.local"  # the outbox placeholder: CONTACT_INBOX unset in tests
    assert email.reply_to == "ada@example.com"
    assert email.subject == "[Contact] Family enquiry"
    assert "Ada Okafor" in email.text
    assert "0803 123 4567" in email.text
    assert "live-in nanny in Lekki" in email.text


def test_the_phone_is_optional(api: TestClient, outbox: MemoryEmailSender) -> None:
    without = body()
    del without["phone"]

    assert api.post(f"{API}/contact", json=without).status_code == 202
    assert api.post(f"{API}/contact", json=body(phone="")).status_code == 202
    assert "Phone: not given" in outbox.last("contact_message").text


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "A"),
        ("email", "not-an-email"),
        ("phone", "call me"),
        ("topic", "complaint"),
        ("message", "Too short"),
        ("message", "x" * 2001),
    ],
)
def test_invalid_fields_are_422_with_field_errors(
    api: TestClient, outbox: MemoryEmailSender, field: str, value: str
) -> None:
    response = api.post(f"{API}/contact", json=body(**{field: value}))

    assert response.status_code == 422
    assert error_code(response) == "VALIDATION_ERROR"
    assert field in response.json()["error"]["details"]["fields"]
    assert outbox.sent == []


def test_user_input_never_reaches_a_header(api: TestClient, outbox: MemoryEmailSender) -> None:
    """A newline in the name can't add headers: the name only appears in the body."""
    response = api.post(f"{API}/contact", json=body(name="Ada\r\nBcc: victim@example.com"))

    assert response.status_code == 202
    email = outbox.last("contact_message")
    mime = SmtpEmailSender("smtp.invalid", 587, "u", "p", "HelpVerified <no-reply@helpverified.local>").mime(
        email
    )
    assert mime["Bcc"] is None
    assert mime["Subject"] == "[Contact] Family enquiry"
    assert mime["Reply-To"] == "ada@example.com"


def test_the_form_is_rate_limited_per_ip(make_api: ApiFactory, outbox: MemoryEmailSender) -> None:
    api = make_api(RATE_LIMIT_CONTACT_PER_HOUR=2)

    assert api.post(f"{API}/contact", json=body()).status_code == 202
    assert api.post(f"{API}/contact", json=body(email="bola@example.com")).status_code == 202
    response = api.post(f"{API}/contact", json=body(email="chidi@example.com"))

    assert response.status_code == 429
    assert error_code(response) == "RATE_LIMITED"
    assert int(response.headers["Retry-After"]) > 0
    assert len(outbox.sent) == 2


def test_with_an_inbox_set_messages_go_there(make_api: ApiFactory, outbox: MemoryEmailSender) -> None:
    api = make_api(CONTACT_INBOX="hello@helpverified.ng")

    assert api.post(f"{API}/contact", json=body()).status_code == 202
    assert outbox.last("contact_message").to == "hello@helpverified.ng"


def test_smtp_without_an_inbox_accepts_but_sends_nothing(
    make_api: ApiFactory, outbox: MemoryEmailSender
) -> None:
    """Development with real SMTP and no CONTACT_INBOX: nothing is emailed to a made-up address."""
    api = make_api(EMAIL_PROVIDER="smtp")

    assert api.post(f"{API}/contact", json=body()).status_code == 202
    assert outbox.sent == []


def test_deployed_settings_require_an_inbox() -> None:
    deployed = TEST_ENV | {
        "APP_ENV": "staging",
        "EMAIL_PROVIDER": "smtp",
        "SMTP_HOST": "smtp.example.com",
        "SMTP_USERNAME": "user",
        "SMTP_PASSWORD": "pass",
    }
    with pytest.raises(ValueError, match="CONTACT_INBOX"):
        Settings(_env_file=None, **deployed)  # type: ignore[arg-type]
    assert Settings(_env_file=None, **deployed, CONTACT_INBOX="hello@helpverified.ng")  # type: ignore[arg-type]
