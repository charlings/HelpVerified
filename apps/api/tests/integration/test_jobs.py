"""The scheduled jobs (backend.md §8, ADR 0015), run through JobRunner with a frozen clock (milestone
criterion: "jobs tested with frozen clock"). Each job calls services, so the two rules hold as in requests:
expiry delists (rule 1), and nothing here can create or revive a placement (rule 2)."""

import uuid
from datetime import UTC, date, datetime, time, timedelta

import redis
import time_machine
from fastapi.testclient import TestClient
from redis.asyncio import Redis as AsyncRedis

from app.core.dates import LAGOS
from app.integrations.paystack import RemoteSubscription
from app.jobs.registry import Job, JobContext
from app.jobs.scheduler import JobRunner
from tests.conftest import TEST_REDIS_URL, deliver, run_sql
from tests.factories import create_worker, listed_worker, set_items
from tests.fakes import FakeCloudinary, FakePaystack, MemoryEmailSender
from tests.helpers import bearer, login
from tests.integration.test_notifications import items
from tests.integration.test_paystack_webhook import charge_success, send
from tests.job_runs import context, run_job
from tests.placement_flows import accept, agency, family, placed, post_request, propose


def later(**delta: float) -> time_machine.travel:
    return time_machine.travel(datetime.now(UTC) + timedelta(**delta), tick=False)


def at_lagos(day: date, hour: int) -> time_machine.travel:
    return time_machine.travel(datetime.combine(day, time(hour), LAGOS), tick=False)


def kinds(api: TestClient, headers: dict[str, str]) -> list[object]:
    return [item["kind"] for item in items(api, headers)]


def add_document(cloudinary: FakeCloudinary, worker: uuid.UUID, kind: str) -> tuple[uuid.UUID, str]:
    """Evidence on one check, as registering an upload leaves it."""
    public_id = cloudinary.upload(f"workers/docs/{worker}/{kind}", "authenticated")
    [(item_id,)] = run_sql(
        "SELECT id FROM verification_items WHERE worker_id = :w AND kind = CAST(:k AS verification_kind)",
        w=worker,
        k=kind,
    )
    [(uploader,)] = run_sql("SELECT id FROM users ORDER BY created_at LIMIT 1")
    document_id = uuid.uuid4()
    run_sql(
        "INSERT INTO verification_documents "
        "(id, item_id, cloudinary_public_id, resource_type, format, bytes, uploaded_by) "
        "VALUES (:id, :item, :pid, 'image', 'pdf', 180000, :u)",
        id=document_id,
        item=item_id,
        pid=public_id,
        u=uploader,
    )
    return document_id, public_id


def document_state(document_id: uuid.UUID) -> tuple[bool, bool]:
    """(deleted, purged)"""
    [(deleted_at, purged_at)] = run_sql(
        "SELECT deleted_at, purged_at FROM verification_documents WHERE id = :id", id=document_id
    )
    return deleted_at is not None, purged_at is not None


# expire_holds


def test_expire_holds_releases_the_worker_and_tells_the_family(
    api: TestClient, outbox: MemoryEmailSender
) -> None:
    flow = placed(api, paid=False)

    with later(minutes=29):
        assert run_job(api, "expire_holds") == 0  # still inside the 30-minute hold
    with later(minutes=31):
        assert run_job(api, "expire_holds") == 1

    [(status, reason)] = run_sql("SELECT status::text, end_reason::text FROM placements")
    assert (status, reason) == ("cancelled", "payment_expired")
    [(request_status,)] = run_sql("SELECT status::text FROM requests")
    assert request_status == "open"
    assert kinds(api, flow.family)[0] == "hold_expired"
    assert kinds(api, flow.agency.headers)[0] == "hold_released"
    deliver(api)
    assert outbox.last("hold_expired").link == f"http://localhost:3000/family/requests/{flow.request_id}"


# trial_reminders


def test_trial_reminders_go_once_two_days_before_the_end(api: TestClient) -> None:
    flow = placed(api)
    [(ends_on,)] = run_sql("SELECT trial_ends_on FROM placements")
    assert isinstance(ends_on, date)

    with at_lagos(ends_on - timedelta(days=3), 8):
        assert run_job(api, "trial_reminders") == 0  # too early
    with at_lagos(ends_on - timedelta(days=2), 8):
        assert run_job(api, "trial_reminders") == 1
        assert run_job(api, "trial_reminders") == 0  # a second run (or instance) doesn't repeat it
    with at_lagos(ends_on - timedelta(days=1), 8):
        assert run_job(api, "trial_reminders") == 0  # nor does the next day's

    family_items = items(api, flow.family)
    assert [i["kind"] for i in family_items].count("trial_ending") == 1
    assert family_items[0]["title"] == f"Amaka Obi's trial ends on {ends_on.day} {ends_on:%B %Y}"
    assert kinds(api, flow.agency.headers).count("trial_ending") == 1


