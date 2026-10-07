"""Family requests and agency proposals (api-contracts.md §3; rules from the web mock)."""

import uuid
from datetime import timedelta

from fastapi.testclient import TestClient
from httpx import Response

from app.core.clock import utcnow
from app.core.dates import lagos_date
from tests.conftest import run_sql
from tests.factories import create_worker, listed_worker
from tests.helpers import API, bearer, create_user, error_code, login
from tests.placement_flows import accept, agency, family, post_request, propose, request_body

# Requests


def test_first_request_creates_the_family(api: TestClient) -> None:
    create_user("ada.okafor@example.com", role="family")
    headers = bearer(login(api, "ada.okafor@example.com"))
    assert api.get(f"{API}/families/me", headers=headers).json() is None

    response = api.post(f"{API}/requests", headers=headers, json=request_body())

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "open"
    assert body["proposals_count"] == 0
    assert body["placement_id"] is None
    assert api.get(f"{API}/families/me", headers=headers).json()["name"] == "User family"


def test_requests_need_a_verified_family(api: TestClient) -> None:
    create_user("new@example.com", role="family", verified=False)
    agc = agency(api)

    unverified = api.post(
        f"{API}/requests", headers=bearer(login(api, "new@example.com")), json=request_body()
    )
    agency_call = api.post(f"{API}/requests", headers=agc.headers, json=request_body())

    assert error_code(unverified) == "EMAIL_NOT_VERIFIED"
    assert agency_call.status_code == 403


def test_request_validation(api: TestClient) -> None:
    headers = family(api)
    yesterday = (lagos_date(utcnow()) - timedelta(days=1)).isoformat()

    past = api.post(f"{API}/requests", headers=headers, json=request_body(start_date=yesterday))
    bad = api.post(
        f"{API}/requests",
        headers=headers,
        json=request_body(trial_days=6, title="Hi", budget_min_kobo=500, budget_max_kobo=100, state="Mars"),
    )

    assert past.json()["error"]["details"]["fields"] == {
        "start_date": ["The start date can't be in the past."]
    }
    assert set(bad.json()["error"]["details"]["fields"]) == {
        "trial_days",
        "title",
        "budget_max_kobo",
        "state",
    }


def test_families_see_only_their_own_requests(api: TestClient) -> None:
    mine = family(api, "mine@example.com")
    theirs = family(api, "theirs@example.com")
    request_id = post_request(api, theirs)

    assert api.get(f"{API}/requests", headers=mine).json()["total"] == 0
    assert api.get(f"{API}/requests/{request_id}", headers=mine).status_code == 404
    assert api.post(f"{API}/requests/{request_id}/cancel", headers=mine).status_code == 404


