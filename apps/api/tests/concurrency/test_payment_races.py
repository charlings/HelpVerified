"""ADR 0017 under real concurrency: each side runs on its own database connection at the same moment.

- Refund reservations: the database alone keeps committed refunds within the captured amount (I8), even for a
  path that skips the application's payment lock (verified on PostgreSQL 16, ADR 0017 section D).
- Settlement: a webhook racing a job on the same reference, and two attempts succeeding at once, apply at most
  one payment and start at most one trial (I2, I3, section B).
"""

import asyncio
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import load_settings
from app.db.errors import pg_error
from app.db.session import create_sessionmaker
from app.modules.payments.models import PaymentRefund
from app.modules.payments.repository import RefundRepository
from app.modules.payments.service import PaymentService
from tests.conftest import TEST_DATABASE_URL, run_async, run_sql
from tests.factories import create_agency, create_family, create_proposal, create_request, insert_placement
from tests.fakes import FakePaystack

pytestmark = pytest.mark.usefixtures("clean_state")

FEE = 2_000_000


def held_placement() -> tuple[uuid.UUID, uuid.UUID]:
    """A placement awaiting payment (hold valid for 30 minutes) and its family's user id."""
    from tests.factories import listed_worker

    family = create_family()
    proposal = create_proposal(create_request(family), listed_worker(create_agency()))
    placement = insert_placement(proposal, "pending_payment")
    [(user_id,)] = run_sql("SELECT user_id FROM families WHERE id = :f", f=family)
    return placement, uuid.UUID(str(user_id))


def attempt(placement: uuid.UUID, payer: uuid.UUID, reference: str, status: str, number: int) -> uuid.UUID:
    payment_id = uuid.uuid4()
    run_sql(
        "INSERT INTO payments (id, kind, payer_user_id, placement_id, amount_kobo, paystack_reference, "
        "authorization_url, status, attempt_no) VALUES (:id, 'placement_fee', :payer, :p, :fee, :ref, "
        ":url, CAST(:s AS payment_status), :n)",
        id=payment_id,
        payer=payer,
        p=placement,
        fee=FEE,
        ref=reference,
        url=f"https://checkout.paystack.test/{reference}",
        s=status,
        n=number,
    )
    return payment_id


def paid(paystack: FakePaystack, reference: str, transaction_id: int) -> None:
    paystack.transactions[reference] = {
        "id": transaction_id,
        "amount": FEE,
        "currency": "NGN",
        "status": "success",
        "paid_at": datetime.now(UTC),
    }


async def _together(*calls: object) -> list[object]:
    return list(await asyncio.gather(*calls, return_exceptions=True))  # type: ignore[call-overload]


def _engine() -> AsyncEngine:
    return create_async_engine(TEST_DATABASE_URL, pool_size=4, max_overflow=0)


async def _reserve(engine: AsyncEngine, payment_id: uuid.UUID) -> str:
    """Inserts a full refund with no payment lock first (as a careless future path might)."""
    async with create_sessionmaker(engine)() as session:
        try:
            async with session.begin():
                await RefundRepository(session).add(PaymentRefund(payment_id=payment_id, amount_kobo=FEE))
                await asyncio.sleep(0.3)  # keep the first transaction open while the other arrives
        except DBAPIError as exc:
            error = pg_error(exc)
            return f"{error.sqlstate}:{error.constraint}"
        return "ok"


def test_concurrent_refund_reservations_never_exceed_the_capture() -> None:
    placement, payer = held_placement()
    payment_id = attempt(placement, payer, "HV-PF-RACE-REFUND", "refund_due", 1)

    async def race() -> list[str]:
        engine = _engine()
        try:
            return [
                str(r) for r in await _together(_reserve(engine, payment_id), _reserve(engine, payment_id))
            ]
        finally:
            await engine.dispose()

    results = run_async(race())

    assert sorted(results) == ["23514:ck_payments_refund_committed", "ok"]  # a clean refusal, no over-commit
    [(committed, rows)] = run_sql(
        "SELECT p.refund_committed_kobo, (SELECT count(*) FROM payment_refunds) FROM payments p"
    )
    assert (committed, rows) == (FEE, 1)


async def _settle(engine: AsyncEngine, paystack: FakePaystack, reference: str) -> str:
    async with create_sessionmaker(engine)() as session:
        try:
            await PaymentService(session, load_settings(), paystack).settle(reference)
        except Exception as exc:  # the test reports anything unexpected
            return type(exc).__name__
        return "ok"


def test_a_webhook_racing_a_job_on_one_reference_applies_once() -> None:
    placement, payer = held_placement()
    attempt(placement, payer, "HV-PF-RACE-ONE", "open", 1)
    paystack = FakePaystack()
    paid(paystack, "HV-PF-RACE-ONE", 7001)

    async def race() -> list[object]:
        engine = _engine()
        try:
            return await _together(
                _settle(engine, paystack, "HV-PF-RACE-ONE"), _settle(engine, paystack, "HV-PF-RACE-ONE")
            )
        finally:
            await engine.dispose()

    assert run_async(race()) == ["ok", "ok"]
    assert run_sql("SELECT status::text FROM payments") == [("succeeded",)]
    assert run_sql("SELECT status::text FROM placements") == [("trial",)]
    assert run_sql("SELECT count(*) FROM placement_events WHERE to_status = 'trial'") == [(1,)]
    assert run_sql("SELECT count(*) FROM payment_refunds") == [(0,)]


def test_two_attempts_succeeding_at_once_apply_one_and_refund_the_other() -> None:
    placement, payer = held_placement()
    attempt(placement, payer, "HV-PF-RACE-A", "failed", 1)  # confirmed failed, then paid after all (T8)
    attempt(placement, payer, "HV-PF-RACE-B", "open", 2)
    paystack = FakePaystack()
    paid(paystack, "HV-PF-RACE-A", 7002)
    paid(paystack, "HV-PF-RACE-B", 7003)

    async def race() -> list[object]:
        engine = _engine()
        try:
            return await _together(
                _settle(engine, paystack, "HV-PF-RACE-A"), _settle(engine, paystack, "HV-PF-RACE-B")
            )
        finally:
            await engine.dispose()

    assert run_async(race()) == ["ok", "ok"]
    statuses = sorted(str(s) for (s,) in run_sql("SELECT status::text FROM payments"))
    assert statuses == ["refund_due", "succeeded"]
    assert run_sql("SELECT status::text FROM placements") == [("trial",)]
    assert run_sql("SELECT count(*) FROM placement_events WHERE to_status = 'trial'") == [(1,)]
    assert run_sql("SELECT kind FROM admin_alerts WHERE resolved_at IS NULL") == [("duplicate_charge",)]