def test_a_missed_day_is_caught_up(api: TestClient) -> None:
    placed(api)
    [(ends_on,)] = run_sql("SELECT trial_ends_on FROM placements")
    assert isinstance(ends_on, date)

    with at_lagos(ends_on - timedelta(days=1), 8):  # the job didn't run the day before
        assert run_job(api, "trial_reminders") == 1


def test_trials_already_over_get_no_reminder(api: TestClient) -> None:
    placed(api)
    [(ends_on,)] = run_sql("SELECT trial_ends_on FROM placements")
    assert isinstance(ends_on, date)

    with at_lagos(ends_on + timedelta(days=1), 8):
        assert run_job(api, "trial_reminders") == 0


# verification_expiry


def test_verification_expiry_delists_and_tells_the_agency(api: TestClient) -> None:
    agc = agency(api)
    worker = listed_worker(agc.id)
    run_sql(
        "UPDATE verification_items SET expires_at = now() + interval '12 months' "
        "WHERE worker_id = :w AND kind IN ('references', 'address')",
        w=worker,
    )

    with later(days=364):
        assert run_job(api, "verification_expiry") == 0
    with later(days=367):
        assert run_job(api, "verification_expiry") == 2

    [(listing,)] = run_sql("SELECT listing_status::text FROM workers WHERE id = :w", w=worker)
    assert listing == "delisted"  # rule 1, through the trigger
    [notice] = items(api, agc.headers)
    assert notice["title"] == "Amaka Obi's references and address checks have expired"
    assert notice["link"] == f"/agency/workers/{worker}"


def test_expiry_does_not_end_a_running_placement(api: TestClient) -> None:
    flow = placed(api)
    run_sql(
        "UPDATE verification_items SET expires_at = now() + interval '1 day' "
        "WHERE worker_id = :w AND kind = 'address'",
        w=flow.worker_id,
    )

    with later(days=2):
        assert run_job(api, "verification_expiry") == 1

    [(status,)] = run_sql("SELECT status::text FROM placements")
    assert status == "trial"  # database.md §4: delisted, but the placement continues


# subscription_sync


def test_subscription_sync_tells_the_agency_when_payment_fails(
    api: TestClient, paystack: FakePaystack
) -> None:
    agc = agency(api)
    run_sql("UPDATE subscriptions SET paystack_subscription_code = 'SUB_xyz' WHERE agency_id = :a", a=agc.id)
    paystack.subscriptions["SUB_xyz"] = RemoteSubscription("SUB_xyz", "attention", None)

    assert run_job(api, "subscription_sync") == 1
    assert run_job(api, "subscription_sync") == 0

    [notice] = items(api, agc.headers)
    assert notice["kind"] == "subscription_lapsed"
    assert notice["title"] == "Your subscription payment didn't go through"
    assert notice["link"] == "/agency/billing"


# refund_retry


def test_a_refused_refund_is_retried_until_paystack_accepts(api: TestClient, paystack: FakePaystack) -> None:
    agc = agency(api)
    worker = listed_worker(agc.id)
    slow = family(api, "slow@example.com")
    quick = family(api, "quick@example.com")
    accept(api, slow, propose(api, agc, post_request(api, slow), worker))
    [slow_reference] = paystack.transactions
    quick_request = post_request(api, quick)
    with later(minutes=31):
        agc.headers = bearer(login(api, "agency@example.com"))
        quick = bearer(login(api, "quick@example.com"))
        accept(api, quick, propose(api, agc, quick_request, worker))  # takes the worker
        paystack.pay(slow_reference)
        paystack.refuse_refunds = True
        assert send(api, charge_success(slow_reference)).status_code == 200

    def refund_row() -> tuple[object, ...]:
        [row] = run_sql(
            "SELECT status::text, refund_sent_at, refund_attempts FROM payments "
            "WHERE paystack_reference = :r",
            r=slow_reference,
        )
        return row

    status, sent_at, attempts = refund_row()
    assert (status, sent_at, attempts) == ("refunded", None, 1)
    assert run_job(api, "refund_retry") == 0  # still refused
    assert refund_row()[2] == 2

    paystack.refuse_refunds = False
    assert run_job(api, "refund_retry") == 1

    assert paystack.refunds == [slow_reference]
    assert refund_row()[1] is not None
    assert run_job(api, "refund_retry") == 0  # done: never refunded twice
    assert kinds(api, slow)[0] == "payment_refunded"


