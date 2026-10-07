"""The placement lifecycle (database.md §6): trial, confirm, cancel, end, replacement; events, allowed
actions and who may see what."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.errors import IllegalTransition
from tests.conftest import run_sql
from tests.factories import listed_worker
from tests.helpers import API, bearer, create_user, error_code, login
from tests.placement_flows import accept, agency, family, mark_paid, placed, post_request, propose

REASON = {"reason": "Not the right fit for our home"}


def events(placement_id: str) -> list[tuple[object, ...]]:
    return run_sql(
        "SELECT from_status::text, to_status::text FROM placement_events WHERE placement_id = :p ORDER BY id",
        p=uuid.UUID(placement_id),
    )


def test_paying_starts_the_trial(api: TestClient) -> None:
    flow = placed(api)

    detail = api.get(f"{API}/placements/{flow.placement_id}", headers=flow.family).json()

    assert detail["status"] == "trial"
    assert detail["hold_expires_at"] is None
    starts = date.fromisoformat(detail["trial_starts_on"])
    assert date.fromisoformat(detail["trial_ends_on"]) - starts == timedelta(days=14)
    assert detail["allowed_actions"] == ["confirm", "request_replacement", "end"]
    assert [(e["from"], e["to"]) for e in detail["events"]] == [
        (None, "pending_payment"),
        ("pending_payment", "trial"),
    ]


@pytest.mark.parametrize(
    ("viewer", "actions"), [("family", ["pay", "cancel"]), ("agency", []), ("admin", [])]
)
def test_allowed_actions_depend_on_who_asks(api: TestClient, viewer: str, actions: list[str]) -> None:
    flow = placed(api, paid=False)
    create_user("admin@example.com", role="super_admin")
    headers = {
        "family": flow.family,
        "agency": flow.agency.headers,
        "admin": bearer(login(api, "admin@example.com")),
    }[viewer]

    assert (
        api.get(f"{API}/placements/{flow.placement_id}", headers=headers).json()["allowed_actions"] == actions
    )


def test_confirm(api: TestClient) -> None:
    flow = placed(api)
    path = f"{API}/placements/{flow.placement_id}/confirm"

    confirmed = api.post(path, headers=flow.family | {"Idempotency-Key": "confirm-1"})
    replay = api.post(path, headers=flow.family | {"Idempotency-Key": "confirm-1"})
    again = api.post(path, headers=flow.family)

    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["confirmed_at"] is not None
    assert confirmed.json()["allowed_actions"] == ["request_replacement", "end"]
    assert replay.json() == confirmed.json()
    assert error_code(again) == "ILLEGAL_TRANSITION"
    assert events(flow.placement_id)[-1] == ("trial", "confirmed")
    assert len(events(flow.placement_id)) == 3  # one row per transition


def test_cancelling_an_unpaid_hold_reopens_the_request(api: TestClient) -> None:
    flow = placed(api, paid=False)

    short = api.post(
        f"{API}/placements/{flow.placement_id}/cancel", headers=flow.family, json={"reason": "no"}
    )
    cancelled = api.post(f"{API}/placements/{flow.placement_id}/cancel", headers=flow.family, json=REASON)

    assert "reason" in short.json()["error"]["details"]["fields"]
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["end_reason"] == "family_ended"
    request = api.get(f"{API}/requests/{flow.request_id}", headers=flow.family).json()
    assert request["status"] == "open"
    assert request["pending_proposals"] == 1  # the accepted proposal is offered again
    assert api.get(f"{API}/workers/{flow.worker_id}", headers=flow.agency.headers).json()["available"] is True


@pytest.mark.parametrize(
    ("who", "end_reason"), [("family", "family_ended"), ("agency", "agency_ended"), ("admin", "admin_ended")]
)
def test_ending_records_who_ended_it(api: TestClient, who: str, end_reason: str) -> None:
    flow = placed(api)
    create_user("admin@example.com", role="super_admin")
    headers = {
        "family": flow.family,
        "agency": flow.agency.headers,
        "admin": bearer(login(api, "admin@example.com")),
    }[who]

    response = api.post(f"{API}/placements/{flow.placement_id}/end", headers=headers, json=REASON)

    assert response.status_code == 200
    assert response.json()["end_reason"] == end_reason
    assert response.json()["allowed_actions"] == []
    assert api.get(f"{API}/requests/{flow.request_id}", headers=flow.family).json()["status"] == "closed"
    audited = run_sql("SELECT action FROM audit_log WHERE action = 'placement.ended'")
    assert len(audited) == (1 if who == "admin" else 0)


def test_an_unpaid_hold_cant_be_ended_only_cancelled(api: TestClient) -> None:
    flow = placed(api, paid=False)

    response = api.post(f"{API}/placements/{flow.placement_id}/end", headers=flow.family, json=REASON)

    assert error_code(response) == "ILLEGAL_TRANSITION"


def test_replacement_ends_and_reopens(api: TestClient) -> None:
    flow = placed(api)

    response = api.post(f"{API}/placements/{flow.placement_id}/replacement", headers=flow.family, json=REASON)

    assert response.status_code == 200
    body = response.json()
    assert body["placement"]["status"] == "ended"
    assert body["placement"]["end_reason"] == "replaced"
    assert body["placement"]["replacements_used"] == 1
    new_request = body["new_request"]
    assert new_request["status"] == "open"
    assert new_request["replaces_placement_id"] == flow.placement_id
    assert api.get(f"{API}/requests/{flow.request_id}", headers=flow.family).json()["status"] == "closed"
    [(reason, linked)] = run_sql("SELECT reason, new_request_id::text FROM replacement_requests")
    assert (reason, linked) == (REASON["reason"], new_request["id"])


def test_the_first_replacement_is_free_and_the_second_is_charged(api: TestClient) -> None:
    flow = placed(api)
    first_copy = api.post(
        f"{API}/placements/{flow.placement_id}/replacement", headers=flow.family, json=REASON
    ).json()["new_request"]["id"]
    replacement_worker = listed_worker(flow.agency.id)

    free = accept(api, flow.family, propose(api, flow.agency, first_copy, replacement_worker))

    assert free["payment"] is None
    assert free["placement"]["status"] == "trial"  # no hold: straight to the trial
    assert free["placement"]["replacements_used"] == 1
    second_copy = api.post(
        f"{API}/placements/{free['placement']['id']}/replacement", headers=flow.family, json=REASON
    ).json()["new_request"]["id"]
    charged = accept(api, flow.family, propose(api, flow.agency, second_copy, listed_worker(flow.agency.id)))
    assert charged["payment"] is not None
    assert charged["placement"]["status"] == "pending_payment"
    assert charged["placement"]["replacements_used"] == 2
    [(status,)] = run_sql(
        "SELECT DISTINCT status::text FROM replacement_requests WHERE new_request_id = :r",
        r=uuid.UUID(first_copy),
    )
    assert status == "fulfilled"


def test_replacement_window_closes_30_days_after_confirming(api: TestClient) -> None:
    within = placed(api, family_email="within@example.com")
    late = placed(api, family_email="late@example.com")
    for flow in (within, late):
        api.post(f"{API}/placements/{flow.placement_id}/confirm", headers=flow.family)
    run_sql(
        "UPDATE placements SET confirmed_at = now() - interval '29 days' WHERE id = :p",
        p=uuid.UUID(within.placement_id),
    )
    run_sql(
        "UPDATE placements SET confirmed_at = now() - interval '31 days' WHERE id = :p",
        p=uuid.UUID(late.placement_id),
    )

    ok = api.post(f"{API}/placements/{within.placement_id}/replacement", headers=within.family, json=REASON)
    closed = api.post(f"{API}/placements/{late.placement_id}/replacement", headers=late.family, json=REASON)

    assert ok.status_code == 200
    assert closed.status_code == 409
    assert error_code(closed) == "REPLACEMENT_WINDOW_CLOSED"
    late_detail = api.get(f"{API}/placements/{late.placement_id}", headers=late.family).json()
    assert late_detail["allowed_actions"] == ["end"]


def test_rejecting_a_check_delists_but_the_placement_continues(api: TestClient) -> None:
    """Spec item 8's second half: delisting never ends an active placement (database.md §4)."""
    flow = placed(api)

    run_sql(
        "UPDATE verification_items SET status = 'rejected', rejection_reason = 'Guarantor withdrew', "
        "verified_at = NULL, verified_by = NULL WHERE worker_id = :w AND kind = 'guarantor'",
        w=flow.worker_id,
    )

    worker = api.get(f"{API}/workers/{flow.worker_id}", headers=flow.agency.headers).json()
    assert worker["listing_status"] == "delisted"
    assert worker["active_placement"]["id"] == flow.placement_id
    assert api.get(f"{API}/placements/{flow.placement_id}", headers=flow.family).json()["status"] == "trial"


