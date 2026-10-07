"""Rule 1 through the API (spec acceptance items 7 and 8): the listing service refuses first with
409 WORKER_NOT_VERIFIED; rejecting a verified check delists the worker."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.modules.verification.models import KINDS
from tests.conftest import run_sql
from tests.factories import create_agency
from tests.fakes import FakeCloudinary
from tests.helpers import API, bearer, error_code, login
from tests.workflows import add_worker, verify_all, verify_check

AGENCY_ADMIN = "agency@example.com"


@pytest.fixture
def agency_headers(api: TestClient) -> dict[str, str]:
    create_agency(admin_email=AGENCY_ADMIN)
    return bearer(login(api, AGENCY_ADMIN))


def worker_status(api: TestClient, headers: dict[str, str], worker_id: str) -> str:
    status: str = api.get(f"{API}/workers/{worker_id}", headers=headers).json()["listing_status"]
    return status


@pytest.mark.parametrize("pending", [k.value for k in KINDS])
def test_cannot_list_with_pending_item(
    api: TestClient, agency_headers: dict[str, str], cloudinary: FakeCloudinary, pending: str
) -> None:
    worker_id = add_worker(api, agency_headers)
    for kind in KINDS:
        if kind.value != pending:
            verify_check(api, agency_headers, cloudinary, worker_id, kind.value)

    response = api.post(f"{API}/workers/{worker_id}/list", headers=agency_headers)

    assert response.status_code == 409
    assert error_code(response) == "WORKER_NOT_VERIFIED"
    assert worker_status(api, agency_headers, worker_id) == "draft"


def test_four_verified_checks_list_the_worker(
    api: TestClient, agency_headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, agency_headers)
    verify_all(api, agency_headers, cloudinary, worker_id)

    response = api.post(f"{API}/workers/{worker_id}/list", headers=agency_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["listing_status"] == "listed"
    assert body["listed_at"] is not None
    assert body["verified_count"] == 4


def test_expired_check_blocks_listing_even_before_the_job_runs(
    api: TestClient, agency_headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, agency_headers)
    verify_all(api, agency_headers, cloudinary, worker_id)
    run_sql(
        "UPDATE verification_items SET expires_at = now() - interval '1 minute' "
        "WHERE worker_id = :w AND kind = 'references'",
        w=uuid.UUID(worker_id),
    )

    response = api.post(f"{API}/workers/{worker_id}/list", headers=agency_headers)

    assert error_code(response) == "WORKER_NOT_VERIFIED"


def test_rejecting_item_delists_worker(
    api: TestClient, agency_headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, agency_headers)
    verify_all(api, agency_headers, cloudinary, worker_id)
    api.post(f"{API}/workers/{worker_id}/list", headers=agency_headers)

    response = api.patch(
        f"{API}/workers/{worker_id}/verification/guarantor",
        headers=agency_headers,
        json={"status": "rejected", "rejection_reason": "Guarantor withdrew"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert worker_status(api, agency_headers, worker_id) == "delisted"
    # Placements arrive in B4; that the active placement continues is tested there.


def test_removing_evidence_from_a_verified_check_delists(
    api: TestClient, agency_headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, agency_headers)
    verify_all(api, agency_headers, cloudinary, worker_id)
    api.post(f"{API}/workers/{worker_id}/list", headers=agency_headers)
    [doc] = api.get(f"{API}/workers/{worker_id}/verification", headers=agency_headers).json()[0]["documents"]

    removed = api.delete(
        f"{API}/workers/{worker_id}/verification/id/documents/{doc['id']}", headers=agency_headers
    )

    assert removed.status_code == 204
    item = api.get(f"{API}/workers/{worker_id}/verification", headers=agency_headers).json()[0]
    assert item["status"] == "submitted"
    assert worker_status(api, agency_headers, worker_id) == "delisted"


def test_unapproved_or_unsubscribed_agency_cannot_list(api: TestClient, cloudinary: FakeCloudinary) -> None:
    create_agency(admin_email="pending@example.com", status="pending")
    create_agency(admin_email="unpaid@example.com", subscribed=False)

    for email in ("pending@example.com", "unpaid@example.com"):
        headers = bearer(login(api, email))
        worker_id = add_worker(api, headers)
        verify_all(api, headers, cloudinary, worker_id)

        response = api.post(f"{API}/workers/{worker_id}/list", headers=headers)

        assert response.status_code == 403
        assert error_code(response) == "AGENCY_NOT_ACTIVE"
