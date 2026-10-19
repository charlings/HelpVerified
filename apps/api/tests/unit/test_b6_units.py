"""B6 pieces that need nothing running: messages, backoff, settings, the Firestore and SMTP clients, and
the job schedule."""

import asyncio
import json
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, ClassVar

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import MissingSettingsError, load_settings
from app.core.dates import LAGOS
from app.integrations import email as email_module
from app.integrations.email import EmailMessage, SmtpEmailSender
from app.integrations.firestore import FirestoreClient, MirroredNotification, MirrorError, document_fields
from app.jobs.registry import JOBS
from app.jobs.scheduler import start_scheduler
from app.modules.notifications import messages
from app.modules.notifications.service import backoff
from app.modules.verification.models import VerificationKind

WEB_ROUTES = Path(__file__).parents[4] / "apps/web/src/config/routes.ts"
ID = uuid.UUID("9d0c1c9e-5f7e-4d43-9b1b-8f2b6f3f3a10")


# Messages


@pytest.mark.parametrize(
    "path",
    [
        messages.FAMILY_REQUEST,
        messages.FAMILY_PLACEMENT,
        messages.FAMILY_PAYMENTS,
        messages.AGENCY_HOME,
        messages.AGENCY_WORKER,
        messages.AGENCY_PLACEMENT,
        messages.AGENCY_BILLING,
        messages.ADMIN_ALERTS,
    ],
)
def test_links_point_at_web_routes(path: str) -> None:
    """Each link matches a route in routes.ts (`/x/{id}` ↔ `` `/x/${id}` ``)."""
    routes = WEB_ROUTES.read_text(encoding="utf-8")
    expected = path.replace("{id}", "${id}")
    assert re.search(rf'["`]{re.escape(expected)}["`]', routes), f"{path} isn't a web route"


def test_naira_formatting() -> None:
    assert messages.naira(2_000_000) == "₦20,000"
    assert messages.naira(150) == "₦1"


def test_expired_checks_read_naturally() -> None:
    one = messages.checks_expired(ID, "Amaka Obi", [VerificationKind.address])
    two = messages.checks_expired(ID, "Amaka Obi", [VerificationKind.references, VerificationKind.address])

    assert one.title == "Amaka Obi's address check has expired"
    assert two.title == "Amaka Obi's references and address checks have expired"
    assert "checks are verified again" in two.body


def test_hold_release_to_the_agency_is_in_app_only() -> None:
    assert messages.hold_released_agency(ID, "Okafor family", "Amaka Obi", expired=True).email is False
    assert messages.proposal_received(ID, "Sunrise", "Amaka Obi", "nanny").email is True


def test_backoff_doubles_up_to_six_hours() -> None:
    assert [backoff(n) for n in (1, 2, 3)] == [
        timedelta(minutes=2),
        timedelta(minutes=4),
        timedelta(minutes=8),
    ]
    assert backoff(20) == timedelta(hours=6)


# Settings


@pytest.mark.parametrize(
    ("env", "missing"),
    [
        ({"EMAIL_PROVIDER": "smtp", "SMTP_HOST": "smtp.example.com"}, "SMTP_USERNAME, SMTP_PASSWORD"),
        ({"NOTIFICATIONS_MIRROR": "firestore"}, "FIREBASE_PROJECT_ID, FIREBASE_CREDENTIALS_FILE"),
    ],
)
def test_a_chosen_provider_needs_its_keys(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, env: dict[str, str], missing: str
) -> None:
    monkeypatch.chdir(tmp_path)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    with pytest.raises(MissingSettingsError, match=missing):
        load_settings()