def test_cancelling_declines_pending_proposals(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    request_id = post_request(api, fam)
    proposal_id = propose(api, agc, request_id, listed_worker(agc.id))

    cancelled = api.post(f"{API}/requests/{request_id}/cancel", headers=fam)
    again = api.post(f"{API}/requests/{request_id}/cancel", headers=fam)

    assert cancelled.json()["status"] == "cancelled"
    assert error_code(again) == "REQUEST_NOT_OPEN"
    [(status,)] = run_sql("SELECT status::text FROM proposals WHERE id = :p", p=uuid.UUID(proposal_id))
    assert status == "declined"


def test_agencies_see_open_requests_for_their_roles_and_state(api: TestClient) -> None:
    fam = family(api)
    nanny_lagos = post_request(api, fam)
    post_request(api, fam, role="driver")
    post_request(api, fam, state="Kano")
    agc = agency(api, roles=("nanny", "cleaner"))

    listed = api.get(f"{API}/requests", headers=agc.headers).json()

    assert [r["id"] for r in listed["items"]] == [nanny_lagos]
    assert listed["items"][0]["my_proposals"] == 0
    dashboard = api.get(f"{API}/agencies/me/dashboard", headers=agc.headers).json()
    assert dashboard["open_requests"] == 1


def test_agencies_cant_see_other_requests(api: TestClient) -> None:
    kano = post_request(api, family(api), state="Kano")
    agc = agency(api)

    assert api.get(f"{API}/requests/{kano}", headers=agc.headers).status_code == 404
    assert api.get(f"{API}/requests/{kano}/proposals", headers=agc.headers).status_code == 404


# Proposals


def test_propose_and_the_family_sees_a_public_profile_only(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    request_id = post_request(api, fam)
    worker = listed_worker(agc.id, full_name="Amaka Grace Obi")

    proposal_id = propose(api, agc, request_id, worker)

    [seen] = api.get(f"{API}/requests/{request_id}/proposals", headers=fam).json()
    assert seen["id"] == proposal_id
    profile = seen["worker"]
    assert profile["first_name"] == "Amaka"
    assert "full_name" not in profile
    assert "nin_last4" not in profile
    assert len(profile["badges"]) == 4
    assert profile["available"] is True
    assert api.get(f"{API}/workers/{worker}/public", headers=fam).json() == profile
    assert api.get(f"{API}/requests/{request_id}", headers=fam).json()["pending_proposals"] == 1


def test_proposing_checks_in_order(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    request_id = post_request(api, fam)
    other = agency(api, "other@example.com")

    draft = create_worker(agc.id)
    driver = listed_worker(agc.id, role="driver")
    others_worker = listed_worker(other.id)
    lapsed = listed_worker(agc.id)
    run_sql(
        "UPDATE verification_items SET expires_at = now() - interval '1 minute' "
        "WHERE worker_id = :w AND kind = 'address'",
        w=lapsed,
    )

    def attempt(worker_id: uuid.UUID) -> Response:
        response: Response = api.post(
            f"{API}/requests/{request_id}/proposals", headers=agc.headers, json={"worker_id": str(worker_id)}
        )
        return response

    assert error_code(attempt(draft)) == "WORKER_NOT_LISTED"
    assert error_code(attempt(lapsed)) == "WORKER_NOT_LISTED"  # rule 1, before the expiry job runs
    assert attempt(driver).json()["error"]["details"]["fields"]["worker_id"] == [
        "This request is for a nanny."
    ]
    assert "worker_id" in attempt(others_worker).json()["error"]["details"]["fields"]


def test_inactive_agencies_cant_propose(api: TestClient) -> None:
    request_id = post_request(api, family(api))
    agc = agency(api, subscribed=False)

    response = api.post(
        f"{API}/requests/{request_id}/proposals",
        headers=agc.headers,
        json={"worker_id": str(listed_worker(agc.id))},
    )

    assert error_code(response) == "AGENCY_NOT_ACTIVE"


def test_a_placed_worker_cant_be_proposed_again(api: TestClient) -> None:
    first_family = family(api, "first@example.com")
    agc = agency(api)
    worker = listed_worker(agc.id)
    accept(api, first_family, propose(api, agc, post_request(api, first_family), worker))
    second_request = post_request(api, family(api, "second@example.com"))

    response = api.post(
        f"{API}/requests/{second_request}/proposals", headers=agc.headers, json={"worker_id": str(worker)}
    )

    assert error_code(response) == "WORKER_UNAVAILABLE"


def test_duplicate_withdraw_and_repropose(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    request_id = post_request(api, fam)
    worker = listed_worker(agc.id)
    proposal_id = propose(api, agc, request_id, worker)

    duplicate = api.post(
        f"{API}/requests/{request_id}/proposals", headers=agc.headers, json={"worker_id": str(worker)}
    )
    withdrawn = api.post(f"{API}/proposals/{proposal_id}/withdraw", headers=agc.headers)
    hidden = api.get(f"{API}/requests/{request_id}/proposals", headers=fam).json()
    again = propose(api, agc, request_id, worker)

    assert error_code(duplicate) == "ALREADY_PROPOSED"
    assert withdrawn.json()["status"] == "withdrawn"
    assert hidden == []  # families don't see withdrawn proposals
    assert again == proposal_id  # the same proposal, pending again
    assert api.get(f"{API}/requests/{request_id}/proposals", headers=fam).json()[0]["status"] == "pending"


def test_agencies_only_see_their_own_proposals(api: TestClient) -> None:
    fam = family(api)
    request_id = post_request(api, fam)
    one = agency(api, "one@example.com")
    two = agency(api, "two@example.com")
    propose(api, one, request_id, listed_worker(one.id))
    propose(api, two, request_id, listed_worker(two.id))

    seen_by_one = api.get(f"{API}/requests/{request_id}/proposals", headers=one.headers).json()

    assert len(seen_by_one) == 1
    assert len(api.get(f"{API}/requests/{request_id}/proposals", headers=fam).json()) == 2


def test_decline_and_withdraw_need_a_pending_proposal(api: TestClient) -> None:
    fam = family(api)
    agc = agency(api)
    proposal_id = propose(api, agc, post_request(api, fam), listed_worker(agc.id))

    declined = api.post(f"{API}/proposals/{proposal_id}/decline", headers=fam)
    withdraw = api.post(f"{API}/proposals/{proposal_id}/withdraw", headers=agc.headers)

    assert declined.json()["status"] == "declined"
    assert error_code(withdraw) == "ILLEGAL_TRANSITION"


def test_worker_public_profile_is_for_families_who_were_proposed_the_worker(api: TestClient) -> None:
    fam = family(api, "proposed@example.com")
    stranger = family(api, "stranger@example.com")
    agc = agency(api)
    worker = listed_worker(agc.id)
    propose(api, agc, post_request(api, fam), worker)

    assert api.get(f"{API}/workers/{worker}/public", headers=fam).status_code == 200
    assert api.get(f"{API}/workers/{worker}/public", headers=stranger).status_code == 404
    assert api.get(f"{API}/workers/{worker}/public", headers=agc.headers).status_code == 403
