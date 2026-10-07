"""User queries."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import EmailTaken
from app.modules.users.models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        # citext column: the comparison is case-insensitive in the database.
        return await self.session.scalar(select(User).where(User.email == email.strip()))

    async def get_by_email_for_update(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == email.strip()).with_for_update())

    async def add(self, user: User) -> User:
        self.session.add(user)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            if "uq_users_email" in str(exc.orig):
                raise EmailTaken() from exc
            raise
        await self.session.refresh(user)
        return user
