"""Migration 0008's legacy mapping (ADR 0017 section H): every legacy placement-fee state lands where the ADR
proposes, nothing becomes `refunded` without Paystack's `processed` confirmation, and rows without enough
evidence stay unresolved with an alert. Runs on the test database only (it migrates down and up)."""

import uuid

import pytest
from alembic import command
from fastapi.testclient import TestClient

from tests.conftest import alembic_config, reset_app_connections, reset_sql_connections, run_sql
from tests.factories import create_agency, create_family, create_proposal, create_request, insert_placement

pytestmark = pytest.mark.usefixtures("clean_state")


def _placement(status: str) -> tuple[uuid.UUID, uuid.UUID]:
    from tests.factories import listed_worker

    family = create_family()
    placement = insert_placement(
        create_proposal(create_request(family), listed_worker(create_agency())), status
    )
    [(user_id,)] = run_sql("SELECT user_id FROM families WHERE id = :f", f=family)
    return placement, uuid.UUID(str(user_id))


def _legacy(
    reference: str,
    status: str,
    placement_status: str = "pending_payment",
    *,
    link: bool = True,
    sent: bool = False,
    attempts: int = 0,
) -> None:
    placement, payer = _placement(placement_status)
    run_sql(
        "INSERT INTO payments (kind, payer_user_id, placement_id, amount_kobo, paystack_reference, "
        "authorization_url, status, paid_at, refunded_at, refund_sent_at, refund_attempts) "
        "VALUES ('placement_fee', :payer, :p, 2000000, :ref, :url, CAST(:s AS payment_status), "
        "CASE WHEN :s IN ('success', 'refunded') THEN now() END, CASE WHEN :s = 'refunded' THEN now() END, "
        "CASE WHEN :sent THEN now() END, :attempts)",
        payer=payer,
        p=placement,
        ref=reference,
        url=f"https://checkout.paystack.test/{reference}" if link else None,
        s=status,
        sent=sent,
        attempts=attempts,
    )


def test_legacy_rows_are_mapped_without_inventing_evidence(shared_api: TestClient) -> None:
    config = alembic_config()
    command.downgrade(config, "0007")
    reset_sql_connections()
    try:
        _legacy("L-SUCCESS", "success", "trial")
        _legacy("L-PENDING-LIVE", "pending")
        _legacy("L-PENDING-ENDED", "pending", "cancelled")
        _legacy("L-FAILED-LINK", "failed", "cancelled")
        _legacy("L-FAILED-NOLINK", "failed", "cancelled", link=False)
        _legacy("L-REFUND-SENT", "refunded", "cancelled", sent=True, attempts=1)
        _legacy("L-REFUND-UNSENT", "refunded", "cancelled")
        _legacy("L-REFUND-TRIED", "refunded", "cancelled", attempts=3)
        _legacy("L-REFUND-GAVE-UP", "refunded", "cancelled", attempts=10)
    finally:
        command.upgrade(config, "head")
        reset_sql_connections()
        reset_app_connections(shared_api)

    payments = {
        str(r): (str(s), c)
        for r, s, c in run_sql("SELECT paystack_reference, status::text, closed_reason FROM payments")
    }
    assert payments == {
        "L-SUCCESS": ("succeeded", None),
        "L-PENDING-LIVE": ("open", None),
        "L-PENDING-ENDED": ("closed", "hold_ended"),
        "L-FAILED-LINK": ("closed", "hold_ended"),  # never the new, provider-confirmed `failed`
        "L-FAILED-NOLINK": ("unknown", None),
        "L-REFUND-SENT": ("refund_due", None),  # legacy `refunded` ≠ processed
        "L-REFUND-UNSENT": ("refund_due", None),
        "L-REFUND-TRIED": ("refund_due", None),
        "L-REFUND-GAVE-UP": ("refund_due", None),
    }
    refunds = {
        str(r): str(s)
        for r, s in run_sql(
            "SELECT p.paystack_reference, f.status::text "
            "FROM payment_refunds f JOIN payments p ON p.id = f.payment_id"
        )
    }
    assert refunds == {
        "L-REFUND-SENT": "uncertain",  # Paystack accepted it once; reconcile before anything else
        "L-REFUND-UNSENT": "requested",
        "L-REFUND-TRIED": "uncertain",  # earlier attempts may have reached Paystack
        "L-REFUND-GAVE-UP": "admin_review",
    }
    assert run_sql("SELECT count(*) FROM payments WHERE refunded_at IS NOT NULL") == [(0,)]
    flagged = {
        str(r)
        for (r,) in run_sql(
            "SELECT p.paystack_reference FROM admin_alerts a JOIN payments p ON p.id = a.payment_id "
            "WHERE a.kind = 'legacy_unresolved' AND a.resolved_at IS NULL"
        )
    }
    assert flagged == {
        "L-PENDING-ENDED",
        "L-REFUND-SENT",
        "L-REFUND-UNSENT",
        "L-REFUND-TRIED",
        "L-REFUND-GAVE-UP",
    }
    [(committed,)] = run_sql("SELECT sum(refund_committed_kobo) FROM payments")
    assert committed == 4 * 2_000_000  # every legacy refund is counted against its capture

    # Leave nothing unresolved behind: the next test may migrate down, which refuses while it exists.
    run_sql("DELETE FROM admin_alerts")
    run_sql("DELETE FROM payment_refunds")
