"""audit_log and admin_alerts writes and reads."""

import uuid
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.modules.admin.models import AdminAlert, AlertKind, AuditAction, AuditLog
from app.modules.users.models import User


class AlertRepository:
    """Persistent admin alerts (ADR 0017 section F). Raising is idempotent: the partial unique index allows
    one open alert per (kind, subject_key), so jobs can raise the same alert every run."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def raise_alert(
        self,
        kind: AlertKind,
        subject_key: str,
        details: dict[str, Any],
        payment_id: uuid.UUID | None = None,
    ) -> bool:
        """True if a new alert was opened (False: the same one was already open)."""
        result = await self.session.execute(
            insert(AdminAlert)
            .values(kind=kind.value, subject_key=subject_key, details=details, payment_id=payment_id)
            .on_conflict_do_nothing(
                index_elements=["kind", "subject_key"], index_where=text("resolved_at IS NULL")
            )
            .returning(AdminAlert.id)
        )
        return result.scalar() is not None

    async def resolve_by_system(
        self, kinds: list[AlertKind], subject_key: str, note: str, now: datetime
    ) -> int:
        """Provider evidence closed the issue (for example a refund confirmed `processed`)."""
        result = await self.session.execute(
            update(AdminAlert)
            .where(
                AdminAlert.kind.in_([k.value for k in kinds]),
                AdminAlert.subject_key == subject_key,
                AdminAlert.resolved_at.is_(None),
            )
            .values(resolved_at=now, resolution_note=note)
        )
        return int(getattr(result, "rowcount", 0) or 0)

    async def get(self, alert_id: uuid.UUID, *, for_update: bool = False) -> AdminAlert | None:
        query = select(AdminAlert).where(AdminAlert.id == alert_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def page(
        self, params: PageParams, state: Literal["open", "resolved", "all"]
    ) -> tuple[list[AdminAlert], int]:
        """Open ones oldest first (work the queue in order); otherwise newest first."""
        query = select(AdminAlert)
        count = select(func.count()).select_from(AdminAlert)
        if state == "open":
            query = query.where(AdminAlert.resolved_at.is_(None)).order_by(
                AdminAlert.opened_at, AdminAlert.id
            )
            count = count.where(AdminAlert.resolved_at.is_(None))
        elif state == "resolved":
            query = query.where(AdminAlert.resolved_at.is_not(None)).order_by(AdminAlert.resolved_at.desc())
            count = count.where(AdminAlert.resolved_at.is_not(None))
        else:
            query = query.order_by(AdminAlert.opened_at.desc(), AdminAlert.id)
        rows = await self.session.scalars(query.offset(params.offset).limit(params.page_size))
        total = await self.session.scalar(count) or 0
        return list(rows), total

    async def open_count(self) -> int:
        return int(
            await self.session.scalar(
                select(func.count()).select_from(AdminAlert).where(AdminAlert.resolved_at.is_(None))
            )
            or 0
        )


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def write(
        self,
        actor_id: uuid.UUID | None,
        action: AuditAction,
        entity: str,
        entity_id: uuid.UUID,
        data: dict[str, Any],
        ip: str | None = None,
    ) -> None:
        self.session.add(
            AuditLog(
                actor_id=actor_id, action=action.value, entity=entity, entity_id=entity_id, data=data, ip=ip
            )
        )
        await self.session.flush()

    async def page(
        self, params: PageParams, action: str | None = None
    ) -> tuple[list[tuple[AuditLog, User | None]], int]:
        """Newest first, with the actor."""
        query = select(AuditLog, User).outerjoin(User, User.id == AuditLog.actor_id)
        count = select(func.count()).select_from(AuditLog)
        if action:
            query = query.where(AuditLog.action == action)
            count = count.where(AuditLog.action == action)
        rows = await self.session.execute(
            query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(count) or 0
        return [(entry, actor) for entry, actor in rows], total

    async def for_entity(self, entity: str, entity_id: uuid.UUID) -> list[tuple[AuditLog, User | None]]:
        rows = await self.session.execute(
            select(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.entity == entity, AuditLog.entity_id == entity_id)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        )
        return [(entry, actor) for entry, actor in rows]
