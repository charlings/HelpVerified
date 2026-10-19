"""ADR 0017 section D: refunds are tracked to Paystack's `processed`, never resubmitted blindly, and anything
unresolved goes to an admin. Paystack is the in-memory fake (test-mode behaviour, O5-O7)."""

import uuid

from fastapi.testclient import TestClient

from app.core.config import load_settings
from app.modules.payments.models import PaymentRefund, RefundStatus
from app.modules.payments.service import PaymentService
from tests.conftest import helper_sessions, run_async, run_sql
from tests.fakes import FakePaystack
from tests.helpers import API
from tests.integration.test_checkout_recovery import expire_hold, open_alerts
from tests.integration.test_jobs import later
from tests.integration.test_paystack_webhook import charge_success, send
from tests.job_runs import run_job
from tests.placement_flows import Placed, placed


def late_payment(api: TestClient, paystack: FakePaystack) -> tuple[Placed, str]:
    """Paid after the hold's deadline: the payment can't be applied and must be refunded in full."""
    flow = placed(api, paid=False)
    [reference] = paystack.transactions
    expire_hold(flow.placement_id)
    paystack.pay(reference)
    assert send(api, charge_success(reference)).status_code == 200
    return flow, reference


def refund_row() -> tuple[object, ...]:
    [row] = run_sql("SELECT status::text, paystack_refund_id, clean_checks FROM payment_refunds")
    return row


def due_now() -> None:
    run_sql("UPDATE payment_refunds SET next_check_at = now() - interval '1 second'")


def test_a_lost_refund_reply_is_found_not_resent(api: TestClient, paystack: FakePaystack) -> None:
    """R-a/R-b: Paystack accepted the refund but the reply was lost. The refund is `uncertain`; reconciliation
    finds it in Paystack's refund list (by transaction and amount) instead of sending a second one."""
    paystack.lose_refund_replies = 1
    _, reference = late_payment(api, paystack)
    assert refund_row()[:2] == ("uncertain", None)

    due_now()
    run_job(api, "refund_retry")

    status, refund_id, _ = refund_row()
    assert (status, refund_id) == ("pending", paystack.refund_id_for(reference))
    assert paystack.refund_calls == 1
    assert len(paystack.refund_records) == 1


def test_transaction_reversed_means_a_refund_may_exist(api: TestClient, paystack: FakePaystack) -> None:
    """OD8: a refund request refused with `transaction_reversed` is reconciled, not marked failed or done."""
    _, reference = late_payment(api, paystack)
    run_sql("UPDATE payment_refunds SET status = 'requested', paystack_refund_id = NULL")  # e.g. a legacy row

    due_now()
    run_job(api, "refund_retry")  # submits; Paystack says a refund already exists
    assert refund_row()[0] == "uncertain"
    due_now()
    run_job(api, "refund_retry")  # finds it

    assert refund_row()[:2] == ("pending", paystack.refund_id_for(reference))
    assert len(paystack.refund_records) == 1  # never a second refund at Paystack


def test_an_unmatched_uncertain_refund_goes_to_an_admin(api: TestClient, paystack: FakePaystack) -> None:
    """With the automatic-resubmission gate closed (the default), an uncertain refund with no match is never
    resent: after the escalation threshold it's `admin_review` with an open alert."""
    paystack.refund_unreachable = True  # the request never reaches Paystack, so nothing can match
    late_payment(api, paystack)
    assert refund_row()[0] == "uncertain"

    for _ in range(2):
        due_now()
        run_job(api, "refund_retry")
    assert refund_row()[0] == "uncertain"
    assert refund_row()[2] == 2  # two clean checks, but the gate is closed

    run_sql("UPDATE payment_refunds SET submitted_at = now() - interval '25 hours'")
    due_now()
    run_job(api, "refund_retry")

    assert refund_row()[0] == "admin_review"
    assert paystack.refund_calls == 1  # never resent
    assert "refund_admin_review" in open_alerts()


def test_payment_and_refund_status_on_the_wire(api: TestClient, paystack: FakePaystack) -> None:
    """X1: `refund_pending` until Paystack confirms `processed`; never `refunded` before."""
    flow, reference = late_payment(api, paystack)

    def wire() -> tuple[str, str]:
        [item] = api.get(f"{API}/payments", headers=flow.family).json()["items"]
        return item["status"], item["refund_status"]

    assert wire() == ("refund_pending", "in_progress")
    paystack.set_refund(paystack.refund_id_for(reference), "processed")
    due_now()
    with later(minutes=1):
        run_job(api, "refund_retry")
    assert wire() == ("refunded", "completed")


def test_a_failed_refund_needs_attention_and_allows_a_new_one(
    api: TestClient, paystack: FakePaystack
) -> None:
    """D12 `failed` → `provider_failed` (released): the aggregate frees the amount for a new refund row."""
    _, reference = late_payment(api, paystack)
    paystack.set_refund(paystack.refund_id_for(reference), "failed")
    due_now()
    run_job(api, "refund_retry")

    assert refund_row()[0] == "provider_failed"
    assert "refund_attention" in open_alerts()
    [(committed,)] = run_sql("SELECT refund_committed_kobo FROM payments")
    assert committed == 0  # released

    [(payment_id,)] = run_sql("SELECT id FROM payments")

    async def new_refund() -> None:
        async with helper_sessions()() as session, session.begin():
            await PaymentService(session, load_settings(), paystack).refunds.add(
                PaymentRefund(payment_id=uuid.UUID(str(payment_id)), amount_kobo=2_000_000)
            )

    run_async(new_refund())
    statuses = sorted(str(s) for (s,) in run_sql("SELECT status::text FROM payment_refunds"))
    assert statuses == [RefundStatus.provider_failed.value, RefundStatus.requested.value]
