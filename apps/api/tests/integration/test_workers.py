"""Workers: creation (NIN privacy, consent, duplicates), reading, editing and tenant isolation."""

import uuid

from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.factories import create_agency, create_worker
from tests.helpers import API, bearer, create_user, error_code, login
from tests.workflows import add_worker, worker_body


def agency_login(api: TestClient, email: str = "boss@example.com") -> dict[str, str]:
    create_agency(admin_email=email)
    return bearer(login(api, email))


def test_create_worker_returns_a_draft_with_four_checks(api: TestClient) -> None:
    headers = agency_login(api)

    response = api.post(f"{API}/workers", headers=headers, json=worker_body(nin="12345678901"))

    assert response.status_code == 201
    body = response.json()
    assert body["listing_status"] == "draft"
    assert body["nin_last4"] == "8901"
    assert body["verification"] == {k: "not_started" for k in ("id", "guarantor", "references", "address")}
    assert body["verified_count"] == 0
    assert body["available"] is True
    assert "nin" not in body
    assert "nin_hash" not in body


def test_the_raw_nin_is_never_stored(api: TestClient) -> None:
    headers = agency_login(api)
    api.post(f"{API}/workers", headers=headers, json=worker_body(nin="12345678901"))

    [(nin_hash, last4, consent_at)] = run_sql("SELECT nin_hash, nin_last4, consent_at FROM workers")
    dump = run_sql("SELECT row_to_json(w)::text FROM workers w")

    assert "12345678901" not in str(dump)
    assert isinstance(nin_hash, str)
    assert len(nin_hash) == 64
    assert last4 == "8901"
    assert consent_at is not None


def test_duplicate_nin_is_rejected_across_agencies(api: TestClient) -> None:
    first = agency_login(api, "one@example.com")
    second = agency_login(api, "two@example.com")
    api.post(f"{API}/workers", headers=first, json=worker_body(nin="12345678901"))

    response = api.post(f"{API}/workers", headers=second, json=worker_body(nin="12345678901"))

    assert response.status_code == 409
    assert error_code(response) == "DUPLICATE_WORKER"


def test_creating_a_worker_needs_consent_and_a_valid_nin(api: TestClient) -> None:
    headers = agency_login(api)

    no_consent = api.post(f"{API}/workers", headers=headers, json=worker_body(consent=False))
    bad = api.post(
        f"{API}/workers",
        headers=headers,
        json=worker_body(
            nin="1234", years_experience=70, expected_salary_min_kobo=500, expected_salary_max_kobo=100
        ),
    )

    assert no_consent.status_code == 422
    assert "consent" in no_consent.json()["error"]["details"]["fields"]
    fields = bad.json()["error"]["details"]["fields"]
    assert set(fields) == {"nin", "years_experience", "expected_salary_max_kobo"}
    assert "1234" not in bad.text  # the NIN isn't echoed back


def test_list_filters_and_paginates(api: TestClient) -> None:
    headers = agency_login(api)
    for role in ("nanny", "driver", "driver"):
        add_worker(api, headers, role=role)

    drivers = api.get(f"{API}/workers?role=driver", headers=headers).json()
    page = api.get(f"{API}/workers?page=2&page_size=2", headers=headers).json()

    assert drivers["total"] == 2
    assert {w["role"] for w in drivers["items"]} == {"driver"}
    assert page["page"] == 2
    assert page["total"] == 3
    assert len(page["items"]) == 1


def test_another_agencys_worker_is_not_found(api: TestClient) -> None:
    mine = agency_login(api, "one@example.com")
    other_agency = create_agency(admin_email="two@example.com")
    theirs = str(create_worker(other_agency))

    for method, path, body in [
        ("get", f"/workers/{theirs}", None),
        ("patch", f"/workers/{theirs}", {"bio": "x"}),
        ("post", f"/workers/{theirs}/list", None),
        ("post", f"/workers/{theirs}/delist", None),
        ("get", f"/workers/{theirs}/verification", None),
        ("patch", f"/workers/{theirs}/verification/id", {"details": {"document_type": "NIN slip"}}),
        ("post", "/uploads/signature", {"purpose": "verification_doc", "worker_id": theirs, "kind": "id"}),
        (
            "post",
            f"/workers/{theirs}/verification/id/documents",
            {"public_id": f"workers/docs/{theirs}/id/x"},
        ),
    ]:
        response = api.request(method, f"{API}{path}", headers=mine, json=body)
        assert response.status_code == 404, path
        assert error_code(response) == "NOT_FOUND"
    assert api.get(f"{API}/workers", headers=mine).json()["total"] == 0


def test_worker_routes_are_for_agency_admins(api: TestClient) -> None:
    create_user("family@example.com", role="family")
    create_user("admin@example.com", role="super_admin")

    assert error_code(api.get(f"{API}/workers")) == "UNAUTHENTICATED"
    for email in ("family@example.com", "admin@example.com"):
        response = api.get(f"{API}/workers", headers=bearer(login(api, email)))
        assert response.status_code == 403
        assert error_code(response) == "FORBIDDEN"


def test_patch_worker_profile(api: TestClient) -> None:
    headers = agency_login(api)
    worker_id = add_worker(api, headers, expected_salary_min_kobo=None, expected_salary_max_kobo=None)

    updated = api.patch(
        f"{API}/workers/{worker_id}",
        headers=headers,
        json={"years_experience": 7, "bio": "Calm with toddlers."},
    )
    bad_range = api.patch(
        f"{API}/workers/{worker_id}",
        headers=headers,
        json={"expected_salary_min_kobo": 9_000_000, "expected_salary_max_kobo": 1_000_000},
    )
    nin = api.patch(f"{API}/workers/{worker_id}", headers=headers, json={"nin": "99999999999"})

    assert updated.json()["years_experience"] == 7
    assert updated.json()["bio"] == "Calm with toddlers."
    assert bad_range.status_code == 422
    assert nin.status_code == 422  # the NIN can't be changed


def test_delist_needs_a_listed_worker(api: TestClient) -> None:
    headers = agency_login(api)
    worker_id = add_worker(api, headers)

    response = api.post(f"{API}/workers/{worker_id}/delist", headers=headers)

    assert response.status_code == 409
    assert error_code(response) == "ILLEGAL_TRANSITION"


def test_unknown_worker_is_not_found(api: TestClient) -> None:
    headers = agency_login(api)

    assert api.get(f"{API}/workers/{uuid.uuid4()}", headers=headers).status_code == 404