def test_strangers_get_404_and_agencies_cant_act_for_families(api: TestClient) -> None:
    flow = placed(api)
    stranger = family(api, "stranger@example.com")
    other_agency = agency(api, "other@example.com")

    for headers in (stranger, other_agency.headers):
        assert api.get(f"{API}/placements/{flow.placement_id}", headers=headers).status_code == 404
        assert (
            api.post(f"{API}/placements/{flow.placement_id}/end", headers=headers, json=REASON).status_code
            == 404
        )
    assert (
        api.post(f"{API}/placements/{flow.placement_id}/confirm", headers=flow.agency.headers).status_code
        == 403
    )
    assert api.get(f"{API}/placements/{flow.placement_id}").status_code == 401


def test_placement_lists_are_scoped_by_role(api: TestClient) -> None:
    mine = placed(api, family_email="mine@example.com")
    create_user("admin@example.com", role="super_admin")
    stranger = family(api, "stranger@example.com")

    assert api.get(f"{API}/placements", headers=mine.family).json()["total"] == 1
    assert api.get(f"{API}/placements", headers=mine.agency.headers).json()["total"] == 1
    assert api.get(f"{API}/placements", headers=stranger).json()["total"] == 0
    admin = bearer(login(api, "admin@example.com"))
    assert api.get(f"{API}/placements?status=trial", headers=admin).json()["total"] == 1
    assert api.get(f"{API}/placements?status=confirmed", headers=admin).json()["total"] == 0


