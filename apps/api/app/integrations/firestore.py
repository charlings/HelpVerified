"""The Firestore mirror of the notification feed (backend.md §7, ADR 0015), behind a small interface.

A small client over Firestore's REST API rather than the Firebase SDK (the same choice as Paystack, ADR
0014): a service-account key signs a short JWT (RS256), Google swaps it for an hour-long access token, and
each notification is written whole to `notifications/{user_id}/items/{id}`. Writing the whole document
makes a retry harmless. Keys and tokens are never logged.
"""

import json
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

import httpx
import jwt

from app.core.config import Settings
from app.core.logging import get_logger

FIRESTORE_BASE = "https://firestore.googleapis.com/v1"
SCOPE = "https://www.googleapis.com/auth/datastore"
log = get_logger("app.firestore")


class MirrorError(Exception):
    """The mirror couldn't be written. Delivery retries later; business state is never affected."""


@dataclass(frozen=True)
class MirroredNotification:
    id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    title: str
    body: str
    link: str | None
    created_at: datetime
    read: bool


class NotificationMirror(Protocol):
    async def write(self, item: MirroredNotification) -> None: ...


def document_fields(item: MirroredNotification) -> dict[str, Any]:
    """Firestore's typed-value encoding of `{type, title, body, link, created_at, read}` (backend.md §7)."""
    return {
        "type": {"stringValue": item.kind},
        "title": {"stringValue": item.title},
        "body": {"stringValue": item.body},
        "link": {"stringValue": item.link} if item.link else {"nullValue": None},
        "created_at": {"timestampValue": item.created_at.isoformat()},
        "read": {"booleanValue": item.read},
    }


class FirestoreClient:
    def __init__(
        self,
        project_id: str,
        credentials_file: str,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,  # tests pass httpx.MockTransport
    ) -> None:
        try:
            account = json.loads(Path(credentials_file).read_text(encoding="utf-8"))
            self._email: str = account["client_email"]
            self._key: str = account["private_key"]
            self._token_uri: str = account.get("token_uri", "https://oauth2.googleapis.com/token")
        except (OSError, ValueError, KeyError) as exc:
            # Names the setting, not the file's contents.
            raise RuntimeError("FIREBASE_CREDENTIALS_FILE isn't a readable service-account JSON key") from exc
        self._documents = f"{FIRESTORE_BASE}/projects/{project_id}/databases/(default)/documents"
        self._timeout = timeout
        self._transport = transport
        self._token: str | None = None
        self._token_expires = 0.0

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        if self._token and time.time() < self._token_expires - 60:
            return self._token
        now = int(time.time())
        assertion = jwt.encode(
            {"iss": self._email, "scope": SCOPE, "aud": self._token_uri, "iat": now, "exp": now + 3600},
            self._key,
            algorithm="RS256",
        )
        response = await client.post(
            self._token_uri,
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        )
        if response.status_code != 200:
            log.warning("firestore.token_refused", status=response.status_code)
            raise MirrorError("token refused")
        body = response.json()
        self._token = str(body["access_token"])
        self._token_expires = now + float(body.get("expires_in", 3600))
        return self._token

    async def write(self, item: MirroredNotification) -> None:
        url = f"{self._documents}/notifications/{item.user_id}/items/{item.id}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                token = await self._access_token(client)
                response = await client.patch(
                    url, json={"fields": document_fields(item)}, headers={"Authorization": f"Bearer {token}"}
                )
        except httpx.HTTPError as exc:
            raise MirrorError(type(exc).__name__) from exc
        if response.status_code == 401:
            self._token = None  # revoked or expired early: fetch a new one next time
        if response.status_code >= 400:
            log.warning("firestore.write_refused", status=response.status_code)
            raise MirrorError(f"HTTP {response.status_code}")


def mirror_from(settings: Settings) -> NotificationMirror | None:
    """The mirror NOTIFICATIONS_MIRROR names, or None (settings guarantee the Firebase keys are present)."""
    if settings.NOTIFICATIONS_MIRROR != "firestore":
        return None
    assert settings.FIREBASE_PROJECT_ID  # noqa: S101
    assert settings.FIREBASE_CREDENTIALS_FILE  # noqa: S101
    return FirestoreClient(settings.FIREBASE_PROJECT_ID, settings.FIREBASE_CREDENTIALS_FILE)
