"""ADR 0017: checkout attempts, settlement and the idempotency replay rule, end to end through the API.

Paystack is tests.fakes.FakePaystack, which behaves as observed in test mode on 2026-10-19 (O1-O8). Holds are
expired with SQL (the database clock decides, OD1), not with time_machine, which only moves the API's clock.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

from app.core.config import load_settings
from app.core.errors import HoldExpired
from app.db.errors import pg_error
from app.integrations.paystack import Initialized
from app.modules.payments.service import PaymentService
from tests.conftest import helper_sessions, run_async, run_sql
from tests.factories import listed_worker
from tests.fakes import FakePaystack
from tests.helpers import API, error_code
from tests.integration.test_paystack_webhook import charge_success, send
from tests.job_runs import run_job
from tests.placement_flows import agency, family, placed, post_request, propose


def attempts() -> dict[str, str]:
    return {str(r): str(s) for r, s in run_sql("SELECT paystack_reference, status::text FROM payments")}


def expire_hold(placement_id: str) -> None:
    """The hold's deadline passes at the database clock; `expire_holds` hasn't run yet."""
    run_sql(
        "UPDATE placements SET hold_expires_at = now() - interval '1 second' WHERE id = :p",
        p=uuid.UUID(placement_id),
    )


def placement_status(placement_id: str) -> str:
    [(status,)] = run_sql("SELECT status::text FROM placements WHERE id = :p", p=uuid.UUID(placement_id))
    return str(status)


def open_alerts() -> set[str]:
    return {str(k) for (k,) in run_sql("SELECT kind FROM admin_alerts WHERE resolved_at IS NULL")}


def _accept_proposal(api: TestClient) -> tuple[dict[str, str], str]:
    fam = family(api)
    agc = agency(api)
    return fam, propose(api, agc, post_request(api, fam), listed_worker(agc.id))


# Ambiguous initialisation (section A)


def test_a_lost_reply_is_reconciled_with_the_same_reference(api: TestClient, paystack: FakePaystack) -> None:
    """AT5 → AT7: Paystack created the transaction but the reply was lost. The retry re-initialises the
    same reference, gets `duplicate_reference` (no link, O1), verifies it unpaid and marks it `orphaned`; only
    then is a new reference issued. The orphaned reference stays watched."""
    fam, proposal = _accept_proposal(api)
    paystack.lose_initialize_replies = 1

    first = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)
    [lost] = paystack.transactions
    assert first.status_code == 502
    assert first.json()["error"]["details"]["reason"] == "unavailable"
    assert attempts() == {lost: "unknown"}

    second = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert second.status_code == 201
    new = second.json()["payment"]["reference"]
    assert new != lost
    assert attempts() == {lost: "orphaned", new: "open"}
    [(watched,)] = run_sql(
        "SELECT watch_until IS NOT NULL FROM payments WHERE paystack_reference = :r", r=lost
    )
    assert watched is True
    assert paystack.initialize_calls == 3  # the lost one, the same-reference probe, the new one


def test_an_unknown_outcome_blocks_a_new_reference_while_paystack_is_down(
    api: TestClient, paystack: FakePaystack
) -> None:
    fam, proposal = _accept_proposal(api)
    paystack.lose_initialize_replies = 1
    api.post(f"{API}/proposals/{proposal}/accept", headers=fam)
    paystack.down = True

    retry = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert retry.status_code == 502
    assert retry.json()["error"]["details"]["reason"] == "unavailable"
    assert list(attempts().values()) == ["unknown"]  # never a second reference while unresolved
    assert paystack.initialize_calls == 2  # one same-reference probe, then it stops (bounded)


def test_a_duplicate_reference_that_was_paid_is_settled_not_replaced(
    api: TestClient, paystack: FakePaystack
) -> None:
    """AT7 with `success`: the lost transaction was paid. It's settled; no new reference is issued."""
    fam, proposal = _accept_proposal(api)
    paystack.lose_initialize_replies = 1
    placement_id = api.post(f"{API}/proposals/{proposal}/accept", headers=fam).json()["error"]["details"][
        "placement_id"
    ]
    [lost] = paystack.transactions
    paystack.pay(lost)

    retry = api.post(f"{API}/proposals/{proposal}/accept", headers=fam)

    assert error_code(retry) == "REQUEST_NOT_OPEN"  # paid: R3
    assert placement_status(placement_id) == "trial"
    assert attempts() == {lost: "succeeded"}


def test_a_late_reply_after_the_hold_expired_never_returns_a_link(api: TestClient) -> None:
    """AT3 / AT10a: the reply arrives after the hold ended. The link is kept for watching, never returned."""
    flow = placed(api, paid=False)
    [(found,)] = run_sql("SELECT paystack_reference FROM payments")
    reference = str(found)
    run_sql(
        "UPDATE payments SET status = 'initiating', authorization_url = NULL WHERE paystack_reference = :r",
        r=reference,
    )
    expire_hold(flow.placement_id)

    async def record() -> object:
        async with helper_sessions()() as session:
            service = PaymentService(session, load_settings(), FakePaystack())
            return await service._record_initialise(  # the T2 step, directly
                reference, Initialized("https://checkout.paystack.test/late", "ac", reference)
            )

    result = run_async(record())

    assert isinstance(result, HoldExpired)
    [(status, reason, link)] = run_sql("SELECT status::text, closed_reason, authorization_url FROM payments")
    assert (status, reason, link) == ("closed", "hold_ended", "https://checkout.paystack.test/late")


