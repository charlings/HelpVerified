"""Multi-step flows for B4 tests: a family with a request, an agency proposing, accepting, paying."""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.core.clock import utcnow
from app.core.config import load_settings
from app.core.dates import lagos_date
from app.modules.placements.service import PlacementService
from tests.conftest import helper_sessions, run_async
from tests.factories import create_agency, listed_worker
from tests.fakes import FakePayments
from tests.helpers import API, bearer, create_user, login


def request_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "role": "nanny",
        "schedule": "full_time",
        "live_in": False,
        "state": "Lagos",
        "lga": "Ikeja",
        "start_date": (lagos_date(utcnow()) + timedelta(days=7)).isoformat(),
        "trial_days": 14,
        "title": "Nanny for twins",
        "description": "Two-year-old twins, weekdays, calm and experienced please.",
        "budget_min_kobo": 8_000_000,
        "budget_max_kobo": 12_000_000,
    }
    return body | overrides


def family(api: TestClient, email: str = "ada@example.com") -> dict[str, str]:
    create_user(email, role="family")
    return bearer(login(api, email))


def post_request(api: TestClient, headers: dict[str, str], **overrides: Any) -> str:
    response = api.post(f"{API}/requests", headers=headers, json=request_body(**overrides))
    assert response.status_code == 201, response.text
    request_id: str = response.json()["id"]
    return request_id


@dataclass
class Agency:
    id: uuid.UUID
    headers: dict[str, str]


def agency(api: TestClient, email: str = "agency@example.com", **kwargs: Any) -> Agency:
    agency_id = create_agency(admin_email=email, **kwargs)
    return Agency(agency_id, bearer(login(api, email)))


def propose(api: TestClient, agency_: Agency, request_id: str, worker_id: uuid.UUID | str) -> str:
    response = api.post(
        f"{API}/requests/{request_id}/proposals", headers=agency_.headers, json={"worker_id": str(worker_id)}
    )
    assert response.status_code == 201, response.text
    proposal_id: str = response.json()["id"]
    return proposal_id


def accept(api: TestClient, headers: dict[str, str], proposal_id: str) -> dict[str, Any]:
    response = api.post(f"{API}/proposals/{proposal_id}/accept", headers=headers)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


async def _start_trial(placement_id: uuid.UUID) -> None:
    async with helper_sessions()() as session:
        await PlacementService(session, load_settings(), FakePayments()).start_trial(placement_id)


async def _expire_holds() -> int:
    async with helper_sessions()() as session:
        return await PlacementService(session, load_settings(), FakePayments()).expire_holds()


def expire_holds() -> int:
    """What B6's every-minute job will do."""
    return run_async(_expire_holds())


def mark_paid(placement_id: str) -> None:
    """What B5's verified Paystack webhook will do: pending_payment → trial."""
    run_async(_start_trial(uuid.UUID(placement_id)))


@dataclass
class Placed:
    family: dict[str, str]
    agency: Agency
    worker_id: uuid.UUID
    request_id: str
    proposal_id: str
    placement_id: str


def placed(api: TestClient, *, paid: bool = True, family_email: str = "ada@example.com") -> Placed:
    """A family whose accepted placement is on trial (or awaiting payment, with paid=False)."""
    fam = family(api, family_email)
    agc = agency(api, f"agency-for-{family_email}")
    worker = listed_worker(agc.id)
    request_id = post_request(api, fam)
    proposal_id = propose(api, agc, request_id, worker)
    placement_id: str = accept(api, fam, proposal_id)["placement"]["id"]
    if paid:
        mark_paid(placement_id)
    return Placed(fam, agc, worker, request_id, proposal_id, placement_id)
