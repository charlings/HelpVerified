"""Delivers notifications soon after the transaction that wrote them commits (ADR 0015).

`kick()` is called after a request or job whose session wrote notifications (`app.core.deps.get_db`,
`app.jobs.scheduler`). It starts one background delivery task; a kick while that task runs makes it go
round once more instead of starting another. The `notification_retry` job catches anything missed, such as
rows written just before a restart.
"""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.logging import get_logger
from app.integrations.email import EmailSender
from app.integrations.firestore import NotificationMirror
from app.modules.notifications.service import BATCH, NotificationService

log = get_logger("app.notifications")


class NotificationDispatcher:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        email: EmailSender,
        mirror: NotificationMirror | None,
        *,
        immediate: bool = True,
    ) -> None:
        self.sessionmaker = sessionmaker
        self.settings = settings
        self.email = email
        self.mirror = mirror
        self.immediate = immediate  # tests turn this off and call `drain()` themselves
        self._task: asyncio.Task[None] | None = None
        self._again = False

    def kick(self) -> None:
        if not self.immediate:
            return
        if self._task is not None and not self._task.done():
            self._again = True
            return
        self._task = asyncio.get_running_loop().create_task(self._run())

    async def _run(self) -> None:
        while True:
            self._again = False
            try:
                await self.deliver_all()
            except Exception:  # logged; the retry job runs again later
                log.exception("notifications.dispatch_failed")
            if not self._again:
                return

    async def deliver_all(self) -> int:
        """Delivers everything due now, a batch per session."""
        total = 0
        while True:
            async with self.sessionmaker() as session:
                claimed = await NotificationService(
                    session, self.settings, self.email, self.mirror
                ).deliver_due()
            total += claimed
            if claimed < BATCH:
                return total

    async def drain(self) -> int:
        """Waits for a running delivery, then delivers whatever is still due."""
        if self._task is not None:
            await asyncio.shield(self._task)
        return await self.deliver_all()

    async def close(self) -> None:
        if self._task is not None and not self._task.done():
            try:
                await asyncio.wait_for(asyncio.shield(self._task), timeout=10)
            except TimeoutError:
                log.warning("notifications.dispatch_unfinished")
