"""Transactional email behind a small interface (backend.md §7).

- `OutboxEmailSender` (development) writes each message to a JSON file in EMAIL_OUTBOX_DIR, which is
  git-ignored. Settings refuse the outbox in staging and production.
- `SmtpEmailSender` sends through a provider's SMTP relay (B6, ADR 0015). Every major provider offers one,
  so choosing or changing provider is configuration only.

Links can contain one-time tokens, so messages never go to the logs.
"""

import asyncio
import json
import smtplib
import ssl
import uuid
from dataclasses import asdict, dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import make_msgid
from pathlib import Path
from typing import Protocol

from app.core.clock import utcnow
from app.core.config import Settings


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    kind: str  # template name, e.g. "verify_email"
    link: str | None = None


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class OutboxEmailSender:
    def __init__(self, directory: str | Path, sender: str) -> None:
        self.directory = Path(directory)
        self.sender = sender

    async def send(self, message: EmailMessage) -> None:
        await asyncio.to_thread(self._write, message)

    def _write(self, message: EmailMessage) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        now = utcnow()
        path = self.directory / f"{now:%Y%m%dT%H%M%S}-{message.kind}-{uuid.uuid4().hex[:8]}.json"
        body = {"from": self.sender, "sent_at": now.isoformat(), **asdict(message)}
        path.write_text(json.dumps(body, indent=2), encoding="utf-8")


class SmtpEmailSender:
    """STARTTLS on 587 (or 2525), implicit TLS on 465; certificates are always verified. smtplib blocks,
    so each send runs in a worker thread."""

    def __init__(
        self, host: str, port: int, username: str, password: str, sender: str, timeout: float = 15.0
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self._password = password
        self.sender = sender
        self.timeout = timeout

    async def send(self, message: EmailMessage) -> None:
        await asyncio.to_thread(self._send, message)

    def mime(self, message: EmailMessage) -> MimeMessage:
        mime = MimeMessage()
        mime["From"] = self.sender
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime["Message-ID"] = make_msgid(domain=self.sender.rsplit("@", 1)[-1].rstrip(">"))
        mime.set_content(message.text)
        return mime

    def _send(self, message: EmailMessage) -> None:
        context = ssl.create_default_context()
        smtp: smtplib.SMTP
        if self.port == 465:
            smtp = smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout, context=context)
        else:
            smtp = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
        with smtp:
            if self.port != 465:
                smtp.starttls(context=context)
            smtp.login(self.username, self._password)
            smtp.send_message(self.mime(message))


def email_sender_from(settings: Settings) -> EmailSender:
    """The sender EMAIL_PROVIDER names (settings guarantee the SMTP keys are present)."""
    if settings.EMAIL_PROVIDER == "smtp":
        assert settings.SMTP_HOST  # noqa: S101
        assert settings.SMTP_USERNAME  # noqa: S101
        assert settings.SMTP_PASSWORD  # noqa: S101
        return SmtpEmailSender(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            settings.SMTP_USERNAME,
            settings.SMTP_PASSWORD.get_secret_value(),
            settings.EMAIL_FROM,
        )
    return OutboxEmailSender(settings.EMAIL_OUTBOX_DIR, settings.EMAIL_FROM)
