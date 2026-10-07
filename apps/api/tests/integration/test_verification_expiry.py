"""Expiry (database.md §4): verified checks past expires_at become `expired`, which delists the worker.
B6 schedules this daily; here the service is called directly, as the job will."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import load_settings
from app.db.session import create_sessionmaker
from app.modules.verification.service import VerificationService
from tests.conftest import TEST_DATABASE_URL, run_async, run_sql
from tests.factories import create_agency, create_worker, set_items
from tests.fakes import FakeCloudinary

pytestmark = pytest.mark.usefixtures("clean_state")


async def _expire() -> int:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with create_sessionmaker(engine)() as session:
            return await VerificationService(session, load_settings(), FakeCloudinary()).expire_lapsed()
    finally:
        await engine.dispose()


def listed_worker() -> uuid.UUID:
    worker = create_worker(create_agency())
    set_items(worker, "verified")
    run_sql("UPDATE workers SET listing_status = 'listed' WHERE id = :id", id=worker)
    return worker


def test_lapsed_checks_expire_and_delist() -> None:
    lapsed = listed_worker()
    current = listed_worker()
    run_sql(
        "UPDATE verification_items SET expires_at = now() - interval '1 day' "
        "WHERE worker_id = :w AND kind = 'address'",
        w=lapsed,
    )
    run_sql(
        "UPDATE verification_items SET expires_at = now() + interval '30 days' "
        "WHERE worker_id = :w AND kind = 'address'",
        w=current,
    )

    assert run_async(_expire()) == 1

    rows = {row[0]: row[1] for row in run_sql("SELECT id, listing_status::text FROM workers")}
    assert rows[lapsed] == "delisted"
    assert rows[current] == "listed"
    [(status,)] = run_sql(
        "SELECT status::text FROM verification_items WHERE worker_id = :w AND kind = 'address'", w=lapsed
    )
    assert status == "expired"


def test_nothing_to_expire() -> None:
    listed_worker()

    assert run_async(_expire()) == 0
