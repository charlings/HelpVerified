"""Family queries."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.families.models import Family


class FamilyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def for_user(self, user_id: uuid.UUID, *, for_update: bool = False) -> Family | None:
        query = select(Family).where(Family.user_id == user_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def get(self, family_id: uuid.UUID) -> Family | None:
        return await self.session.get(Family, family_id)

    async def add(self, family: Family) -> Family:
        self.session.add(family)
        await self.session.flush()
        await self.session.refresh(family)
        return family
