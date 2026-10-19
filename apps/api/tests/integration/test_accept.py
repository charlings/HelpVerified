"""Accepting a proposal (database.md §7): the hold, the side effects, the order of checks, idempotency and
hold expiry. Rule 2 under real concurrency is in tests/concurrency."""

import uuid
from datetime import UTC, datetime, timedelta

import time_machine
from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.factories import listed_worker
from tests.fakes import FakePaystack
from tests.helpers import API, bearer, error_code, login
from tests.placement_flows import accept, agency, expire_holds, family, placed, post_request, propose


def test_accept_holds_the_worker_and_returns_a_checkout(api: TestClient, paystack: FakePaystack) -> None:
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
    reference = body["payment"]["reference"]
    assert reference.startswith("HV-PF-")
    assert body["payment"]["authorization_url"] == f"https://checkout.paystack.test/{reference}"
    txn = paystack.transactions[reference]
    assert txn["amount"] == 2_000_000  # the placement fee, in kobo
    assert txn["email"] == "ada@example.com"
    assert txn["callback_url"] == "http://localhost:3000/family/payments/callback"
    assert txn["metadata"]["placement_id"] == placement["id"]
    [(status, amount)] = run_sql("SELECT status::text, amount_kobo FROM payments")
    assert (status, amount) == ("open", 2_000_000)
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


def test_idempotency_key_replays_the_first_response(api: TestClient, paystack: FakePaystack) -> None:
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
    # Without the key, accepting the same proposal again resumes the live hold (ADR 0017).
    assert no_key.status_code == 201
    assert "idempotent-replay" not in no_key.headers
    assert no_key.json()["placement"]["id"] == first.json()["placement"]["id"]
    assert no_key.json()["payment"] == first.json()["payment"]
    assert len(paystack.transactions) == 1
    [(count,)] = run_sql("SELECT count(*) FROM placements")
    assert count == 1
    [(payments,)] = run_sql("SELECT count(*) FROM payments")
    assert payments == 1


def test_a_paid_placement_isnt_resumed(api: TestClient) -> None:
    hold = placed(api)  # paid: on trial

    again = api.post(f"{API}/proposals/{hold.proposal_id}/accept", headers=hold.family)

    assert error_code(again) == "REQUEST_NOT_OPEN"


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


# A failed checkout (ADR 0017): the hold stands, the error says so, and every retry path works.


def _failed_accept(
    api: TestClient, paystack: FakePaystack, *, rejected: bool
) -> tuple[dict[str, str], str, str]:
    """A family accepts while Paystack is down (or refusing). Returns (family, proposal, placement)."""
    fam = family(api)
    agc = agency(api)
    proposal = propose(api, agc, post_request(api, fam), listed_worker(agc.id))
    if rejected:
        paystack.reject_checkouts = True
    else:
        paystack.down = True
    response = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)
    assert response.status_code == 502
    error = response.json()["error"]
    [(placement_id, status, expires)] = run_sql(
        "SELECT id::text, status::text, hold_expires_at FROM placements"
    )
    assert status == "pending_payment"  # the worker is held while the family retries
    assert error["code"] == "PAYMENT_PROVIDER_ERROR"
    assert error["details"]["placement_id"] == placement_id  # the client knows which hold to resume
    assert datetime.fromisoformat(error["details"]["hold_expires_at"]) == expires
    # The attempt is kept (ADR 0017): a confirmed refusal is `rejected`; an unreachable Paystack leaves the
    # outcome `unknown`, to be reconciled with the same reference, never a fresh one.
    [(attempt,)] = run_sql("SELECT status::text FROM payments")
    assert attempt == ("rejected" if rejected else "unknown")
    paystack.down = paystack.reject_checkouts = False
    return fam, proposal, str(placement_id)


def test_paystack_down_is_reported_as_unavailable(api: TestClient, paystack: FakePaystack) -> None:
    fam = family(api)
    agc = agency(api)
    proposal = propose(api, agc, post_request(api, fam), listed_worker(agc.id))
    paystack.down = True

    error = api.post(f"{API}/proposals/{proposal}/accept", headers=fam).json()["error"]

    assert error["details"]["reason"] == "unavailable"
    assert error["message"] == "The payment provider could not be reached. Please try again shortly."
    assert error["request_id"]


def test_a_paystack_refusal_is_reported_as_rejected(api: TestClient, paystack: FakePaystack) -> None:
    fam = family(api)
    agc = agency(api)
    proposal = propose(api, agc, post_request(api, fam), listed_worker(agc.id))
    paystack.reject_checkouts = True

    response = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert response.status_code == 502
    error = response.json()["error"]
    assert error["code"] == "PAYMENT_PROVIDER_ERROR"
    assert error["details"]["reason"] == "rejected"
    assert error["message"] == "The payment provider declined this payment request."
    assert "sk_test" not in response.text
    assert "ada@example.com" not in response.text


