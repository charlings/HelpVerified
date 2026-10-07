"""audit_log writes and reads."""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.modules.admin.models import AuditAction, AuditLog
from app.modules.users.models import User


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
