"""Notification queries: writing the feed, reading it, and claiming rows for delivery."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.modules.agencies.models import Agency, AgencyMember
from app.modules.families.models import Family
from app.modules.notifications.messages import Message
from app.modules.notifications.models import Notification
from app.modules.placements.models import Placement
from app.modules.users.models import AccountStatus, User, UserRole
from app.modules.workers.models import Worker

# Set on a session that wrote notifications; `app.core.deps.get_db` then wakes the dispatcher.
PENDING = "notifications_pending"


@dataclass(frozen=True)
class Parties:
    """Who a placement notification goes to, and the names it uses."""

    family_user_id: uuid.UUID
    agency_user_ids: list[uuid.UUID]
    family_name: str
    agency_name: str
    worker_name: str
    request_id: uuid.UUID


@dataclass(frozen=True)
class Recipient:
    email: str
    full_name: str
    active: bool


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # Writing (inside the caller's business transaction)

    async def add(self, user_id: uuid.UUID, message: Message, dedupe_key: str | None = None) -> bool:
        """False when `dedupe_key` was already used: a job's reminder is written once, however often
        the job runs."""
        result = await self.session.execute(
            insert(Notification)
            .values(
                user_id=user_id,
                kind=message.kind,
                title=message.title,
                body=message.body,
                link=message.link,
                email=message.email,
                dedupe_key=dedupe_key,
            )
            .on_conflict_do_nothing(constraint="uq_notifications_dedupe_key")
            .returning(Notification.id)
        )
        added = result.scalar_one_or_none() is not None
        if added:
            self.session.info[PENDING] = True
        return added

    async def add_many(
        self, user_ids: list[uuid.UUID], message: Message, dedupe_key: str | None = None
    ) -> None:
        for user_id in user_ids:
            await self.add(user_id, message, f"{dedupe_key}:{user_id}" if dedupe_key else None)

    # Recipients

    async def agency_user_ids(self, agency_id: uuid.UUID) -> list[uuid.UUID]:
        rows = await self.session.scalars(
            select(AgencyMember.user_id)
            .where(AgencyMember.agency_id == agency_id)
            .order_by(AgencyMember.created_at)
        )
        return list(rows)

    async def super_admin_ids(self) -> list[uuid.UUID]:
        rows = await self.session.scalars(
            select(User.id)
            .where(User.role == UserRole.super_admin, User.status == AccountStatus.active)
            .order_by(User.created_at)
        )
        return list(rows)

    async def family_user_id(self, family_id: uuid.UUID) -> uuid.UUID | None:
        return await self.session.scalar(select(Family.user_id).where(Family.id == family_id))

    async def placement_parties(self, placement_id: uuid.UUID) -> Parties:
        row = (
            await self.session.execute(
                select(Placement, Family, Agency, Worker)
                .join(Family, Family.id == Placement.family_id)
                .join(Agency, Agency.id == Placement.agency_id)
                .join(Worker, Worker.id == Placement.worker_id)
                .where(Placement.id == placement_id)
            )
        ).one()
        placement, family, agency, worker = row
        return Parties(
            family_user_id=family.user_id,
            agency_user_ids=await self.agency_user_ids(agency.id),
            family_name=family.name,
            agency_name=agency.name,
            worker_name=worker.full_name,
            request_id=placement.request_id,
        )

    # Reading the feed

    async def page(
        self, user_id: uuid.UUID, params: PageParams, *, unread_only: bool
    ) -> tuple[list[Notification], int]:
        conditions = [Notification.user_id == user_id]
        if unread_only:
            conditions.append(Notification.read_at.is_(None))
        rows = await self.session.scalars(
            select(Notification)
            .where(*conditions)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(select(func.count()).select_from(Notification).where(*conditions))
        return list(rows), total or 0

    async def unread_count(self, user_id: uuid.UUID) -> int:
        query = select(func.count()).where(Notification.user_id == user_id, Notification.read_at.is_(None))
        return await self.session.scalar(query) or 0

    async def get_owned(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Notification | None:
        return await self.session.scalar(
            select(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user_id)
            .with_for_update()
        )

    async def mark_all_read(self, user_id: uuid.UUID, now: datetime, *, remirror: bool) -> int:
        values: dict[str, object] = {"read_at": now}
        if remirror:  # the mirror shows `read`, so the row is delivered again
            values |= {"mirrored_at": None, "next_attempt_at": now}
        result = await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(**values)
        )
        return int(getattr(result, "rowcount", 0) or 0)

    # Delivery

    async def claim_due(self, now: datetime, lease_until: datetime, limit: int) -> list[Notification]:
        """Rows due for delivery, leased until `lease_until` so a concurrent run (or a crash mid-delivery)
        doesn't send twice; rows another transaction holds are skipped."""
        rows = list(
            await self.session.scalars(
                select(Notification)
                .where(Notification.next_attempt_at.is_not(None), Notification.next_attempt_at <= now)
                .order_by(Notification.next_attempt_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        )
        for row in rows:
            row.attempts += 1
            row.next_attempt_at = lease_until
        await self.session.flush()
        return rows

    async def recipients(self, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, Recipient]:
        rows = await self.session.execute(
            select(User.id, User.email, User.full_name, User.status).where(User.id.in_(user_ids))
        )
        return {
            user_id: Recipient(email, full_name, status is AccountStatus.active)
            for user_id, email, full_name, status in rows
        }

    async def for_delivery(self, notification_id: uuid.UUID) -> Notification | None:
        return await self.session.scalar(
            select(Notification).where(Notification.id == notification_id).with_for_update()
        )