def test_no_initialise_after_the_hold_ends(api: TestClient, paystack: FakePaystack) -> None:
    """AT16: an unknown attempt on an expired hold is reconciled by verify only (no new transaction)."""
    fam, proposal = _accept_proposal(api)
    paystack.lose_initialize_replies = 1
    placement_id = api.post(f"{API}/proposals/{proposal}/accept", headers=fam).json()["error"]["details"][
        "placement_id"
    ]
    expire_hold(placement_id)
    run_sql("UPDATE payments SET next_reconcile_at = now() - interval '1 second'")

    run_job(api, "reconcile_checkouts")

    assert paystack.initialize_calls == 1
    assert list(attempts().values()) == ["orphaned"]  # found unpaid by verify, no link ever stored


# Confirmed failure and new attempts (OD3)


def test_a_confirmed_failure_allows_a_new_attempt(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [first] = paystack.transactions
    paystack.decline(first)

    api.get(f"{API}/payments/{first}/verify", headers=flow.family)  # the browser return prompts a verify
    pay = api.post(f"{API}/placements/{flow.placement_id}/pay", headers=flow.family)

    second = pay.json()["reference"]
    assert pay.status_code == 200
    assert second != first
    assert attempts() == {first: "failed", second: "open"}


def test_abandoned_is_not_a_failure(api: TestClient, paystack: FakePaystack) -> None:
    """`abandoned` is also the initial state (O2): the same link is returned, no new attempt."""
    flow = placed(api, paid=False)
    [first] = paystack.transactions

    again = api.post(f"{API}/placements/{flow.placement_id}/pay", headers=flow.family)

    assert again.json()["reference"] == first
    assert attempts() == {first: "open"}


def test_a_late_success_on_a_failed_attempt_is_applied_once(api: TestClient, paystack: FakePaystack) -> None:
    """OD3 rule 6 and AT14: the failed reference stays watched; if it's paid after all while the hold is
    valid, it's applied and the newer attempt is closed (superseded). A payment to that one is refunded."""
    flow = placed(api, paid=False)
    [first] = paystack.transactions
    paystack.decline(first)
    api.get(f"{API}/payments/{first}/verify", headers=flow.family)
    second = api.post(f"{API}/placements/{flow.placement_id}/pay", headers=flow.family).json()["reference"]

    paystack.pay(first)  # e.g. the hosted page let them retry on the old link (T8 untested)
    send(api, charge_success(first))

    assert placement_status(flow.placement_id) == "trial"
    assert attempts() == {first: "succeeded", second: "closed"}
    [(reason,)] = run_sql("SELECT closed_reason FROM payments WHERE paystack_reference = :r", r=second)
    assert reason == "superseded"

    paystack.pay(second)  # a second real charge
    send(api, charge_success(second))

    assert attempts() == {first: "succeeded", second: "refund_due"}
    assert "duplicate_charge" in open_alerts()
    trials = run_sql("SELECT count(*) FROM placement_events WHERE to_status = 'trial'")
    assert trials == [(1,)]  # one entitlement


def test_the_attempt_cap_stops_a_fourth_attempt(api: TestClient, paystack: FakePaystack) -> None:
    paystack.reject_checkouts = True
    fam, proposal = _accept_proposal(api)
    placement_id = api.post(f"{API}/proposals/{proposal}/accept", headers=fam).json()["error"]["details"][
        "placement_id"
    ]

    second = api.post(f"{API}/placements/{placement_id}/pay", headers=fam)
    third = api.post(f"{API}/placements/{placement_id}/pay", headers=fam)
    fourth = api.post(f"{API}/placements/{placement_id}/pay", headers=fam)

    assert [second.status_code, third.status_code] == [502, 502]
    assert fourth.status_code == 409
    assert error_code(fourth) == "CHECKOUT_ATTEMPTS_EXHAUSTED"
    assert fourth.json()["error"]["details"]["placement_id"] == placement_id
    assert sorted(attempts().values()) == ["rejected"] * 3
    assert "checkout_unresolved" in open_alerts()


# Expired holds (OD1, OD2)


def test_pay_on_an_expired_hold_is_hold_expired(api: TestClient) -> None:
    flow = placed(api, paid=False)
    expire_hold(flow.placement_id)

    response = api.post(f"{API}/placements/{flow.placement_id}/pay", headers=flow.family)

    assert response.status_code == 409
    assert error_code(response) == "HOLD_EXPIRED"
    assert response.json()["error"]["details"]["placement_id"] == flow.placement_id


def test_a_success_after_the_deadline_is_refunded_even_before_the_job(
    api: TestClient, paystack: FakePaystack
) -> None:
    """OD1: the database clock decides. The placement isn't revived and no trial starts."""
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    expire_hold(flow.placement_id)
    paystack.pay(reference)

    response = send(api, charge_success(reference))

    assert response.status_code == 200
    assert placement_status(flow.placement_id) == "pending_payment"  # the job cancels it later
    assert attempts() == {reference: "refund_due"}
    assert open_alerts() == {"late_payment"}
    assert run_sql("SELECT count(*) FROM placement_events WHERE to_status = 'trial'") == [(0,)]
    payments = api.get(f"{API}/payments", headers=flow.family).json()["items"]
    assert [(p["status"], p["refund_status"]) for p in payments] == [("refund_pending", "in_progress")]


@pytest.mark.parametrize(
    ("setup", "hint"),
    [
        ("UPDATE placements SET hold_expires_at = now() - interval '1 second'", "HOLD_EXPIRED"),
        ("UPDATE placements SET status = 'cancelled', ended_at = now(), end_reason = 'family_ended'", None),
    ],
    ids=["expired-hold", "cancelled"],
)
def test_the_database_refuses_a_trial_after_expiry_or_cancellation(
    api: TestClient, setup: str, hint: str | None
) -> None:
    """I11: even a path that skips the services can't start a trial after the hold or revive a placement."""
    flow = placed(api, paid=False)
    run_sql(f"{setup} WHERE id = :p", p=uuid.UUID(flow.placement_id))

    with pytest.raises(DBAPIError) as raised:
        run_sql("UPDATE placements SET status = 'trial' WHERE id = :p", p=uuid.UUID(flow.placement_id))

    assert pg_error(raised.value).hint == (hint or "ILLEGAL_TRANSITION")


def test_a_charge_for_an_unknown_reference_raises_an_alert_and_grants_nothing(
    api: TestClient, paystack: FakePaystack
) -> None:
    run_async(paystack.initialize("x@example.com", 2_000_000, "HV-PF-GHOST", "http://x", {}))
    paystack.pay("HV-PF-GHOST")

    response = send(api, charge_success("HV-PF-GHOST"))

    assert response.status_code == 200
    assert open_alerts() == {"unmatched_charge"}
    assert run_sql("SELECT count(*) FROM payments") == [(0,)]


# The idempotency replay rule (OD2)


def test_a_live_replay_is_identical(api: TestClient) -> None:
    fam, proposal = _accept_proposal(api)
    key = {"Idempotency-Key": "press-1"}

    first = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)
    replay = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)

    assert replay.json() == first.json()
    assert replay.headers["idempotent-replay"] == "true"


