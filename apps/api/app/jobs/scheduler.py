"""Runs the jobs in the API process with APScheduler (backend.md §8, ADR 0015).

Each run first takes a Redis lock named after the job (`SET NX` with an expiry), so with several API
instances, or a manual run during a scheduled one, a job runs once at a time. The lock is released only by
the run that took it. A failing job is logged and never stops the scheduler or the API.
"""

import secrets
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from redis.asyncio import Redis

from app.core.dates import LAGOS
from app.core.logging import get_logger
from app.jobs.registry import JOBS, Job, JobContext

log = get_logger("app.jobs")

LOCK_PREFIX = "hv:job:"
# Deletes the lock only if it still holds this run's token (it may have expired and been retaken).
RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0"


class JobRunner:
    def __init__(self, ctx: JobContext, redis: Redis) -> None:
        self.ctx = ctx
        self.redis = redis

    async def run(self, job: Job) -> int | None:
        """The job's count, or None if another run holds the lock or the job failed."""
        key, token = f"{LOCK_PREFIX}{job.name}", secrets.token_hex(8)
        if not await self.redis.set(key, token, nx=True, ex=job.lock_seconds):
            log.info("job.skipped_locked", job=job.name)
            return None
        started = time.monotonic()
        try:
            count = await job.run(self.ctx)
        except Exception:
            log.exception("job.failed", job=job.name)
            return None
        finally:
            await self.redis.eval(RELEASE, 1, key, token)
            self.ctx.notifications.kick()  # deliver what the job wrote
        log.info(
            "job.finished", job=job.name, count=count, duration_ms=round((time.monotonic() - started) * 1000)
        )
        return count


def start_scheduler(runner: JobRunner, jobs: tuple[Job, ...] = JOBS) -> AsyncIOScheduler:
    """`coalesce` folds missed runs into one; `max_instances=1` stops a slow run overlapping the next."""
    scheduler = AsyncIOScheduler(timezone=LAGOS)
    for job in jobs:
        scheduler.add_job(
            runner.run,
            args=[job],
            id=job.name,
            name=job.name,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=job.lock_seconds,
            **job.schedule,
        )
    scheduler.start()
    log.info("jobs.started", jobs=[job.name for job in jobs])
    return scheduler