def test_deployed_environments_need_a_real_email_provider(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("APP_ENV", "staging")

    with pytest.raises(MissingSettingsError, match="EMAIL_PROVIDER=smtp"):
        load_settings()


def test_smtp_settings_are_accepted(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    for key, value in {
        "EMAIL_PROVIDER": "smtp",
        "SMTP_HOST": "smtp.example.com",
        "SMTP_USERNAME": "resend",
        "SMTP_PASSWORD": "re_secret_value",
    }.items():
        monkeypatch.setenv(key, value)

    settings = load_settings()

    assert isinstance(email_module.email_sender_from(settings), SmtpEmailSender)


# SMTP


class FakeSmtp:
    instances: ClassVar[list[FakeSmtp]] = []

    def __init__(self, host: str, port: int, timeout: float = 0, context: Any = None) -> None:
        self.host, self.port = host, port
        self.calls: list[str] = []
        self.sent: list[Any] = []
        FakeSmtp.instances.append(self)

    def __enter__(self) -> FakeSmtp:
        return self

    def __exit__(self, *_: object) -> None:
        self.calls.append("quit")

    def starttls(self, context: Any = None) -> None:
        self.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.calls.append(f"login:{user}")

    def send_message(self, message: Any) -> None:
        self.sent.append(message)


MESSAGE = EmailMessage(to="ada@example.com", subject="Hello", text="Body", kind="test", link=None)


@pytest.mark.parametrize(
    ("port", "factory", "calls"),
    [(587, "SMTP", ["starttls", "login:u", "quit"]), (465, "SMTP_SSL", ["login:u", "quit"])],
)
def test_smtp_uses_tls_and_logs_in(
    monkeypatch: pytest.MonkeyPatch, port: int, factory: str, calls: list[str]
) -> None:
    FakeSmtp.instances.clear()
    monkeypatch.setattr(f"smtplib.{factory}", FakeSmtp)
    sender = SmtpEmailSender("smtp.example.com", port, "u", "p", "HelpVerified <no-reply@helpverified.ng>")

    asyncio.run(sender.send(MESSAGE))

    [smtp] = FakeSmtp.instances
    assert smtp.calls == calls
    [sent] = smtp.sent
    assert (sent["To"], sent["Subject"], sent["From"]) == (
        "ada@example.com",
        "Hello",
        "HelpVerified <no-reply@helpverified.ng>",
    )
    assert sent["Message-ID"].endswith("@helpverified.ng>")


# Firestore


def service_account(tmp_path: Path) -> tuple[Path, Any]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    path = tmp_path / "service-account.json"
    path.write_text(
        json.dumps(
            {
                "client_email": "hv@hv-test.iam.gserviceaccount.com",
                "private_key": pem,
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        ),
        encoding="utf-8",
    )
    return path, key.public_key()


ITEM = MirroredNotification(
    id=ID,
    user_id=uuid.UUID("11111111-1111-4111-8111-111111111111"),
    kind="proposal_received",
    title="New proposal",
    body="Sunrise has proposed Amaka Obi.",
    link="/family/requests/1",
    created_at=datetime(2026, 10, 8, 9, 30, tzinfo=UTC),
    read=False,
)


def test_document_fields_use_firestore_types() -> None:
    fields = document_fields(ITEM)

    assert fields["type"] == {"stringValue": "proposal_received"}
    assert fields["read"] == {"booleanValue": False}
    assert fields["created_at"] == {"timestampValue": "2026-10-08T09:30:00+00:00"}
    assert document_fields(MirroredNotification(**{**ITEM.__dict__, "link": None}))["link"] == {
        "nullValue": None
    }


def test_firestore_signs_a_token_and_writes_the_whole_document(tmp_path: Path) -> None:
    path, public_key = service_account(tmp_path)
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "ya29.token", "expires_in": 3600})
        return httpx.Response(200, json={})

    client = FirestoreClient("hv-test", str(path), transport=httpx.MockTransport(handler))
    asyncio.run(client.write(ITEM))
    asyncio.run(client.write(ITEM))  # the token is reused

    token_request, write, second_write = seen
    assertion = dict(x.split("=", 1) for x in token_request.content.decode().split("&"))["assertion"]
    claims = jwt.decode(
        assertion, public_key, algorithms=["RS256"], audience="https://oauth2.googleapis.com/token"
    )
    assert claims["iss"] == "hv@hv-test.iam.gserviceaccount.com"
    assert claims["scope"] == "https://www.googleapis.com/auth/datastore"
    assert write.method == "PATCH"
    assert write.url.path == (
        f"/v1/projects/hv-test/databases/(default)/documents/notifications/{ITEM.user_id}/items/{ITEM.id}"
    )
    assert write.headers["Authorization"] == "Bearer ya29.token"
    assert json.loads(write.content)["fields"]["title"] == {"stringValue": "New proposal"}
    assert second_write.url == write.url


@pytest.mark.parametrize("status", [401, 403, 500])
def test_firestore_refusals_raise_mirror_error(tmp_path: Path, status: int) -> None:
    path, _ = service_account(tmp_path)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        return httpx.Response(status, json={"error": {"message": "nope"}})

    client = FirestoreClient("hv-test", str(path), transport=httpx.MockTransport(handler))
    with pytest.raises(MirrorError):
        asyncio.run(client.write(ITEM))


def test_a_bad_key_file_names_the_setting_not_the_contents(tmp_path: Path) -> None:
    path = tmp_path / "key.json"
    path.write_text('{"private_key": "-----BEGIN PRIVATE KEY----- secret"}', encoding="utf-8")

    with pytest.raises(RuntimeError) as raised:
        FirestoreClient("hv-test", str(path))

    assert "FIREBASE_CREDENTIALS_FILE" in str(raised.value)
    assert "secret" not in str(raised.value)


# The schedule


def test_job_names_are_unique_and_complete() -> None:
    names = [job.name for job in JOBS]

    assert len(names) == len(set(names))
    assert set(names) == {
        "expire_holds",
        "trial_reminders",
        "verification_expiry",
        "subscription_sync",
        "notification_retry",
        "refund_retry",
        "reconcile_checkouts",  # ADR 0017
        "watch_checkouts",
        "document_retention",
    }


class _Runner:
    async def run(self, job: object) -> int:
        return 0


def test_daily_jobs_run_at_their_wat_hour() -> None:
    async def next_runs() -> dict[str, datetime]:
        scheduler = start_scheduler(_Runner())  # type: ignore[arg-type]
        try:
            return {job.id: job.next_run_time for job in scheduler.get_jobs()}
        finally:
            scheduler.shutdown(wait=False)

    runs = asyncio.run(next_runs())

    for name, hour in (("trial_reminders", 8), ("verification_expiry", 2), ("document_retention", 3)):
        local = runs[name].astimezone(LAGOS)
        assert (local.hour, local.minute) == (hour, 0), name
    assert runs["expire_holds"] - datetime.now(UTC) <= timedelta(minutes=1)
    assert isinstance(runs["trial_reminders"].date(), date)
