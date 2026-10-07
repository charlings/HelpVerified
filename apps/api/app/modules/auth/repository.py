"""Refresh-token and one-time-token queries. Callers pass token hashes, never raw tokens."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import OneTimeToken, RefreshToken, TokenPurpose


class TokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # Refresh tokens

    async def add_refresh(
        self, user_id: uuid.UUID, token_hash: str, family_id: uuid.UUID, expires_at: datetime
    ) -> RefreshToken:
        token = RefreshToken(
            user_id=user_id, token_hash=token_hash, family_id=family_id, expires_at=expires_at
        )
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_refresh_for_update(self, token_hash: str) -> RefreshToken | None:
        """Locks the row, so two refreshes of the same token run one after the other."""
        return await self.session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        )

    async def revoke_family(self, family_id: uuid.UUID, now: datetime) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    async def revoke_all_for_user(self, user_id: uuid.UUID, now: datetime) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    # One-time tokens (verify email, reset password)

    async def add_one_time(
        self, user_id: uuid.UUID, purpose: TokenPurpose, token_hash: str, expires_at: datetime
    ) -> None:
        self.session.add(
            OneTimeToken(user_id=user_id, purpose=purpose.value, token_hash=token_hash, expires_at=expires_at)
        )
        await self.session.flush()

    async def get_one_time_for_update(self, token_hash: str, purpose: TokenPurpose) -> OneTimeToken | None:
        return await self.session.scalar(
            select(OneTimeToken)
            .where(OneTimeToken.token_hash == token_hash, OneTimeToken.purpose == purpose.value)
            .with_for_update()
        )

    async def use_all_one_time(self, user_id: uuid.UUID, purpose: TokenPurpose, now: datetime) -> None:
        """Marks every unused token of this purpose as used (a new link replaces older ones)."""
        await self.session.execute(
            update(OneTimeToken)
            .where(
                OneTimeToken.user_id == user_id,
                OneTimeToken.purpose == purpose.value,
                OneTimeToken.used_at.is_(None),
            )
            .values(used_at=now)
        )
