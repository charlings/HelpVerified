"""Rule 2 under concurrency (spec acceptance item 9): many families accept the same worker at once.

Each accept runs on its own database connection, at the same moment. Exactly one placement may come out;
every other accept must fail cleanly with WORKER_UNAVAILABLE, never a 500 or a second placement.
"""

import asyncio
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import load_settings
from app.core.errors import DomainError, WorkerUnavailable
from app.db.session import create_sessionmaker
from app.modules.payments.service import PaymentService
from app.modules.placements.models import Placement, PlacementStatus
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.service import PlacementService
from app.modules.users.models import User
from tests.conftest import TEST_DATABASE_URL, run_async, run_sql
from tests.factories import (
    create_agency,
    create_family,
    create_proposal,
    create_request,
    insert_placement,
    listed_worker,
)
from tests.fakes import FakePayments, FakePaystack

pytestmark = pytest.mark.usefixtures("clean_state")

FAMILIES = 8


def family_user(family_id: uuid.UUID) -> uuid.UUID:
    [(user_id,)] = run_sql("SELECT user_id FROM families WHERE id = :f", f=family_id)
    return uuid.UUID(str(user_id))


async def _accept(engine: AsyncEngine, user_id: uuid.UUID, proposal_id: uuid.UUID) -> str:
    async with create_sessionmaker(engine)() as session:
        async with session.begin():  # services open their own transaction afterwards
            user = await session.get(User, user_id)
        assert user is not None
        service = PlacementService(session, load_settings(), FakePayments())
        try:
            await service.accept(user, proposal_id)
        except DomainError as error:
            return error.code
        return "ok"


async def _race(pairs: list[tuple[uuid.UUID, uuid.UUID]]) -> list[str]:
    engine = create_async_engine(TEST_DATABASE_URL, pool_size=FAMILIES, max_overflow=0)
    try:
        # Open every connection first, so the accepts really start together.
        connections = [await engine.connect() for _ in pairs]
        for connection in connections:
            await connection.close()
        return list(await asyncio.gather(*(_accept(engine, user, proposal) for user, proposal in pairs)))
    finally:
        await engine.dispose()


def test_concurrent_accepts_create_one_placement() -> None:
    worker = listed_worker(create_agency())
    pairs = []
    for _ in range(FAMILIES):
        family = create_family()
        pairs.append((family_user(family), create_proposal(create_request(family), worker)))

    results = run_async(_race(pairs))

    assert results.count("ok") == 1
    assert sorted(set(results) - {"ok"}) == ["WORKER_UNAVAILABLE"]
    [(active,)] = run_sql(
        "SELECT count(*) FROM placements "
        "WHERE worker_id = :w AND status IN ('pending_payment', 'trial', 'confirmed')",
        w=worker,
    )
    assert active == 1
    [(total,)] = run_sql("SELECT count(*) FROM placements")
    assert total == 1


async def _accept_with_paystack(
    engine: AsyncEngine, user_id: uuid.UUID, proposal_id: uuid.UUID, paystack: FakePaystack
) -> str:
    """The real payment service in front of the fake Paystack: returns the checkout reference or the code."""
    async with create_sessionmaker(engine)() as session:
        async with session.begin():
            user = await session.get(User, user_id)
        assert user is not None
        settings = load_settings()
        service = PlacementService(session, settings, PaymentService(session, settings, paystack))
        try:
            accepted = await service.accept(user, proposal_id)
        except DomainError as error:
            return error.code
        assert accepted.checkout is not None
        return accepted.checkout.reference


async def _same_accept_many_times(
    user_id: uuid.UUID, proposal_id: uuid.UUID, paystack: FakePaystack
) -> list[str]:
    engine = create_async_engine(TEST_DATABASE_URL, pool_size=RETRIES, max_overflow=0)
    try:
        connections = [await engine.connect() for _ in range(RETRIES)]
        for connection in connections:
            await connection.close()
        return list(
            await asyncio.gather(
                *(_accept_with_paystack(engine, user_id, proposal_id, paystack) for _ in range(RETRIES))
            )
        )
    finally:
        await engine.dispose()


RETRIES = 5


def test_concurrent_retries_of_one_accept_open_one_checkout() -> None:
    """A family double-clicks (or its client retries) while Paystack is slow: every request gets the same
    placement and checkout, and Paystack is asked once (ADR 0017)."""
    family = create_family()
    proposal = create_proposal(create_request(family), listed_worker(create_agency()))
    paystack = FakePaystack()
    paystack.initialize_delay = 0.3  # every retry arrives while the first checkout is in flight

    results = run_async(_same_accept_many_times(family_user(family), proposal, paystack))

    assert len(set(results)) == 1  # one reference for everyone
    assert results[0].startswith("HV-PF-")
    assert paystack.initialize_calls == 1
    [(placements,)] = run_sql("SELECT count(*) FROM placements")
    assert placements == 1
    assert [s for (s,) in run_sql("SELECT status::text FROM payments")] == ["pending"]


def test_concurrent_retries_while_paystack_refuses_leave_one_hold_and_no_payment() -> None:
    family = create_family()
    worker = listed_worker(create_agency())
    proposal = create_proposal(create_request(family), worker)
    paystack = FakePaystack()
    paystack.reject_checkouts = True
    paystack.initialize_delay = 0.1

    results = run_async(_same_accept_many_times(family_user(family), proposal, paystack))

    assert set(results) == {"PAYMENT_PROVIDER_ERROR"}  # never a 500, never a second placement
    [(status, held_worker)] = run_sql("SELECT status::text, worker_id FROM placements")
    assert status == "pending_payment"
    assert str(held_worker) == str(worker)
    [(payments,)] = run_sql("SELECT count(*) FROM payments")
    assert payments == 0  # every failed attempt rolled back its payment row


async def _insert_second(placement: Placement) -> None:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with create_sessionmaker(engine)() as session, session.begin():
            await PlacementRepository(session).add(placement)
    finally:
        await engine.dispose()


def test_a_path_that_skips_the_lock_still_gets_a_clean_409() -> None:
    """If some future code path forgets the row lock, the index refuses and the repository maps it."""
    worker = listed_worker(create_agency())
    first = create_proposal(create_request(create_family()), worker)
    second_family = create_family()
    second_request = create_request(second_family)
    second = create_proposal(second_request, worker)
    insert_placement(first, "trial")
    [(agency_id,)] = run_sql("SELECT agency_id FROM workers WHERE id = :w", w=worker)
    duplicate = Placement(
        request_id=second_request,
        proposal_id=second,
        worker_id=worker,
        family_id=second_family,
        agency_id=agency_id,
        status=PlacementStatus.pending_payment,
        hold_expires_at=datetime.now(UTC),
    )

    with pytest.raises(WorkerUnavailable):
        run_async(_insert_second(duplicate))
