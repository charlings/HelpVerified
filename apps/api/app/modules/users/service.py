"""The signed-in user's own profile (`/me`)."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

EDITABLE_FIELDS = frozenset({"full_name", "phone"})


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)

    async def update_profile(self, user: User, changes: dict[str, Any]) -> User:
        """Applies the fields that were sent. `phone=None` clears the phone; `full_name` can't be cleared."""
        async with self.session.begin():
            current = await self.users.get(user.id)
            if current is None:
                raise NotFound()
            for field, value in changes.items():
                if field not in EDITABLE_FIELDS or (field == "full_name" and value is None):
                    continue
                setattr(current, field, value)
        return current