def test_accept_again_after_a_failed_checkout_resumes_the_hold(
    api: TestClient, paystack: FakePaystack
) -> None:
    fam, proposal, placement_id = _failed_accept(api, paystack, rejected=False)

    retry = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)
    again = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert retry.status_code == again.status_code == 201
    assert retry.json()["placement"]["id"] == placement_id  # the same placement, not a second one
    assert again.json()["payment"] == retry.json()["payment"]  # the same checkout, never a second charge
    assert len(paystack.transactions) == 1
    [(placements,)] = run_sql("SELECT count(*) FROM placements")
    assert placements == 1
    # The unknown attempt was reconciled with the same reference (Paystack had never received it).
    assert [s for (s,) in run_sql("SELECT status::text FROM payments")] == ["open"]


def test_the_same_idempotency_key_retries_a_failed_accept(api: TestClient, paystack: FakePaystack) -> None:
    fam, proposal, placement_id = _failed_accept(api, paystack, rejected=True)
    key = {"Idempotency-Key": "accept-after-failure-1"}
    paystack.reject_checkouts = True

    still_failing = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)
    paystack.reject_checkouts = False
    retry = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)
    replay = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)

    assert still_failing.status_code == 502  # failures aren't stored, so the key can be used again
    assert retry.status_code == replay.status_code == 201
    assert retry.json()["placement"]["id"] == placement_id
    assert replay.headers["idempotent-replay"] == "true"
    assert replay.json() == retry.json()
    assert len(paystack.transactions) == 1
    [(placements,)] = run_sql("SELECT count(*) FROM placements")
    assert placements == 1


def test_pay_also_resumes_after_a_failed_checkout(api: TestClient, paystack: FakePaystack) -> None:
    fam, _, placement_id = _failed_accept(api, paystack, rejected=False)

    retry = api.post(f"{API}/placements/{placement_id}/pay", headers=fam)
    again = api.post(f"{API}/placements/{placement_id}/pay", headers=fam)

    assert retry.status_code == 200
    assert again.json() == retry.json()
    assert len(paystack.transactions) == 1


def test_a_failed_hold_still_blocks_the_worker_and_can_be_cancelled(
    api: TestClient, paystack: FakePaystack
) -> None:
    agc = agency(api)
    worker = listed_worker(agc.id)
    fam = family(api)
    proposal = propose(api, agc, post_request(api, fam), worker)
    paystack.reject_checkouts = True
    assert api.post(f"{API}/proposals/{proposal}/accept", headers=fam).status_code == 502
    [(placement_id,)] = run_sql("SELECT id::text FROM placements")
    other = family(api, "other@example.com")
    other_request = post_request(api, other)

    blocked = api.post(
        f"{API}/requests/{other_request}/proposals", headers=agc.headers, json={"worker_id": str(worker)}
    )
    cancel = api.post(
        f"{API}/placements/{placement_id}/cancel", headers=fam, json={"reason": "Can't pay now."}
    )
    pay = api.post(f"{API}/placements/{placement_id}/pay", headers=fam)
    offered = api.post(
        f"{API}/requests/{other_request}/proposals", headers=agc.headers, json={"worker_id": str(worker)}
    )

    assert error_code(blocked) == "WORKER_UNAVAILABLE"  # rule 2: held, so not offered to anyone else
    assert cancel.status_code == 200
    assert error_code(pay) == "ILLEGAL_TRANSITION"  # nothing to pay once the hold is cancelled
    assert offered.status_code == 201  # released
    paystack.reject_checkouts = False
    reaccepted = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)  # the proposal is pending again
    assert reaccepted.status_code == 201  # was a 500 before migration 0007
    assert reaccepted.json()["placement"]["id"] != placement_id


def test_accept_after_the_own_hold_lapsed_starts_a_fresh_hold(
    api: TestClient, paystack: FakePaystack
) -> None:
    fam, proposal, placement_id = _failed_accept(api, paystack, rejected=False)

    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=31), tick=False):
        fam = bearer(login(api, "ada@example.com"))
        retry = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert retry.status_code == 201  # not REQUEST_NOT_OPEN while waiting for the job
    assert retry.json()["placement"]["id"] != placement_id
    statuses = {str(p): str(s) for p, s in run_sql("SELECT id::text, status::text FROM placements")}
    assert statuses == {placement_id: "cancelled", retry.json()["placement"]["id"]: "pending_payment"}
