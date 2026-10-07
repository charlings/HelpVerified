"""Agency onboarding, profile and dashboard."""

from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.factories import create_agency
from tests.fakes import FakeCloudinary
from tests.helpers import API, bearer, create_user, error_code, login
from tests.workflows import add_worker, upload_document


def agency_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "Sunrise Domestic Staffing",
        "cac_number": "rc1234567",
        "email": "office@sunrise.example",
        "phone": "0803 123 4567",
        "address_line": "12 Allen Avenue",
        "state": "Lagos",
        "lga": "Ikeja",
        "roles_offered": ["nanny", "driver", "nanny"],
    }
    return body | overrides


def test_onboarding_registers_a_pending_agency(api: TestClient) -> None:
    create_user("boss@example.com", role="agency_admin")
    headers = bearer(login(api, "boss@example.com"))

    response = api.post(f"{API}/agencies", headers=headers, json=agency_body())

    assert response.status_code == 201
    assert response.json() | {"id": None} == {
        "id": None,
        "name": "Sunrise Domestic Staffing",
        "status": "pending",
    }
    profile = api.get(f"{API}/agencies/me", headers=headers).json()
    assert profile["cac_number"] == "RC 1234567"  # normalised
    assert profile["phone"] == "08031234567"
    assert profile["roles_offered"] == ["nanny", "driver"]  # duplicates dropped
    me = api.get(f"{API}/me", headers=headers).json()
    assert me["agency"] == {
        "id": response.json()["id"],
        "name": "Sunrise Domestic Staffing",
        "status": "pending",
    }


def test_onboarding_needs_a_verified_agency_admin(api: TestClient) -> None:
    create_user("new@example.com", role="agency_admin", verified=False)
    create_user("family@example.com", role="family")

    unverified = api.post(
        f"{API}/agencies", headers=bearer(login(api, "new@example.com")), json=agency_body()
    )
    family = api.post(f"{API}/agencies", headers=bearer(login(api, "family@example.com")), json=agency_body())

    assert error_code(unverified) == "EMAIL_NOT_VERIFIED"
    assert family.status_code == 403
    assert error_code(family) == "FORBIDDEN"


def test_onboarding_happens_once(api: TestClient) -> None:
    create_agency(admin_email="boss@example.com")

    response = api.post(f"{API}/agencies", headers=bearer(login(api, "boss@example.com")), json=agency_body())

    assert response.status_code == 409
    assert error_code(response) == "AGENCY_EXISTS"


def test_cac_number_is_unique_whatever_the_spacing(api: TestClient) -> None:
    create_user("one@example.com", role="agency_admin")
    create_user("two@example.com", role="agency_admin")
    api.post(f"{API}/agencies", headers=bearer(login(api, "one@example.com")), json=agency_body())

    response = api.post(
        f"{API}/agencies",
        headers=bearer(login(api, "two@example.com")),
        json=agency_body(cac_number="RC 1234567"),
    )

    assert response.status_code == 422
    assert "cac_number" in response.json()["error"]["details"]["fields"]


def test_onboarding_validates_fields(api: TestClient) -> None:
    create_user("boss@example.com", role="agency_admin")

    response = api.post(
        f"{API}/agencies",
        headers=bearer(login(api, "boss@example.com")),
        json=agency_body(cac_number="12345", phone="123", state="Atlantis", roles_offered=[]),
    )

    assert response.status_code == 422
    assert set(response.json()["error"]["details"]["fields"]) == {
        "cac_number",
        "phone",
        "state",
        "roles_offered",
    }


def test_agency_routes_need_a_registered_agency(api: TestClient) -> None:
    create_user("boss@example.com", role="agency_admin")
    headers = bearer(login(api, "boss@example.com"))

    for path in ("/agencies/me", "/agencies/me/dashboard", "/workers"):
        response = api.get(f"{API}{path}", headers=headers)
        assert response.status_code == 403, path
        assert error_code(response) == "FORBIDDEN"


def test_patch_agency_changes_contact_details_only(api: TestClient) -> None:
    create_agency(admin_email="boss@example.com")
    headers = bearer(login(api, "boss@example.com"))

    updated = api.patch(
        f"{API}/agencies/me", headers=headers, json={"phone": "0701 234 5678", "lga": "Surulere"}
    )
    renamed = api.patch(f"{API}/agencies/me", headers=headers, json={"name": "Another Name"})

    assert updated.status_code == 200
    assert updated.json()["phone"] == "07012345678"
    assert updated.json()["lga"] == "Surulere"
    assert renamed.status_code == 422


def test_dashboard_counts(api: TestClient, cloudinary: FakeCloudinary) -> None:
    create_agency(admin_email="boss@example.com")
    headers = bearer(login(api, "boss@example.com"))
    worker_id = add_worker(api, headers)
    add_worker(api, headers)
    upload_document(api, headers, cloudinary, worker_id, "id")  # puts one check in review

    response = api.get(f"{API}/agencies/me/dashboard", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["active"] is True
    assert body["agency"]["status"] == "approved"
    assert body["subscription"]["status"] == "active"
    assert body["workers"] == {"total": 2, "draft": 2, "listed": 0, "delisted": 0, "suspended": 0}
    assert body["checks_needing_attention"] == 1
    assert body["open_requests"] == 0
    assert body["trials_ending"] == []


def test_dashboard_shows_why_an_agency_is_inactive(api: TestClient) -> None:
    agency_id = create_agency(admin_email="boss@example.com", status="suspended", subscribed=False)
    run_sql("UPDATE agencies SET status_reason = 'Documents expired' WHERE id = :id", id=agency_id)

    body = api.get(f"{API}/agencies/me/dashboard", headers=bearer(login(api, "boss@example.com"))).json()

    assert body["active"] is False
    assert body["subscription"] is None
    assert body["agency"]["status_reason"] == "Documents expired"
