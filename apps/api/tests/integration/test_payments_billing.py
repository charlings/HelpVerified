"""The callback check, the payments list, resuming a checkout, and agency subscriptions."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.config import load_settings
from app.integrations.paystack import RemoteSubscription
from app.modules.payments.service import PaymentService
from tests.conftest import helper_sessions, run_async, run_sql
from tests.fakes import FakePaystack
from tests.helpers import API, error_code
from tests.integration.test_paystack_webhook import send
from tests.placement_flows import agency, family, placed

# The callback page


def test_verify_settles_a_paid_checkout_before_the_webhook(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    before = api.get(f"{API}/payments/{reference}/verify", headers=flow.family).json()
    paystack.pay(reference)

    after = api.get(f"{API}/payments/{reference}/verify", headers=flow.family).json()

    assert before["status"] == "pending"
    assert before["placement_status"] == "pending_payment"
    assert after == {
        "reference": reference,
        "status": "success",
        "amount_kobo": 2_000_000,
        "placement_id": flow.placement_id,
        "placement_status": "trial",
    }


def test_only_the_payer_can_check_a_payment(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    stranger = family(api, "stranger@example.com")

    assert api.get(f"{API}/payments/{reference}/verify", headers=stranger).status_code == 404
    assert api.get(f"{API}/payments/{reference}/verify", headers=flow.agency.headers).status_code == 404
    assert api.get(f"{API}/payments/HV-PF-NOPE/verify", headers=flow.family).status_code == 404


def test_payments_list_is_the_callers_own(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    stranger = family(api, "stranger@example.com")

    mine = api.get(f"{API}/payments", headers=flow.family).json()

    assert mine["total"] == 1
    [row] = mine["items"]
    assert row["description"] == "Placement fee"
    assert row["amount_kobo"] == 2_000_000
    assert row["currency"] == "NGN"
    assert row["status"] == "pending"
    assert api.get(f"{API}/payments", headers=stranger).json()["total"] == 0


def test_pay_resumes_and_only_for_a_hold(api: TestClient, paystack: FakePaystack) -> None:
    hold = placed(api, paid=False)
    [reference] = paystack.transactions

    resumed = api.post(f"{API}/placements/{hold.placement_id}/pay", headers=hold.family)
    stranger = api.post(f"{API}/placements/{hold.placement_id}/pay", headers=family(api, "s@example.com"))

    assert resumed.json() == {
        "authorization_url": f"https://checkout.paystack.test/{reference}",
        "reference": reference,
    }
    assert stranger.status_code == 404
    paystack.pay(reference)
    send(api, _charge(reference))
    assert error_code(api.post(f"{API}/placements/{hold.placement_id}/pay", headers=hold.family)) == (
        "ILLEGAL_TRANSITION"
    )


def test_cancelling_a_hold_fails_its_checkout(api: TestClient, paystack: FakePaystack) -> None:
    hold = placed(api, paid=False)
    [reference] = paystack.transactions

    api.post(
        f"{API}/placements/{hold.placement_id}/cancel", headers=hold.family, json={"reason": "Changed plans"}
    )

    [(status,)] = run_sql("SELECT status::text FROM payments")
    assert status == "failed"
    paystack.pay(reference)  # they pay anyway, on the old checkout page
    send(api, _charge(reference))
    [(status,)] = run_sql("SELECT status::text FROM payments")
    assert status == "refunded"  # money was taken for a hold that no longer exists: it goes back
    assert paystack.refunds == [reference]
    assert run_sql("SELECT count(*) FROM placements WHERE status = 'trial'") == [(0,)]


def _charge(reference: str, amount: int = 2_000_000) -> dict[str, object]:
    return {
        "event": "charge.success",
        "data": {
            "id": hash(reference) % 10**9,
            "reference": reference,
            "amount": amount,
            "currency": "NGN",
            "status": "success",
        },
    }


# Subscriptions


def test_subscribing_opens_a_plan_checkout(api: TestClient, paystack: FakePaystack) -> None:
    agc = agency(api, subscribed=False)

    response = api.post(f"{API}/billing/subscription", headers=agc.headers)

    assert response.status_code == 200
    reference = response.json()["reference"]
    assert reference.startswith("HV-SUB-")
    txn = paystack.transactions[reference]
    assert txn["plan"] == "PLN_test_agency_monthly"
    assert txn["amount"] == 2_500_000
    assert txn["callback_url"] == "http://localhost:3000/agency/billing"
    assert api.get(f"{API}/billing/subscription", headers=agc.headers).json() is None


def test_paying_the_subscription_activates_the_agency(api: TestClient, paystack: FakePaystack) -> None:
    agc = agency(api, subscribed=False)
    reference = api.post(f"{API}/billing/subscription", headers=agc.headers).json()["reference"]
    paystack.pay(reference, amount_kobo=2_500_000)

    send(api, _charge(reference, 2_500_000))

    subscription = api.get(f"{API}/billing/subscription", headers=agc.headers).json()
    assert subscription["status"] == "active"
    assert subscription["plan_name"] == "Agency monthly"
    period_end = datetime.fromisoformat(subscription["current_period_end"])
    assert timedelta(days=27) < period_end - datetime.now(UTC) < timedelta(days=32)
    assert api.get(f"{API}/agencies/me/dashboard", headers=agc.headers).json()["active"] is True
    payments = api.get(f"{API}/payments", headers=agc.headers).json()["items"]
    assert [p["description"] for p in payments] == ["Agency subscription"]


def test_only_approved_agencies_without_an_active_plan_can_subscribe(api: TestClient) -> None:
    pending = agency(api, "pending@example.com", status="pending", subscribed=False)
    active = agency(api, "active@example.com")

    assert error_code(api.post(f"{API}/billing/subscription", headers=pending.headers)) == "AGENCY_NOT_ACTIVE"
    assert error_code(api.post(f"{API}/billing/subscription", headers=active.headers)) == "ILLEGAL_TRANSITION"


def test_subscription_lifecycle_events(api: TestClient) -> None:
    agc = agency(api, subscribed=False)
    next_month = (datetime.now(UTC) + timedelta(days=30)).replace(microsecond=0)
    base = {
        "subscription_code": "SUB_abc123",
        "customer": {"email": "agency@example.com", "customer_code": "CUS_1"},
        "plan": {"plan_code": "PLN_test_agency_monthly"},
        "next_payment_date": next_month.isoformat(),
    }

    send(api, {"event": "subscription.create", "data": base | {"id": 1}})
    created = api.get(f"{API}/billing/subscription", headers=agc.headers).json()
    send(
        api,
        {
            "event": "invoice.payment_failed",
            "data": {"id": 2, "subscription": base, "customer": base["customer"]},
        },
    )
    failed = api.get(f"{API}/billing/subscription", headers=agc.headers).json()
    send(api, {"event": "subscription.disable", "data": base | {"id": 3}})
    disabled = api.get(f"{API}/billing/subscription", headers=agc.headers).json()

    assert created["status"] == "active"
    assert datetime.fromisoformat(created["current_period_end"]) == next_month
    assert failed["status"] == "past_due"
    assert disabled["status"] == "cancelled"
    assert api.get(f"{API}/agencies/me/dashboard", headers=agc.headers).json()["active"] is False
    [(code, customer)] = run_sql(
        "SELECT paystack_subscription_code, paystack_customer_code FROM subscriptions"
    )
    assert (code, customer) == ("SUB_abc123", "CUS_1")


async def _reconcile(paystack: FakePaystack) -> int:
    async with helper_sessions()() as session:
        return await PaymentService(session, load_settings(), paystack).reconcile_subscriptions()


def test_reconcile_brings_subscriptions_in_line_with_paystack(
    api: TestClient, paystack: FakePaystack
) -> None:
    agc = agency(api)
    run_sql("UPDATE subscriptions SET paystack_subscription_code = 'SUB_xyz' WHERE agency_id = :a", a=agc.id)
    renewed_to = (datetime.now(UTC) + timedelta(days=60)).replace(microsecond=0)
    paystack.subscriptions["SUB_xyz"] = RemoteSubscription("SUB_xyz", "attention", renewed_to)

    assert run_async(_reconcile(paystack)) == 1
    assert run_async(_reconcile(paystack)) == 0  # nothing left to change

    [(status, period_end)] = run_sql("SELECT status::text, current_period_end FROM subscriptions")
    assert status == "past_due"
    assert period_end == renewed_to
    assert uuid.UUID(str(agc.id))