def test_dashboards_and_overview_see_placements(api: TestClient) -> None:
    flow = placed(api)
    run_sql(
        "UPDATE placements SET trial_ends_on = current_date + 2 WHERE id = :p", p=uuid.UUID(flow.placement_id)
    )
    create_user("admin@example.com", role="super_admin")
    admin = bearer(login(api, "admin@example.com"))

    family_dash = api.get(f"{API}/families/me/dashboard", headers=flow.family).json()
    agency_dash = api.get(f"{API}/agencies/me/dashboard", headers=flow.agency.headers).json()
    overview = api.get(f"{API}/admin/overview", headers=admin).json()
    agency_detail = api.get(f"{API}/admin/agencies/{flow.agency.id}", headers=admin).json()

    assert [p["id"] for p in family_dash["active_placements"]] == [flow.placement_id]
    assert family_dash["open_requests"] == []
    assert [t["id"] for t in agency_dash["trials_ending"]] == [flow.placement_id]
    assert agency_dash["trials_ending"][0]["family_name"] == "User family"
    assert overview["placements_active"] == 1
    assert overview["trials_ending_soon"] == 1
    assert overview["workers_listed"] == 1
    assert overview["fees_paid_this_month_kobo"] == 2_000_000
    assert agency_detail["active_placements"] == 1


def test_suspending_an_agency_withdraws_its_pending_proposals(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    proposal_id = propose(api, agc, post_request(api, fam), listed_worker(agc.id))
    create_user("admin@example.com", role="super_admin")

    api.post(
        f"{API}/admin/agencies/{agc.id}/suspend",
        headers=bearer(login(api, "admin@example.com")),
        json={"reason": "Complaints received"},
    )

    [(status,)] = run_sql("SELECT status::text FROM proposals WHERE id = :p", p=uuid.UUID(proposal_id))
    assert status == "withdrawn"


def test_mark_paid_needs_a_hold(api: TestClient) -> None:
    flow = placed(api)

    with pytest.raises(IllegalTransition):
        mark_paid(flow.placement_id)


def test_events_record_the_actor(api: TestClient) -> None:
    flow = placed(api)
    api.post(f"{API}/placements/{flow.placement_id}/end", headers=flow.agency.headers, json=REASON)

    detail = api.get(f"{API}/placements/{flow.placement_id}", headers=flow.family).json()

    assert [e["actor"] for e in detail["events"]] == ["family", "system", "agency"]
    assert detail["events"][-1]["reason"] == REASON["reason"]
    assert datetime.fromisoformat(detail["events"][-1]["at"]) <= datetime.now(UTC)
