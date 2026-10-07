"""Super-admin moderation: agency moves and their effects, worker flags, the audit log, and role checks."""

import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.factories import create_agency, create_worker, set_items
from tests.fakes import FakeCloudinary
from tests.helpers import API, bearer, create_user, error_code, login
from tests.workflows import add_worker, verify_all


@pytest.fixture
def admin(api: TestClient) -> dict[str, str]:
    create_user("admin@example.com", role="super_admin")
    return bearer(login(api, "admin@example.com"))


def listing(worker_id: uuid.UUID | str) -> str:
    [(status,)] = run_sql(
        "SELECT listing_status::text FROM workers WHERE id = :id", id=uuid.UUID(str(worker_id))
    )
    return str(status)


def test_agency_list_puts_pending_first(api: TestClient, admin: dict[str, str]) -> None:
    create_agency(name="Approved One")
    create_agency(name="Waiting", status="pending")

    body = api.get(f"{API}/admin/agencies", headers=admin).json()
    pending_only = api.get(f"{API}/admin/agencies?status=pending", headers=admin).json()

    assert [a["name"] for a in body["items"]] == ["Waiting", "Approved One"]
    assert body["total"] == 2
    assert pending_only["total"] == 1


def test_approve_records_who_and_writes_the_audit_log(api: TestClient, admin: dict[str, str]) -> None:
    agency_id = create_agency(admin_email="boss@example.com", status="pending")

    response = api.post(f"{API}/admin/agencies/{agency_id}/approve", headers=admin, json={})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["approved_at"] is not None
    assert body["allowed_actions"] == ["suspend"]
    assert body["admin"] == {"full_name": "Test User", "email": "boss@example.com"}
    assert [h["action"] for h in body["history"]] == ["agency.approved"]
    assert body["history"][0]["actor"]["role"] == "super_admin"


def test_reject_and_suspend_need_a_reason_the_agency_sees(api: TestClient, admin: dict[str, str]) -> None:
    agency_id = create_agency(admin_email="boss@example.com", status="pending")

    missing = api.post(f"{API}/admin/agencies/{agency_id}/reject", headers=admin, json={"reason": "no"})
    rejected = api.post(
        f"{API}/admin/agencies/{agency_id}/reject", headers=admin, json={"reason": "CAC number doesn't match"}
    )
    again = api.post(f"{API}/admin/agencies/{agency_id}/approve", headers=admin, json={})

    assert missing.status_code == 422
    assert "reason" in missing.json()["error"]["details"]["fields"]
    assert rejected.json()["status_reason"] == "CAC number doesn't match"
    assert rejected.json()["allowed_actions"] == []  # rejected is final
    assert error_code(again) == "ILLEGAL_TRANSITION"
    dashboard = api.get(f"{API}/agencies/me/dashboard", headers=bearer(login(api, "boss@example.com"))).json()
    assert dashboard["agency"]["status_reason"] == "CAC number doesn't match"


