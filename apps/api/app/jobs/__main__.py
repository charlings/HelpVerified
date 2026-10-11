"""Run a job once, outside the API: `uv run python -m app.jobs run expire_holds` (or `list`).

Uses the same lock as the scheduler, so it never overlaps a scheduled run. Useful by hand, and on a host
where the API sleeps when idle (a Render cron job can call this instead of the in-process scheduler).
"""

import argparse
import asyncio
import sys

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import create_engine, create_sessionmaker
from app.integrations.cloudinary import CloudinaryClient
from app.integrations.email import email_sender_from
from app.integrations.firestore import mirror_from
from app.integrations.paystack import PaystackClient
from app.jobs.registry import JOBS, JOBS_BY_NAME, JobContext
from app.jobs.scheduler import JobRunner
from app.modules.notifications.dispatcher import NotificationDispatcher


async def run_once(name: str) -> int:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    engine = create_engine(settings.database_url)
    redis = Redis.from_url(str(settings.REDIS_URL))
    sessionmaker = create_sessionmaker(engine)
    notifications = NotificationDispatcher(
        sessionmaker, settings, email_sender_from(settings), mirror_from(settings), immediate=False
    )
    context = JobContext(
        sessionmaker,
        settings,
        PaystackClient(settings.PAYSTACK_SECRET_KEY.get_secret_value()),
        CloudinaryClient(
            settings.CLOUDINARY_CLOUD_NAME,
            settings.CLOUDINARY_API_KEY,
            settings.CLOUDINARY_API_SECRET.get_secret_value(),
        ),
        notifications,
    )
    try:
        count = await JobRunner(context, redis).run(JOBS_BY_NAME[name])
        await notifications.drain()  # deliver what the job wrote before exiting
    finally:
        await redis.aclose()
        await engine.dispose()
    print(f"{name}: {'skipped or failed (see the log)' if count is None else count}")
    return 0 if count is not None else 1


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="show the jobs and their schedules")
    run = commands.add_parser("run", help="run one job now")
    run.add_argument("name", choices=sorted(JOBS_BY_NAME))
    args = parser.parse_args()
    if args.command == "list":
        for job in JOBS:
            schedule = ", ".join(f"{k}={v}" for k, v in job.schedule.items())
            print(f"{job.name:22} {schedule:32} {job.description}")
        return 0
    return asyncio.run(run_once(args.name))


if __name__ == "__main__":
    sys.exit(main())