def test_refunds_stop_after_the_last_attempt(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    run_sql(
        "UPDATE payments SET status = 'refunded', paid_at = now(), refunded_at = now(), refund_attempts = 10 "
        "WHERE placement_id = :p",
        p=uuid.UUID(flow.placement_id),
    )

    assert run_job(api, "refund_retry") == 0
    assert paystack.refunds == []  # left for an admin (logged as payment.refund_gave_up)


# document_retention


def test_rejected_evidence_is_deleted_after_90_days(api: TestClient, cloudinary: FakeCloudinary) -> None:
    agc = agency(api)
    worker = create_worker(agc.id)
    set_items(worker, "submitted", except_kind="id", other_status="rejected")
    rejected_doc, rejected_file = add_document(cloudinary, worker, "id")
    kept_doc, kept_file = add_document(cloudinary, worker, "address")

    with later(days=89):
        run_job(api, "document_retention")
    assert document_state(rejected_doc) == (False, False)
    with later(days=91):
        assert run_job(api, "document_retention") == 1

    assert document_state(rejected_doc) == (True, True)
    assert cloudinary.destroyed == [rejected_file]
    assert document_state(kept_doc) == (False, False)
    assert kept_file in cloudinary.assets


def test_idle_unlisted_workers_lose_their_evidence_and_verification(
    api: TestClient, cloudinary: FakeCloudinary
) -> None:
    agc = agency(api)
    idle = create_worker(agc.id, listing_status="draft")
    set_items(idle, "verified")
    idle_doc, _ = add_document(cloudinary, idle, "guarantor")
    listed = listed_worker(agc.id, full_name="Bola Ade")
    listed_doc, _ = add_document(cloudinary, listed, "guarantor")

    with later(days=30 * 11):  # RETENTION_IDLE_WORKER_MONTHS = 12
        assert run_job(api, "document_retention") == 0
    with later(days=30 * 13):
        assert run_job(api, "document_retention") == 1

    assert document_state(idle_doc) == (True, True)
    statuses = {
        s for (s,) in run_sql("SELECT status::text FROM verification_items WHERE worker_id = :w", w=idle)
    }
    assert statuses == {"expired"}  # relisting needs fresh checks (rule 1)
    assert document_state(listed_doc) == (False, False)
    [(action, actor, label)] = run_sql("SELECT action, actor_id, data->>'label' FROM audit_log")
    assert (action, actor, label) == ("worker.evidence_deleted", None, "Amaka Obi")


def test_a_worker_in_a_placement_keeps_their_evidence(api: TestClient, cloudinary: FakeCloudinary) -> None:
    flow = placed(api)
    run_sql("UPDATE workers SET listing_status = 'delisted' WHERE id = :w", w=flow.worker_id)
    document, _ = add_document(cloudinary, flow.worker_id, "address")

    with later(days=30 * 13):
        assert run_job(api, "document_retention") == 0

    assert document_state(document) == (False, False)


def test_a_failed_cloudinary_delete_is_retried(api: TestClient, cloudinary: FakeCloudinary) -> None:
    agc = agency(api)
    worker = create_worker(agc.id)
    document, public_id = add_document(cloudinary, worker, "id")
    run_sql(
        "UPDATE verification_documents SET deleted_at = now() WHERE id = :d", d=document
    )  # removed by the agency

    cloudinary.down = True
    run_job(api, "document_retention")
    assert document_state(document) == (True, False)

    cloudinary.down = False
    run_job(api, "document_retention")
    assert document_state(document) == (True, True)
    assert cloudinary.destroyed == [public_id]


# The runner


def test_a_held_lock_skips_the_run(api: TestClient) -> None:
    client = redis.Redis.from_url(TEST_REDIS_URL)
    client.set("hv:job:expire_holds", "another-instance", ex=60)

    assert run_job(api, "expire_holds") is None

    client.delete("hv:job:expire_holds")
    assert run_job(api, "expire_holds") == 0
    assert client.get("hv:job:expire_holds") is None  # released after the run


async def _boom(ctx: JobContext) -> int:
    raise RuntimeError("boom")


async def _run_failing(ctx: JobContext) -> int | None:
    client = AsyncRedis.from_url(TEST_REDIS_URL)
    try:
        return await JobRunner(ctx, client).run(Job("boom", {}, _boom, 30, "always fails"))
    finally:
        await client.aclose()


def test_a_failing_job_is_contained(api: TestClient) -> None:
    assert api.portal is not None

    assert api.portal.call(_run_failing, context(api)) is None  # logged, not raised

    assert redis.Redis.from_url(TEST_REDIS_URL).get("hv:job:boom") is None
