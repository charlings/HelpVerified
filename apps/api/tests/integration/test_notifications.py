"""The notification feed (B6, ADR 0015): written with the event, delivered after commit to email and the
Firestore mirror, retried on failure, and a delivery failure never undoes the event (milestone criterion)."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import time_machine
from fastapi.testclient import TestClient

from tests.conftest import ApiFactory, deliver, run_sql
from tests.factories import listed_worker
from tests.fakes import FakeMirror, FakePaystack, MemoryEmailSender
from tests.helpers import API, bearer, create_user, error_code, login, set_status
from tests.placement_flows import accept, agency, family, placed, post_request, propose

FAMILY_EMAIL = "ada@example.com"
AGENCY_EMAIL = "agency@example.com"


def feed(api: TestClient, headers: dict[str, str], **params: Any) -> dict[str, Any]:
    response = api.get(f"{API}/notifications", headers=headers, params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def items(api: TestClient, headers: dict[str, str]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = feed(api, headers)["items"]
    return found


def proposal_flow(api: TestClient) -> tuple[dict[str, str], str, str]:
    """A family's request and one proposal for it; returns the family's headers, request and proposal."""
    fam = family(api, FAMILY_EMAIL)
    agc = agency(api, AGENCY_EMAIL)
    request_id = post_request(api, fam)
    proposal_id = propose(api, agc, request_id, listed_worker(agc.id))
    return fam, request_id, proposal_id


def delivery_row(kind: str) -> tuple[object, ...]:
    [row] = run_sql(
        "SELECT attempts, next_attempt_at, emailed_at, mirrored_at, last_error FROM notifications "
        "WHERE kind = :k",
        k=kind,
    )
    return row


# The feed


def test_a_proposal_reaches_the_family_in_the_feed(api: TestClient) -> None:
    fam, request_id, _ = proposal_flow(api)

    body = feed(api, fam)

    assert body["total"] == 1
    assert body["unread"] == 1
    [item] = body["items"]
    assert item["kind"] == "proposal_received"
    assert item["title"] == "New proposal for your request"
    assert "Sunrise Domestic Staffing has proposed Amaka Obi" in item["body"]
    assert item["link"] == f"/family/requests/{request_id}"
    assert item["read"] is False


def test_marking_read(api: TestClient) -> None:
    fam, _, _ = proposal_flow(api)
    [item] = items(api, fam)

    response = api.post(f"{API}/notifications/{item['id']}/read", headers=fam)

    assert response.status_code == 200
    assert response.json()["read"] is True
    assert feed(api, fam)["unread"] == 0
    assert feed(api, fam, unread_only=True)["items"] == []


def test_mark_all_read(api: TestClient) -> None:
    fam, _, _ = proposal_flow(api)

    response = api.post(f"{API}/notifications/read-all", headers=fam)

    assert response.json() == {"updated": 1}
    assert feed(api, fam)["unread"] == 0


def test_someone_elses_notification_is_not_found(api: TestClient) -> None:
    fam, _, _ = proposal_flow(api)
    [item] = items(api, fam)
    create_user("other@example.com")
    other = bearer(login(api, "other@example.com"))

    response = api.post(f"{API}/notifications/{item['id']}/read", headers=other)

    assert response.status_code == 404
    assert error_code(response) == "NOT_FOUND"
    assert items(api, other) == []


def test_the_feed_needs_a_signed_in_user(api: TestClient) -> None:
    assert api.get(f"{API}/notifications").status_code == 401


def test_newest_first_and_paged(api: TestClient) -> None:
    fam, request_id, _ = proposal_flow(api)
    second_agency = agency(api, "kano@example.com", name="Kano Helpers")
    propose(api, second_agency, request_id, listed_worker(second_agency.id, full_name="Bola Ade"))

    body = feed(api, fam, page=1, page_size=1)

    assert body["total"] == 2
    [newest] = body["items"]
    assert "Kano Helpers" in newest["body"]


# Who hears what


def test_placement_events_notify_the_other_side(api: TestClient, paystack: FakePaystack) -> None:
    flow = placed(api, paid=False)
    agency_kinds = [i["kind"] for i in items(api, flow.agency.headers)]
    assert agency_kinds == ["proposal_accepted"]

    api.post(
        f"{API}/placements/{flow.placement_id}/cancel",
        headers=flow.family,
        json={"reason": "Changed our plans"},
    )

    agency_items = items(api, flow.agency.headers)
    assert agency_items[0]["kind"] == "hold_released"
    assert agency_items[0]["link"] == f"/agency/placements/{flow.placement_id}"
    # The family acted, so it isn't told about its own cancellation.
    assert [i["kind"] for i in items(api, flow.family)] == ["proposal_received"]


def test_trial_start_confirm_and_end(api: TestClient) -> None:
    flow = placed(api)  # paid: the trial has started
    assert items(api, flow.family)[0]["kind"] == "trial_started"
    assert items(api, flow.agency.headers)[0]["kind"] == "trial_started"

    api.post(f"{API}/placements/{flow.placement_id}/confirm", headers=flow.family)
    assert items(api, flow.agency.headers)[0]["kind"] == "placement_confirmed"

    api.post(
        f"{API}/placements/{flow.placement_id}/end",
        headers=flow.agency.headers,
        json={"reason": "Contract over"},
    )
    ended = items(api, flow.family)[0]
    assert ended["kind"] == "placement_ended"
    assert "ended by the agency" in str(ended["body"])
    assert items(api, flow.agency.headers)[0]["kind"] == "placement_confirmed"  # not told of its own end


def test_replacement_tells_the_agency(api: TestClient) -> None:
    flow = placed(api)

    response = api.post(
        f"{API}/placements/{flow.placement_id}/replacement", headers=flow.family, json={"reason": "Not a fit"}
    )

    assert response.status_code == 200, response.text
    assert items(api, flow.agency.headers)[0]["kind"] == "replacement_requested"


def test_agency_moves_tell_the_agency(api: TestClient) -> None:
    agc = agency(api, AGENCY_EMAIL, status="pending", subscribed=False)
    create_user("admin@example.com", role="super_admin")
    admin = bearer(login(api, "admin@example.com"))

    api.post(f"{API}/admin/agencies/{agc.id}/approve", headers=admin, json={})
    api.post(f"{API}/admin/agencies/{agc.id}/suspend", headers=admin, json={"reason": "Complaints received"})

    suspended, approved = items(api, agc.headers)
    assert approved["title"] == "Your agency is approved"
    assert suspended["kind"] == "agency_suspended"
    assert "Reason: Complaints received" in str(suspended["body"])


def test_a_flagged_check_tells_the_agency(api: TestClient) -> None:
    agc = agency(api, AGENCY_EMAIL)
    worker = listed_worker(agc.id)
    create_user("admin@example.com", role="super_admin")
    admin = bearer(login(api, "admin@example.com"))

    response = api.post(
        f"{API}/admin/workers/{worker}/flag",
        headers=admin,
        json={"kind": "guarantor", "reason": "The guarantor's phone number doesn't answer."},
    )

    assert response.status_code == 200, response.text
    [item] = items(api, agc.headers)
    assert item["title"] == "Amaka Obi's guarantor check needs review"
    assert item["link"] == f"/agency/workers/{worker}"


# Delivery


def test_delivery_emails_and_mirrors_after_commit(
    api: TestClient, outbox: MemoryEmailSender, mirror: FakeMirror
) -> None:
    _, request_id, _ = proposal_flow(api)
    assert outbox.to(FAMILY_EMAIL) == []  # nothing is sent inside the request (tests deliver explicitly)

    assert deliver(api) == 1

    [email] = outbox.to(FAMILY_EMAIL)
    assert email.subject == "New proposal for your request"
    assert email.link == f"http://localhost:3000/family/requests/{request_id}"
    assert "Hello Test User" in email.text
    [document] = mirror.documents.values()
    assert document.kind == "proposal_received"
    assert document.read is False
    attempts, next_attempt_at, emailed_at, mirrored_at, last_error = delivery_row("proposal_received")
    assert (attempts, next_attempt_at, last_error) == (1, None, None)
    assert emailed_at is not None
    assert mirrored_at is not None
    assert deliver(api) == 0  # nothing left: never sent twice


def test_reading_updates_the_mirror(api: TestClient, mirror: FakeMirror) -> None:
    fam, _, _ = proposal_flow(api)
    deliver(api)
    [item] = items(api, fam)

    api.post(f"{API}/notifications/{item['id']}/read", headers=fam)
    deliver(api)

    [document] = mirror.documents.values()
    assert document.read is True
    assert mirror.writes == 2


def test_firestore_down_never_undoes_the_event(
    api: TestClient, mirror: FakeMirror, outbox: MemoryEmailSender
) -> None:
    """Milestone criterion: a Firestore failure doesn't roll back business state."""
    mirror.down = True
    fam, _, proposal_id = proposal_flow(api)

    deliver(api)

    [(status,)] = run_sql("SELECT status::text FROM proposals WHERE id = :p", p=uuid.UUID(proposal_id))
    assert status == "pending"  # the proposal stands
    assert len(items(api, fam)) == 1  # and the feed has it
    assert len(outbox.to(FAMILY_EMAIL)) == 1  # the email went anyway
    attempts, next_attempt_at, emailed_at, mirrored_at, last_error = delivery_row("proposal_received")
    assert attempts == 1
    assert last_error == "MirrorError"
    assert mirrored_at is None
    assert next_attempt_at is not None
    assert emailed_at is not None

    mirror.down = False
    deliver(api)  # not due yet: the retry waits (backoff)
    assert mirror.documents == {}
    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=3), tick=False):
        deliver(api)

    assert len(mirror.documents) == 1
    assert len(outbox.to(FAMILY_EMAIL)) == 1  # the retry didn't email again
    assert delivery_row("proposal_received")[1] is None


