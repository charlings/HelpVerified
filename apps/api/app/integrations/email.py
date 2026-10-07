"""Transactional email behind a small interface (backend.md §7). Providers arrive in B6.

`OutboxEmailSender` (development) writes each message to a JSON file in EMAIL_OUTBOX_DIR,
which is git-ignored. Links contain one-time tokens, so messages never go to the logs.
Settings refuse the outbox in staging and production.
"""

import asyncio
import json
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol

from app.core.clock import utcnow


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