def test_a_replay_after_the_attempt_failed_returns_the_current_checkout(
    api: TestClient, paystack: FakePaystack
) -> None:
    fam, proposal = _accept_proposal(api)
    key = {"Idempotency-Key": "press-2"}
    first = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key).json()
    paystack.decline(first["payment"]["reference"])
    api.get(f"{API}/payments/{first['payment']['reference']}/verify", headers=fam)

    replay = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)

    assert replay.status_code == 201
    assert replay.headers["idempotent-replay"] == "true"
    assert replay.json()["placement"]["id"] == first["placement"]["id"]  # the same hold, resumed
    assert replay.json()["payment"]["reference"] != first["payment"]["reference"]  # never a dead link


def test_a_replay_after_the_hold_expired_is_hold_expired(api: TestClient) -> None:
    fam, proposal = _accept_proposal(api)
    key = {"Idempotency-Key": "press-3"}
    first = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key).json()
    expire_hold(first["placement"]["id"])

    replay = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)

    assert error_code(replay) == "HOLD_EXPIRED"
    assert replay.json()["error"]["details"]["placement_id"] == first["placement"]["id"]
    assert "authorization_url" not in replay.text


def test_a_pay_replay_after_the_hold_expired_is_hold_expired(api: TestClient) -> None:
    flow = placed(api, paid=False)
    key = {"Idempotency-Key": "pay-1"}
    first = api.post(f"{API}/placements/{flow.placement_id}/pay", headers=flow.family | key)
    expire_hold(flow.placement_id)

    replay = api.post(f"{API}/placements/{flow.placement_id}/pay", headers=flow.family | key)

    assert first.status_code == 200
    assert error_code(replay) == "HOLD_EXPIRED"
    assert "authorization_url" not in replay.text


def test_a_replay_after_payment_is_request_not_open(api: TestClient, paystack: FakePaystack) -> None:
    fam, proposal = _accept_proposal(api)
    key = {"Idempotency-Key": "press-4"}
    first = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key).json()
    paystack.pay(first["payment"]["reference"])
    send(api, charge_success(first["payment"]["reference"]))

    replay = api.post(f"{API}/proposals/{proposal}/accept", headers=fam | key)

    assert error_code(replay) == "REQUEST_NOT_OPEN"
    assert replay.json()["error"]["details"]["placement_id"] == first["placement"]["id"]