def test_suspending_takes_listed_workers_off_and_reinstating_needs_relisting(
    api: TestClient, admin: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    agency_id = create_agency(admin_email="boss@example.com")
    boss = bearer(login(api, "boss@example.com"))
    listed = add_worker(api, boss)
    verify_all(api, boss, cloudinary, listed)
    api.post(f"{API}/workers/{listed}/list", headers=boss)
    draft = add_worker(api, boss)

    suspended = api.post(
        f"{API}/admin/agencies/{agency_id}/suspend", headers=admin, json={"reason": "Complaints"}
    )

    assert suspended.json()["workers"]["suspended"] == 1
    assert (listing(listed), listing(draft)) == ("suspended", "draft")
    assert error_code(api.post(f"{API}/workers/{listed}/list", headers=boss)) == "AGENCY_NOT_ACTIVE"

    api.post(f"{API}/admin/agencies/{agency_id}/reinstate", headers=admin, json={})

    assert listing(listed) == "delisted"
    assert api.post(f"{API}/workers/{listed}/list", headers=boss).json()["listing_status"] == "listed"


def test_unknown_agency_or_action_is_404(api: TestClient, admin: dict[str, str]) -> None:
    agency_id = create_agency()

    assert api.post(f"{API}/admin/agencies/{uuid.uuid4()}/approve", headers=admin, json={}).status_code == 404
    assert api.post(f"{API}/admin/agencies/{agency_id}/delete", headers=admin, json={}).status_code == 404


def test_flagging_sends_a_verified_check_back_and_delists(
    api: TestClient, admin: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    create_agency(admin_email="boss@example.com")
    boss = bearer(login(api, "boss@example.com"))
    worker_id = add_worker(api, boss, full_name="Bola Ade")
    verify_all(api, boss, cloudinary, worker_id)
    api.post(f"{API}/workers/{worker_id}/list", headers=boss)

    response = api.post(
        f"{API}/admin/workers/{worker_id}/flag",
        headers=admin,
        json={"kind": "references", "reason": "Referee unreachable"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["listing_status"] == "delisted"
    references = next(c for c in body["checks"] if c["kind"] == "references")
    assert references["status"] == "submitted"
    assert references["flag_reason"] == "Referee unreachable"
    assert body["agency"]["id"]
    [(action, reason)] = run_sql("SELECT action, data->>'reason' FROM audit_log")
    assert (action, reason) == ("worker.check_flagged", "Referee unreachable")
    # The agency sees the flag, and re-verifying clears it.
    api.patch(f"{API}/workers/{worker_id}/verification/references", headers=boss, json={"status": "verified"})
    agency_view = api.get(f"{API}/workers/{worker_id}/verification", headers=boss).json()
    assert next(c for c in agency_view if c["kind"] == "references")["flag_reason"] is None


def test_only_verified_checks_can_be_flagged(api: TestClient, admin: dict[str, str]) -> None:
    worker_id = create_worker(create_agency())

    not_verified = api.post(
        f"{API}/admin/workers/{worker_id}/flag", headers=admin, json={"kind": "id", "reason": "Looks altered"}
    )
    short = api.post(
        f"{API}/admin/workers/{worker_id}/flag", headers=admin, json={"kind": "id", "reason": "bad"}
    )

    assert error_code(not_verified) == "ILLEGAL_TRANSITION"
    assert short.status_code == 422


def test_admin_worker_views(api: TestClient, admin: dict[str, str]) -> None:
    agency_id = create_agency(name="Kano Helpers")
    worker_id = create_worker(agency_id, full_name="Zainab Musa", role="cleaner")
    set_items(worker_id, "verified")
    create_worker(create_agency(name="Other"), full_name="Adaeze Obi")

    listed = api.get(f"{API}/admin/workers?role=cleaner", headers=admin).json()
    detail = api.get(f"{API}/admin/workers/{worker_id}", headers=admin).json()
    by_agency = api.get(f"{API}/admin/workers?agency_id={agency_id}", headers=admin).json()

    assert [w["full_name"] for w in api.get(f"{API}/admin/workers", headers=admin).json()["items"]] == [
        "Adaeze Obi",
        "Zainab Musa",
    ]
    assert listed["total"] == 1
    assert listed["items"][0]["agency"]["name"] == "Kano Helpers"
    assert by_agency["total"] == 1
    assert [c["status"] for c in detail["checks"]] == ["verified"] * 4
    assert detail["verified_count"] == 4


def test_audit_log_lists_newest_first_and_filters(api: TestClient, admin: dict[str, str]) -> None:
    first = create_agency(status="pending", name="First")
    second = create_agency(status="pending", name="Second")
    api.post(f"{API}/admin/agencies/{first}/approve", headers=admin, json={})
    api.post(f"{API}/admin/agencies/{second}/reject", headers=admin, json={"reason": "Not registered"})

    everything = api.get(f"{API}/admin/audit-log", headers=admin).json()
    rejections = api.get(f"{API}/admin/audit-log?action=agency.rejected", headers=admin).json()

    assert [e["entity_label"] for e in everything["items"]] == ["Second", "First"]
    assert rejections["total"] == 1
    assert rejections["items"][0]["reason"] == "Not registered"


ADMIN_ROUTES = [
    ("get", "/admin/agencies"),
    ("get", f"/admin/agencies/{uuid.uuid4()}"),
    ("post", f"/admin/agencies/{uuid.uuid4()}/approve"),
    ("get", "/admin/workers"),
    ("get", f"/admin/workers/{uuid.uuid4()}"),
    ("post", f"/admin/workers/{uuid.uuid4()}/flag"),
    ("get", "/admin/audit-log"),
]


@pytest.mark.parametrize(("method", "path"), ADMIN_ROUTES)
def test_admin_routes_are_403_for_other_roles_and_401_without_a_token(
    api: TestClient, method: str, path: str
) -> None:
    create_user("family@example.com", role="family")
    create_agency(admin_email="boss@example.com")
    body = {"kind": "id", "reason": "Looks altered"}

    assert error_code(api.request(method, f"{API}{path}", json=body)) == "UNAUTHENTICATED"
    for email in ("family@example.com", "boss@example.com"):
        response = api.request(method, f"{API}{path}", headers=bearer(login(api, email)), json=body)
        assert response.status_code == 403, (email, path)
        assert error_code(response) == "FORBIDDEN"
