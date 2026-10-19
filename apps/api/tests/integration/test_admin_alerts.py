"""ADR 0017 OD4: persistent admin alerts. View, acknowledge (still unresolved), resolve with a note (audited).
Refunds are made in the Paystack dashboard; an admin can name one so it's tracked to `processed`."""

from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.fakes import FakePaystack
from tests.helpers import API, bearer, create_user, error_code, login
from tests.integration.test_refund_lifecycle import due_now, late_payment
from tests.job_runs import run_job


def admin(api: TestClient) -> dict[str, str]:
    create_user("admin@example.com", role="super_admin")
    return bearer(login(api, "admin@example.com"))


def test_alerts_are_admin_only_and_list_open_ones(api: TestClient, paystack: FakePaystack) -> None:
    flow, reference = late_payment(api, paystack)
    headers = admin(api)

    listed = api.get(f"{API}/admin/alerts", headers=headers).json()
    denied = api.get(f"{API}/admin/alerts", headers=flow.family)

    [alert] = listed["items"]
    assert (alert["kind"], alert["state"], alert["payment_reference"]) == ("late_payment", "open", reference)
    assert denied.status_code == 403
    assert api.get(f"{API}/admin/overview", headers=headers).json()["open_alerts"] == 1


def test_acknowledging_doesnt_resolve_and_resolving_needs_a_note(
    api: TestClient, paystack: FakePaystack
) -> None:
    late_payment(api, paystack)
    headers = admin(api)
    [alert] = api.get(f"{API}/admin/alerts", headers=headers).json()["items"]

    acknowledged = api.post(f"{API}/admin/alerts/{alert['id']}/acknowledge", headers=headers).json()
    still_open = api.get(f"{API}/admin/alerts", headers=headers).json()["items"]
    no_note = api.post(f"{API}/admin/alerts/{alert['id']}/resolve", headers=headers, json={"note": ""})
    resolved = api.post(
        f"{API}/admin/alerts/{alert['id']}/resolve",
        headers=headers,
        json={"note": "Refund checked in Paystack."},
    )
    again = api.post(f"{API}/admin/alerts/{alert['id']}/resolve", headers=headers, json={"note": "Twice."})

    assert acknowledged["state"] == "acknowledged"
    assert [a["id"] for a in still_open] == [alert["id"]]  # acknowledged is still unresolved
    assert no_note.status_code == 422
    assert (resolved.json()["state"], resolved.json()["resolved_by"]) == ("resolved", "Test User")
    assert error_code(again) == "ILLEGAL_TRANSITION"
    actions = {str(a) for (a,) in run_sql("SELECT action FROM audit_log WHERE entity = 'alert'")}
    assert actions == {"alert.acknowledged", "alert.resolved"}


def test_an_admin_can_attach_a_dashboard_refund_to_track_it(api: TestClient, paystack: FakePaystack) -> None:
    """RT12(a): a declined refund (needs attention) is refunded in the Paystack dashboard; the admin names it,
    it's confirmed with Paystack, tracked, and the payment is `refunded` only once it's `processed`."""
    paystack.refuse_refunds = True
    flow, reference = late_payment(api, paystack)
    paystack.refuse_refunds = False
    assert api.portal is not None
    remote = api.portal.call(paystack.refund, reference, 2_000_000)  # made in the Paystack dashboard
    headers = admin(api)
    [attention] = [
        a
        for a in api.get(f"{API}/admin/alerts", headers=headers).json()["items"]
        if a["kind"] == "refund_attention"
    ]

    resolved = api.post(
        f"{API}/admin/alerts/{attention['id']}/resolve",
        headers=headers,
        json={"note": "Refunded from the dashboard.", "paystack_refund_id": remote.id},
    )
    statuses = sorted(str(s) for (s,) in run_sql("SELECT status::text FROM payment_refunds"))
    [(payment_status,)] = run_sql("SELECT status::text FROM payments")

    assert resolved.status_code == 200
    assert statuses == ["pending", "provider_declined"]
    assert payment_status == "refund_due"  # requested isn't refunded
    paystack.set_refund(remote.id, "processed")
    due_now()
    run_job(api, "refund_retry")
    [(payment_status,)] = run_sql("SELECT status::text FROM payments")
    assert payment_status == "refunded"
    assert flow.placement_id


def test_a_refund_from_another_payment_cant_be_attached(api: TestClient, paystack: FakePaystack) -> None:
    paystack.refuse_refunds = True
    late_payment(api, paystack)
    headers = admin(api)
    [attention] = [
        a
        for a in api.get(f"{API}/admin/alerts", headers=headers).json()["items"]
        if a["kind"] == "refund_attention"
    ]

    response = api.post(
        f"{API}/admin/alerts/{attention['id']}/resolve",
        headers=headers,
        json={"note": "Wrong refund.", "paystack_refund_id": 999_999},
    )

    assert response.status_code == 502  # Paystack doesn't know it: nothing is attached or resolved
    assert run_sql("SELECT count(*) FROM admin_alerts WHERE resolved_at IS NULL") != [(0,)]
