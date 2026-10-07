"""Document viewing (spec item 20): owning agency and super admins only, every view logged, short-lived URLs,
families never."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import run_sql
from tests.factories import create_agency
from tests.fakes import FAKE_DOWNLOAD_HOST, FakeCloudinary
from tests.helpers import API, bearer, create_user, error_code, login
from tests.workflows import add_worker, upload_document


@pytest.fixture
def document_id(api: TestClient, cloudinary: FakeCloudinary) -> str:
    create_agency(admin_email="owner@example.com")
    headers = bearer(login(api, "owner@example.com"))
    worker_id = add_worker(api, headers, full_name="Amaka Obi")
    doc_id: str = upload_document(api, headers, cloudinary, worker_id, "guarantor")["id"]
    return doc_id


def access_rows() -> int:
    [(count,)] = run_sql("SELECT count(*) FROM document_access_log")
    return int(str(count))


def test_owning_agency_gets_a_short_lived_url_and_the_view_is_logged(
    api: TestClient, document_id: str, capsys: pytest.CaptureFixture[str]
) -> None:
    response = api.get(f"{API}/documents/{document_id}/url", headers=bearer(login(api, "owner@example.com")))

    assert response.status_code == 200
    body = response.json()
    assert body["url"].startswith(FAKE_DOWNLOAD_HOST)
    expires = datetime.fromisoformat(body["expires_at"])
    assert timedelta(minutes=4) < expires - datetime.now(UTC) <= timedelta(minutes=5)
    assert access_rows() == 1
    [(action, label, purpose)] = run_sql(
        "SELECT a.action, a.data->>'label', l.purpose FROM audit_log a, document_access_log l"
    )
    assert action == "document.viewed"
    assert label == "Amaka Obi, guarantor evidence"
    assert purpose == "verification_review"
    assert body["url"] not in capsys.readouterr().out  # URLs are never logged
    assert run_sql(
        "SELECT count(*) FROM verification_documents WHERE cloudinary_public_id LIKE '%download%'"
    ) == [(0,)]


def test_super_admin_can_view_and_is_logged(api: TestClient, document_id: str) -> None:
    create_user("admin@example.com", role="super_admin")

    response = api.get(f"{API}/documents/{document_id}/url", headers=bearer(login(api, "admin@example.com")))

    assert response.status_code == 200
    assert access_rows() == 1


@pytest.mark.parametrize("who", ["family", "other_agency"])
def test_everyone_else_gets_404_and_nothing_is_logged(api: TestClient, document_id: str, who: str) -> None:
    if who == "family":
        create_user("someone@example.com", role="family")
    else:
        create_agency(admin_email="someone@example.com")

    response = api.get(
        f"{API}/documents/{document_id}/url", headers=bearer(login(api, "someone@example.com"))
    )

    assert response.status_code == 404
    assert error_code(response) == "NOT_FOUND"
    assert access_rows() == 0


def test_removed_documents_cannot_be_viewed(api: TestClient, document_id: str) -> None:
    run_sql("UPDATE verification_documents SET deleted_at = now()")

    response = api.get(f"{API}/documents/{document_id}/url", headers=bearer(login(api, "owner@example.com")))

    assert response.status_code == 404


def test_document_url_needs_a_token(api: TestClient, document_id: str) -> None:
    assert error_code(api.get(f"{API}/documents/{document_id}/url")) == "UNAUTHENTICATED"
