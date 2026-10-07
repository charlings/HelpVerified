"""Accepting a proposal (database.md §7): the hold, the side effects, the order of checks, idempotency and
hold expiry. Rule 2 under real concurrency is in tests/concurrency."""

import uuid
from datetime import UTC, datetime, timedelta

import time_machine
from fastapi.testclient import TestClient

from app.integrations.payments import UnconfiguredPayments
from tests.conftest import ApiFactory, run_sql
from tests.factories import listed_worker
from tests.fakes import FakePayments
from tests.helpers import API, bearer, error_code, login
from tests.placement_flows import accept, agency, expire_holds, family, placed, post_request, propose


def test_accept_holds_the_worker_and_returns_a_checkout(api: TestClient, payments: FakePayments) -> None:
    fam = family(api)
    agc = agency(api)
    request_id = post_request(api, fam)
    worker = listed_worker(agc.id)
    chosen = propose(api, agc, request_id, worker)
    other_agency = agency(api, "other@example.com")
    other = propose(api, other_agency, request_id, listed_worker(other_agency.id))

    body = accept(api, fam, chosen)

    placement = body["placement"]
    assert placement["status"] == "pending_payment"
    hold = datetime.fromisoformat(placement["hold_expires_at"]) - datetime.now(UTC)
    assert timedelta(minutes=29) < hold <= timedelta(minutes=30)
    assert body["payment"]["reference"].startswith("HV-PF-")
    assert payments.started == [uuid.UUID(placement["id"])]
    statuses = {row[0]: row[1] for row in run_sql("SELECT id::text, status::text FROM proposals")}
    assert statuses == {chosen: "accepted", other: "superseded"}
    assert api.get(f"{API}/requests/{request_id}", headers=fam).json()["status"] == "matched"
    [(from_status, to_status)] = run_sql("SELECT from_status::text, to_status::text FROM placement_events")
    assert (from_status, to_status) == (None, "pending_payment")
    assert api.get(f"{API}/workers/{worker}", headers=agc.headers).json()["available"] is False


def test_accept_checks_in_the_contracts_order(api: TestClient) -> None:
    fam = family(api)
    stranger = family(api, "stranger@example.com")
    agc = agency(api)
    request_id = post_request(api, fam)
    proposal = propose(api, agc, request_id, listed_worker(agc.id))

    assert error_code(api.post(f"{API}/proposals/{proposal}/accept", headers=stranger)) == "NOT_FOUND"
    api.post(f"{API}/proposals/{proposal}/decline", headers=fam)
    assert error_code(api.post(f"{API}/proposals/{proposal}/accept", headers=fam)) == "ILLEGAL_TRANSITION"
    api.post(f"{API}/requests/{request_id}/cancel", headers=fam)
    assert error_code(api.post(f"{API}/proposals/{proposal}/accept", headers=fam)) == "REQUEST_NOT_OPEN"


def test_a_delisted_worker_cant_be_accepted(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    worker = listed_worker(agc.id)
    proposal = propose(api, agc, post_request(api, fam), worker)
    run_sql("UPDATE workers SET listing_status = 'delisted' WHERE id = :w", w=worker)

    assert error_code(api.post(f"{API}/proposals/{proposal}/accept", headers=fam)) == "WORKER_NOT_LISTED"


def test_a_lapsed_check_blocks_accept_even_before_the_job(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    worker = listed_worker(agc.id)
    proposal = propose(api, agc, post_request(api, fam), worker)
    run_sql(
        "UPDATE verification_items SET expires_at = now() - interval '1 minute' "
        "WHERE worker_id = :w AND kind = 'references'",
        w=worker,
    )

    assert error_code(api.post(f"{API}/proposals/{proposal}/accept", headers=fam)) == "WORKER_NOT_LISTED"


def test_second_family_gets_worker_unavailable(api: TestClient) -> None:
    agc = agency(api)
    worker = listed_worker(agc.id)
    first = family(api, "first@example.com")
    second = family(api, "second@example.com")
    first_proposal = propose(api, agc, post_request(api, first), worker)
    second_proposal = propose(api, agc, post_request(api, second), worker)
    accept(api, first, first_proposal)

    response = api.post(f"{API}/proposals/{second_proposal}/accept", headers=second)

    assert response.status_code == 409
    assert error_code(response) == "WORKER_UNAVAILABLE"
    assert response.json()["error"]["message"]


def test_idempotency_key_replays_the_first_response(api: TestClient, payments: FakePayments) -> None:
    fam = family(api)
    agc = agency(api)
    proposal = propose(api, agc, post_request(api, fam), listed_worker(agc.id))
    key = {"Idempotency-Key": "accept-once-123"}

    first = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)
    replay = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)
    no_key = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert first.status_code == replay.status_code == 201
    assert replay.json() == first.json()
    assert replay.headers["idempotent-replay"] == "true"
    assert len(payments.started) == 1
    assert error_code(no_key) == "REQUEST_NOT_OPEN"  # without the key, a second accept is just refused
    [(count,)] = run_sql("SELECT count(*) FROM placements")
    assert count == 1


def test_an_expired_hold_frees_the_worker(api: TestClient) -> None:
    agc = agency(api)
    worker = listed_worker(agc.id)
    slow = family(api, "slow@example.com")
    quick = family(api, "quick@example.com")
    slow_request = post_request(api, slow)
    slow_proposal = propose(api, agc, slow_request, worker)
    held = accept(api, slow, slow_proposal)["placement"]["id"]
    quick_request = post_request(api, quick)
    blocked = api.post(
        f"{API}/requests/{quick_request}/proposals", headers=agc.headers, json={"worker_id": str(worker)}
    )
    assert error_code(blocked) == "WORKER_UNAVAILABLE"  # held while the first family pays

    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=31), tick=False):
        agc.headers = bearer(login(api, "agency@example.com"))  # access tokens last 15 minutes
        quick = bearer(login(api, "quick@example.com"))
        quick_proposal = propose(api, agc, quick_request, worker)  # a lapsed hold doesn't count
        response = api.post(f"{API}/proposals/{quick_proposal}/accept", headers=quick)
    slow = bearer(login(api, "slow@example.com"))

    assert response.status_code == 201
    [(status, reason)] = run_sql(
        "SELECT status::text, end_reason::text FROM placements WHERE id = :p", p=uuid.UUID(held)
    )
    assert (status, reason) == ("cancelled", "payment_expired")
    reopened = api.get(f"{API}/requests/{slow_request}", headers=slow).json()
    assert reopened["status"] == "open"
    assert reopened["pending_proposals"] == 1


def test_hold_expiry_job(api: TestClient) -> None:
    hold = placed(api, paid=False)

    assert expire_holds() == 0
    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=31), tick=False):
        assert expire_holds() == 1

    detail = api.get(f"{API}/placements/{hold.placement_id}", headers=hold.family).json()
    assert detail["status"] == "cancelled"
    assert detail["end_reason"] == "payment_expired"
    assert detail["events"][-1]["actor"] == "system"
    assert api.get(f"{API}/requests/{hold.request_id}", headers=hold.family).json()["status"] == "open"


def test_unconfigured_payments_keep_the_hold_and_say_so(make_api: ApiFactory) -> None:
    api = make_api(gateway=UnconfiguredPayments())
    fam = family(api)
    agc = agency(api)
    proposal = propose(api, agc, post_request(api, fam), listed_worker(agc.id))

    response = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert response.status_code == 502
    assert error_code(response) == "PAYMENT_PROVIDER_ERROR"
    [(status,)] = run_sql("SELECT status::text FROM placements")
    assert status == "pending_payment"  # the worker is held while the family retries
