"""Running B6 jobs from tests exactly as the scheduler does: through JobRunner (lock and all), on the running
app's own event loop, with its fakes. Freeze or move the clock with time_machine around the call."""

from typing import Any

from fastapi.testclient import TestClient
from redis.asyncio import Redis

from app.jobs.registry import JOBS_BY_NAME, JobContext
from app.jobs.scheduler import JobRunner
from tests.conftest import TEST_REDIS_URL


def context(api: TestClient) -> JobContext:
    state: Any = api.app.state  # type: ignore[attr-defined]
    return JobContext(
        state.sessionmaker, state.settings, state.paystack, state.cloudinary, state.notifications
    )


async def _run(ctx: JobContext, name: str) -> int | None:
    redis = Redis.from_url(TEST_REDIS_URL)
    try:
        return await JobRunner(ctx, redis).run(JOBS_BY_NAME[name])
    finally:
        await redis.aclose()


def run_job(api: TestClient, name: str) -> int | None:
    """The job's count, or None if it was locked or failed (as the scheduler sees it)."""
    assert api.portal is not None
    return api.portal.call(_run, context(api), name)
