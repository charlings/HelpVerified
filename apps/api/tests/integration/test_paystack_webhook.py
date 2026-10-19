"""The Paystack webhook (spec acceptance item 24): bad signature → 401; a duplicate has no second effect;
an amount mismatch changes nothing; a payment after the hold lapsed (worker taken) is refunded, and no
second placement is ever created."""

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import time_machine
from fastapi.testclient import TestClient
from httpx import Response

from tests.conftest import TEST_ENV, run_sql
from tests.factories import listed_worker
from tests.fakes import FakePaystack
from tests.helpers import API, bearer, error_code, login
from tests.placement_flows import accept, agency, family, placed, post_request, propose

SECRET = TEST_ENV["PAYSTACK_SECRET_KEY"]


def send(
    api: TestClient, event: dict[str, Any], *, secret: str = SECRET, signature: str | None = None
) -> Response:
    raw = json.dumps(event).encode()
    sig = signature if signature is not None else hmac.new(secret.encode(), raw, hashlib.sha512).hexdigest()
    response: Response = api.post(
        f"{API}/webhooks/paystack",
        content=raw,
        headers={"x-paystack-signature": sig, "content-type": "application/json"},
    )
    return response


def charge_success(reference: str, amount_kobo: int = 2_000_000) -> dict[str, Any]:
    return {
        "event": "charge.success",
        "data": {
            "id": abs(hash(reference)) % 10**9,
            "reference": reference,
            "amount": amount_kobo,
            "currency": "NGN",
            "status": "success",
            "paid_at": datetime.now(UTC).isoformat(),
            "customer": {"email": "ada@example.com"},
            "authorization": {"authorization_code": "AUTH_secret123", "last4": "4081", "bin": "408408"},
        },
    }


def placement_status(placement_id: str) -> str:
    [(status,)] = run_sql("SELECT status::text FROM placements WHERE id = :p", p=uuid.UUID(placement_id))
    return str(status)


def payment(reference: str) -> tuple[object, ...]:
    [row] = run_sql(
        "SELECT status::text, paid_at, refunded_at FROM payments WHERE paystack_reference = :r", r=reference
    )
    return row


def test_a_paid_checkout_starts_the_trial(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    paystack.pay(reference)

    response = send(api, charge_success(reference))

    assert response.status_code == 200
    assert placement_status(flow.placement_id) == "trial"
    status, paid_at, _ = payment(reference)
    assert status == "succeeded"
    assert paid_at is not None
    detail = api.get(f"{API}/placements/{flow.placement_id}", headers=flow.family).json()
    assert detail["events"][-1]["actor"] == "system"


def test_a_bad_signature_is_401_and_changes_nothing(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    paystack.pay(reference)

    forged = send(api, charge_success(reference), secret="sk_test_someone_elses_key")
    missing = send(api, charge_success(reference), signature="")

    assert forged.status_code == missing.status_code == 401
    assert error_code(forged) == "UNAUTHENTICATED"
    assert placement_status(flow.placement_id) == "pending_payment"
    assert run_sql("SELECT count(*) FROM webhook_events") == [(0,)]


def test_a_duplicate_event_has_no_second_effect(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    paystack.pay(reference)
    event = charge_success(reference)

    first = send(api, event)
    second = send(api, event)

    assert first.status_code == second.status_code == 200
    assert placement_status(flow.placement_id) == "trial"
    assert run_sql("SELECT count(*) FROM webhook_events") == [(1,)]
    events = run_sql("SELECT count(*) FROM placement_events WHERE to_status = 'trial'")
    assert events == [(1,)]


def test_value_is_granted_only_after_paystack_confirms(api: TestClient, paystack: FakePaystack) -> None:
    """The event says success, but Paystack's own record isn't paid: nothing changes."""
    flow = placed(api, paid=False)
    [reference] = paystack.transactions  # never paid

    response = send(api, charge_success(reference))

    assert response.status_code == 200
    assert placement_status(flow.placement_id) == "pending_payment"
    assert payment(reference)[0] == "open"


def test_an_amount_mismatch_changes_nothing(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    paystack.pay(reference, amount_kobo=100)  # paid ₦1 instead of the fee

    send(api, charge_success(reference, amount_kobo=2_000_000))

    assert placement_status(flow.placement_id) == "pending_payment"
    assert payment(reference)[0] == "open"


def test_paying_after_the_hold_lapsed_and_the_worker_was_taken_is_refunded(
    api: TestClient, paystack: FakePaystack
) -> None:
    agc = agency(api)
    worker = listed_worker(agc.id)
    slow = family(api, "slow@example.com")
    quick = family(api, "quick@example.com")
    slow_placement = accept(api, slow, propose(api, agc, post_request(api, slow), worker))["placement"]["id"]
    [slow_reference] = paystack.transactions
    quick_request = post_request(api, quick)

    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=31), tick=False):
        agc.headers = bearer(login(api, "agency@example.com"))
        quick = bearer(login(api, "quick@example.com"))
        accept(api, quick, propose(api, agc, quick_request, worker))  # takes the worker
        paystack.pay(slow_reference)  # the slow family pays anyway
        response = send(api, charge_success(slow_reference))

    assert response.status_code == 200
    assert placement_status(slow_placement) == "cancelled"
    status, _, refunded_at = payment(slow_reference)
    assert status == "refund_due"  # the refund is requested, not yet confirmed `processed` (ADR 0017)
    assert refunded_at is None
    assert paystack.refunds == [slow_reference]
    [(refund,)] = run_sql("SELECT status::text FROM payment_refunds")
    assert refund == "pending"
    [(alert,)] = run_sql("SELECT kind FROM admin_alerts WHERE resolved_at IS NULL")
    assert alert == "late_payment"
    active = run_sql(
        "SELECT count(*) FROM placements "
        "WHERE worker_id = :w AND status IN ('pending_payment', 'trial', 'confirmed')",
        w=worker,
    )
    assert active == [(1,)]  # never a second active placement


def test_stored_events_hold_no_card_authorization(api: TestClient, paystack: FakePaystack) -> None:
    placed(api, paid=False)
    [reference] = paystack.transactions
    paystack.pay(reference)

    send(api, charge_success(reference))

    [(payload,)] = run_sql("SELECT payload::text FROM webhook_events")
    assert "AUTH_secret123" not in str(payload)
    assert "408408" not in str(payload)


def test_unknown_events_are_acknowledged(api: TestClient) -> None:
    response = send(api, {"event": "transfer.success", "data": {"id": 1, "reference": "TRF_1"}})

    assert response.status_code == 200


def test_a_failed_verify_is_retried_on_redelivery(api: TestClient, paystack: FakePaystack) -> None:
    """If Paystack can't be reached to re-verify, the webhook fails so Paystack delivers it again."""
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    paystack.pay(reference)
    event = charge_success(reference)

    paystack.down = True
    first = send(api, event)
    paystack.down = False
    second = send(api, event)

    assert first.status_code == 502
    assert second.status_code == 200
    assert placement_status(flow.placement_id) == "trial"