def test_email_down_is_retried(api: TestClient, outbox: MemoryEmailSender) -> None:
    outbox.down = True
    proposal_flow(api)
    deliver(api)
    assert delivery_row("proposal_received")[4] == "ConnectionError"

    outbox.down = False
    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=3), tick=False):
        deliver(api)

    assert len(outbox.to(FAMILY_EMAIL)) == 1


def test_delivery_gives_up_after_the_last_attempt(make_api: ApiFactory, outbox: MemoryEmailSender) -> None:
    api = make_api(NOTIFICATION_MAX_ATTEMPTS=2)
    outbox.down = True
    proposal_flow(api)

    deliver(api)
    with time_machine.travel(datetime.now(UTC) + timedelta(minutes=10), tick=False):
        deliver(api)
    with time_machine.travel(datetime.now(UTC) + timedelta(hours=7), tick=False):
        assert deliver(api) == 0  # given up: not claimed again

    attempts, next_attempt_at, emailed_at, _, last_error = delivery_row("proposal_received")
    assert (attempts, next_attempt_at, emailed_at, last_error) == (2, None, None, "ConnectionError")


def test_suspended_accounts_are_not_emailed(api: TestClient, outbox: MemoryEmailSender) -> None:
    proposal_flow(api)
    [(user_id,)] = run_sql("SELECT id FROM users WHERE email = :e", e=FAMILY_EMAIL)
    set_status(user_id, "suspended")  # type: ignore[arg-type]

    deliver(api)

    assert outbox.to(FAMILY_EMAIL) == []
    assert delivery_row("proposal_received")[1] is None  # done: nothing left to try


