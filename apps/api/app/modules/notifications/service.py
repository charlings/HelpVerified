"""The notification feed and its delivery (backend.md §7, ADR 0015).

Services write notifications with `NotificationRepository.add` inside their own transaction, so a
notification exists exactly when the event it reports was committed. Delivery happens afterwards:
`deliver_due` leases due rows, mirrors each to Firestore and emails it (outside any transaction), then
records what worked. Anything that failed is retried with backoff, up to NOTIFICATION_MAX_ATTEMPTS. A
delivery failure never touches business state: the event is already committed.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import NotFound
from app.core.logging import get_logger
from app.core.pagination import PageParams
from app.integrations.email import EmailMessage, EmailSender
from app.integrations.firestore import MirroredNotification, MirrorError, NotificationMirror
from app.modules.notifications.models import Notification
from app.modules.notifications.repository import PENDING, NotificationRepository, Recipient
from app.modules.notifications.schemas import NotificationOut
from app.modules.users.models import User

log = get_logger("app.notifications")

BATCH = 50
LEASE = timedelta(minutes=5)  # a crashed delivery is picked up again after this
MAX_BACKOFF = timedelta(hours=6)


def backoff(attempts: int) -> timedelta:
    """2, 4, 8 ... minutes after each failed attempt, at most six hours."""
    return min(timedelta(minutes=2**attempts), MAX_BACKOFF)


def email_for(notification: Snapshot, recipient: Recipient, web_base_url: str) -> EmailMessage:
    link = f"{web_base_url.rstrip('/')}{notification.link}" if notification.link else None
    text = f"Hello {recipient.full_name},\n\n{notification.body}\n\n"
    if link:
        text += f"Open HelpVerified: {link}\n\n"
    text += "You're receiving this because you have a HelpVerified account."
    return EmailMessage(
        to=recipient.email, subject=notification.title, text=text, kind=notification.kind, link=link
    )


@dataclass(frozen=True)
class Snapshot:
    """A claimed row's values, read inside the claiming transaction."""

    id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    title: str
    body: str
    link: str | None
    created_at: datetime
    read: bool
    wants_email: bool
    wants_mirror: bool

    @classmethod
    def of(cls, row: Notification, mirror_on: bool) -> Snapshot:
        return cls(
            id=row.id,
            user_id=row.user_id,
            kind=row.kind,
            title=row.title,
            body=row.body,
            link=row.link,
            created_at=row.created_at,
            read=row.read_at is not None,
            wants_email=row.email and row.emailed_at is None,
            wants_mirror=mirror_on and row.mirrored_at is None,
        )


class NotificationService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        email: EmailSender | None = None,
        mirror: NotificationMirror | None = None,
    ) -> None:
        self.session = session
        self.settings = settings
        self.email = email
        self.mirror = mirror
        self.notifications = NotificationRepository(session)

    @property
    def _mirror_on(self) -> bool:
        """The app builds a mirror only when NOTIFICATIONS_MIRROR asks for one (tests pass a fake)."""
        return self.mirror is not None

    # The feed

    async def page(
        self, user: User, params: PageParams, *, unread_only: bool
    ) -> tuple[list[NotificationOut], int, int]:
        async with self.session.begin():
            rows, total = await self.notifications.page(user.id, params, unread_only=unread_only)
            unread = await self.notifications.unread_count(user.id)
        return [NotificationOut.of(row) for row in rows], total, unread

    async def mark_read(self, user: User, notification_id: uuid.UUID) -> NotificationOut:
        """Someone else's notification is 404 (backend.md §2)."""
        async with self.session.begin():
            row = await self.notifications.get_owned(notification_id, user.id)
            if row is None:
                raise NotFound()
            if row.read_at is None:
                now = utcnow()
                row.read_at = now
                if self._mirror_on:  # the mirror shows `read` too
                    row.mirrored_at = None
                    row.next_attempt_at = now
                    self.session.info[PENDING] = True
            return NotificationOut.of(row)

    async def mark_all_read(self, user: User) -> int:
        async with self.session.begin():
            count = await self.notifications.mark_all_read(user.id, utcnow(), remirror=self._mirror_on)
        if count and self._mirror_on:
            self.session.info[PENDING] = True
        return count

    # Delivery

    async def deliver_due(self) -> int:
        """Delivers up to BATCH due notifications; returns how many were claimed."""
        now = utcnow()
        async with self.session.begin():
            rows = await self.notifications.claim_due(now, now + LEASE, BATCH)
            recipients = await self.notifications.recipients(list({row.user_id for row in rows}))
            claimed = [Snapshot.of(row, self._mirror_on) for row in rows]
        for item in claimed:
            await self._deliver(item, recipients.get(item.user_id))
        return len(claimed)

    async def _deliver(self, item: Snapshot, recipient: Recipient | None) -> None:
        errors: list[str] = []
        mirrored = emailed = False
        if item.wants_mirror and self.mirror is not None:
            try:
                await self.mirror.write(
                    MirroredNotification(
                        item.id,
                        item.user_id,
                        item.kind,
                        item.title,
                        item.body,
                        item.link,
                        item.created_at,
                        item.read,
                    )
                )
                mirrored = True
            except MirrorError:
                errors.append("MirrorError")
        # Suspended accounts still see the feed, but aren't emailed.
        send_email = (
            item.wants_email and recipient is not None and recipient.active and self.email is not None
        )
        if send_email:
            assert self.email is not None  # noqa: S101  # checked above
            assert recipient is not None  # noqa: S101
            try:
                await self.email.send(email_for(item, recipient, self.settings.WEB_BASE_URL))
                emailed = True
            except Exception as exc:  # any provider failure: retried, never raised into the caller
                errors.append(type(exc).__name__)
        await self._record(item, recipient, mirrored=mirrored, emailed=emailed, errors=errors)

    async def _record(
        self, item: Snapshot, recipient: Recipient | None, *, mirrored: bool, emailed: bool, errors: list[str]
    ) -> None:
        now = utcnow()
        async with self.session.begin():
            row = await self.notifications.for_delivery(item.id)
            if row is None:  # the user was deleted meanwhile
                return
            # If it was marked read while the mirror was being written, that write showed it unread:
            # leave it pending so the next round writes `read`.
            if mirrored and (row.read_at is not None) == item.read:
                row.mirrored_at = now
            if emailed:
                row.emailed_at = now
            pending_mirror = self._mirror_on and row.mirrored_at is None
            pending_email = (
                row.email and row.emailed_at is None and recipient is not None and recipient.active
            )
            if not (pending_mirror or pending_email):
                row.next_attempt_at = None
                row.last_error = None
            elif row.attempts >= self.settings.NOTIFICATION_MAX_ATTEMPTS:
                row.next_attempt_at = None
                row.last_error = ",".join(errors) or row.last_error
                log.error("notification.gave_up", notification_id=str(row.id), error=row.last_error)
            else:
                row.next_attempt_at = now + (backoff(row.attempts) if errors else timedelta())
                row.last_error = ",".join(errors) or None
        if errors:
            log.warning("notification.delivery_failed", notification_id=str(item.id), error=",".join(errors))
