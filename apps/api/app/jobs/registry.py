"""Every scheduled job (backend.md §8, ADR 0015). Jobs call services, never repositories, so the same
rules apply as in a request; each service call owns its transactions.

Schedules are WAT (Nigeria, UTC+1). Every job is safe to run late, twice, or after a missed day: holds,
expiry and reminders look at "everything due by now", and reminders are deduplicated.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.integrations.cloudinary import Cloudinary
from app.integrations.paystack import PaystackApi
from app.modules.notifications.dispatcher import NotificationDispatcher
from app.modules.payments.service import PaymentService
from app.modules.placements.service import PlacementService
from app.modules.verification.service import VerificationService


@dataclass(frozen=True)
class JobContext:
    sessionmaker: async_sessionmaker[AsyncSession]
    settings: Settings
    paystack: PaystackApi
    cloudinary: Cloudinary
    notifications: NotificationDispatcher


@dataclass(frozen=True)
class Job:
    name: str
    schedule: dict[str, Any]  # APScheduler trigger arguments
    run: Callable[[JobContext], Awaitable[int]]
    lock_seconds: int  # longer than a run can take; another instance skips while it's held
    description: str


def _payments(session: AsyncSession, ctx: JobContext) -> PaymentService:
    return PaymentService(session, ctx.settings, ctx.paystack)


def _placements(session: AsyncSession, ctx: JobContext) -> PlacementService:
    return PlacementService(session, ctx.settings, _payments(session, ctx))


def _verification(session: AsyncSession, ctx: JobContext) -> VerificationService:
    return VerificationService(session, ctx.settings, ctx.cloudinary)


async def expire_holds(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _placements(session, ctx).expire_holds()


async def trial_reminders(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _placements(session, ctx).send_trial_reminders()


async def verification_expiry(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _verification(session, ctx).expire_lapsed()


async def subscription_sync(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _payments(session, ctx).reconcile_subscriptions()


async def notification_retry(ctx: JobContext) -> int:
    return await ctx.notifications.deliver_all()


async def refund_retry(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _payments(session, ctx).retry_refunds()


async def reconcile_checkouts(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _payments(session, ctx).reconcile_checkouts()


async def watch_checkouts(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        return await _payments(session, ctx).watch_checkouts()


async def document_retention(ctx: JobContext) -> int:
    async with ctx.sessionmaker() as session:
        service = _verification(session, ctx)
        deleted = await service.apply_retention()
        await service.purge_deleted_documents()
        return deleted


JOBS: tuple[Job, ...] = (
    Job("expire_holds", {"trigger": "interval", "minutes": 1}, expire_holds, 55,
        "Cancel unpaid holds past their deadline; the request reopens"),
    Job("trial_reminders", {"trigger": "cron", "hour": 8, "minute": 0}, trial_reminders, 600,
        "Remind family and agency before a trial ends"),
    Job("verification_expiry", {"trigger": "cron", "hour": 2, "minute": 0}, verification_expiry, 600,
        "Expire lapsed checks (their workers are delisted) and tell the agency"),
    Job("subscription_sync", {"trigger": "interval", "hours": 1}, subscription_sync, 600,
        "Reconcile agency subscriptions with Paystack"),
    Job("notification_retry", {"trigger": "interval", "minutes": 1}, notification_retry, 55,
        "Deliver notifications whose mirror or email failed"),
    Job("refund_retry", {"trigger": "interval", "minutes": 15}, refund_retry, 600,
        "Advance refunds: submit, reconcile uncertain ones, track them to processed (ADR 0017)"),
    Job("reconcile_checkouts", {"trigger": "interval", "minutes": 1}, reconcile_checkouts, 55,
        "Resolve checkouts whose Paystack outcome is unknown (ADR 0017)"),
    Job("watch_checkouts", {"trigger": "interval", "minutes": 15}, watch_checkouts, 600,
        "Check inactive checkouts for late payments until their watch window ends (ADR 0017)"),
    Job("document_retention", {"trigger": "cron", "hour": 3, "minute": 0}, document_retention, 1800,
        "Delete evidence past its retention period and destroy deleted files in Cloudinary"),
)  # fmt: skip
JOBS_BY_NAME = {job.name: job for job in JOBS}