def test_in_app_only_notifications_are_not_emailed(api: TestClient, outbox: MemoryEmailSender) -> None:
    flow = placed(api, paid=False)
    api.post(
        f"{API}/placements/{flow.placement_id}/cancel",
        headers=flow.family,
        json={"reason": "Changed our plans"},
    )

    deliver(api)

    kinds = [m.kind for m in outbox.sent]
    assert "hold_released" not in kinds
    assert "proposal_accepted" in kinds


def test_the_dispatcher_delivers_after_the_request(make_api: ApiFactory, outbox: MemoryEmailSender) -> None:
    """With immediate delivery on (as in production), the email goes without anyone calling deliver."""
    api = make_api()
    api.app.state.notifications.immediate = True  # type: ignore[attr-defined]
    fam = family(api, FAMILY_EMAIL)
    agc = agency(api, AGENCY_EMAIL)
    request_id = post_request(api, fam)

    propose(api, agc, request_id, listed_worker(agc.id))

    for _ in range(100):  # the background task runs on the app's loop
        if outbox.to(FAMILY_EMAIL):
            break
        assert api.portal is not None
        api.portal.call(_sleep)
    assert [m.kind for m in outbox.to(FAMILY_EMAIL)] == ["proposal_received"]


async def _sleep() -> None:
    await asyncio.sleep(0.05)


def test_accept_and_pay_through_paystack_notifies_both(api: TestClient, paystack: FakePaystack) -> None:
    fam = family(api, FAMILY_EMAIL)
    agc = agency(api, AGENCY_EMAIL)
    request_id = post_request(api, fam)
    proposal_id = propose(api, agc, request_id, listed_worker(agc.id))
    accept(api, fam, proposal_id)
    [reference] = paystack.transactions
    paystack.pay(reference)

    api.get(f"{API}/payments/{reference}/verify", headers=fam)

    assert items(api, fam)[0]["title"] == "Payment received: the trial has started"
    assert items(api, agc.headers)[0]["title"] == "Placement fee paid: the trial has started"
