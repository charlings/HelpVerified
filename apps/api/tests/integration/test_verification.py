"""The four checks: details, verify, reject, evidence and uploads (api-contracts.md verification rules)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.integrations.cloudinary import sign
from tests.conftest import run_sql
from tests.factories import create_agency
from tests.fakes import FakeCloudinary
from tests.helpers import API, bearer, error_code, login
from tests.workflows import add_worker, upload_document, verify_check


@pytest.fixture
def headers(api: TestClient) -> dict[str, str]:
    create_agency(admin_email="boss@example.com")
    return bearer(login(api, "boss@example.com"))


def check(api: TestClient, headers: dict[str, str], worker_id: str, kind: str) -> dict[str, object]:
    items = api.get(f"{API}/workers/{worker_id}/verification", headers=headers).json()
    found: dict[str, object] = next(i for i in items if i["kind"] == kind)
    return found


def test_checks_come_in_fixed_order(api: TestClient, headers: dict[str, str]) -> None:
    worker_id = add_worker(api, headers)

    items = api.get(f"{API}/workers/{worker_id}/verification", headers=headers).json()

    assert [i["kind"] for i in items] == ["id", "guarantor", "references", "address"]
    assert all(i["status"] == "not_started" and i["documents"] == [] for i in items)


def test_details_put_a_check_in_review(api: TestClient, headers: dict[str, str]) -> None:
    worker_id = add_worker(api, headers)

    response = api.patch(
        f"{API}/workers/{worker_id}/verification/guarantor",
        headers=headers,
        json={"details": {"name": "Mrs Okeke", "phone": "08031234567", "relationship": "Former employer"}},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "submitted"
    assert response.json()["details"]["name"] == "Mrs Okeke"


def test_verifying_needs_a_check_in_review_with_evidence(api: TestClient, headers: dict[str, str]) -> None:
    worker_id = add_worker(api, headers)
    path = f"{API}/workers/{worker_id}/verification/id"

    not_started = api.patch(path, headers=headers, json={"status": "verified"})
    api.patch(path, headers=headers, json={"details": {"document_type": "NIN slip"}})
    no_evidence = api.patch(path, headers=headers, json={"status": "verified"})

    assert error_code(not_started) == "ILLEGAL_TRANSITION"
    assert no_evidence.status_code == 409
    assert error_code(no_evidence) == "EVIDENCE_REQUIRED"


def test_verified_checks_record_who_and_when_and_expire_by_kind(
    api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, headers)
    for kind in ("id", "references"):
        verify_check(api, headers, cloudinary, worker_id, kind)

    id_check = check(api, headers, worker_id, "id")
    references = check(api, headers, worker_id, "references")

    assert id_check["status"] == "verified"
    assert id_check["verified_at"] is not None
    assert id_check["expires_at"] is None  # ID doesn't expire
    expires = datetime.fromisoformat(str(references["expires_at"]))
    assert timedelta(days=360) < expires - datetime.now(UTC) < timedelta(days=370)  # 12 months
    [(verified_by,)] = run_sql("SELECT count(*) FROM verification_items WHERE verified_by IS NOT NULL")
    assert verified_by == 2


def test_rejecting_needs_a_reason_and_a_reviewable_check(api: TestClient, headers: dict[str, str]) -> None:
    worker_id = add_worker(api, headers)
    path = f"{API}/workers/{worker_id}/verification/address"

    no_reason = api.patch(path, headers=headers, json={"status": "rejected"})
    not_started = api.patch(
        path, headers=headers, json={"status": "rejected", "rejection_reason": "Wrong house"}
    )

    assert no_reason.status_code == 422
    assert "rejection_reason" in no_reason.json()["error"]["details"]["fields"]
    assert error_code(not_started) == "ILLEGAL_TRANSITION"


def test_verified_details_are_locked_until_rejected(
    api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, headers)
    verify_check(api, headers, cloudinary, worker_id, "id")

    response = api.patch(
        f"{API}/workers/{worker_id}/verification/id",
        headers=headers,
        json={"details": {"document_type": "Passport"}},
    )

    assert error_code(response) == "ILLEGAL_TRANSITION"


def test_new_evidence_reopens_a_rejected_check(
    api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, headers)
    verify_check(api, headers, cloudinary, worker_id, "address")
    api.patch(
        f"{API}/workers/{worker_id}/verification/address",
        headers=headers,
        json={"status": "rejected", "rejection_reason": "Utility bill too old"},
    )

    upload_document(api, headers, cloudinary, worker_id, "address")

    reopened = check(api, headers, worker_id, "address")
    assert reopened["status"] == "submitted"
    assert reopened["rejection_reason"] is None


def test_body_must_be_details_or_a_decision(api: TestClient, headers: dict[str, str]) -> None:
    worker_id = add_worker(api, headers)

    response = api.patch(f"{API}/workers/{worker_id}/verification/id", headers=headers, json={})

    assert response.status_code == 400
    assert error_code(response) == "BAD_REQUEST"


# Uploads


def test_upload_signature_is_for_one_authenticated_folder(
    api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, headers)

    doc = api.post(
        f"{API}/uploads/signature",
        headers=headers,
        json={"purpose": "verification_doc", "worker_id": worker_id, "kind": "guarantor"},
    ).json()
    photo = api.post(
        f"{API}/uploads/signature", headers=headers, json={"purpose": "worker_photo", "worker_id": worker_id}
    ).json()
    no_kind = api.post(
        f"{API}/uploads/signature",
        headers=headers,
        json={"purpose": "verification_doc", "worker_id": worker_id},
    )

    assert doc["folder"] == f"workers/docs/{worker_id}/guarantor"
    assert doc["type"] == "authenticated"
    assert doc["signature"] == sign(
        {"folder": doc["folder"], "timestamp": doc["timestamp"], "type": "authenticated"},
        cloudinary.api_secret,
    )
    assert "api_secret" not in doc
    assert photo["folder"] == f"workers/photos/{worker_id}"
    assert photo["type"] == "upload"
    assert "kind" in no_kind.json()["error"]["details"]["fields"]


@pytest.mark.parametrize(
    ("folder_kind", "delivery", "fmt", "size", "message"),
    [
        ("guarantor", "authenticated", "pdf", 1000, "Upload the file again."),  # another check's folder
        ("id", "upload", "pdf", 1000, "Upload the file again."),  # public, not authenticated
        ("id", "authenticated", "docx", 1000, "Use a JPG, PNG or PDF up to 10 MB."),
        ("id", "authenticated", "pdf", 10 * 1024 * 1024 + 1, "Use a JPG, PNG or PDF up to 10 MB."),
    ],
)
def test_registering_rejects_files_cloudinary_doesnt_vouch_for(
    api: TestClient,
    headers: dict[str, str],
    cloudinary: FakeCloudinary,
    folder_kind: str,
    delivery: str,
    fmt: str,
    size: int,
    message: str,
) -> None:
    worker_id = add_worker(api, headers)
    public_id = cloudinary.upload(f"workers/docs/{worker_id}/{folder_kind}", delivery, fmt=fmt, size=size)

    response = api.post(
        f"{API}/workers/{worker_id}/verification/id/documents", headers=headers, json={"public_id": public_id}
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"]["fields"]["public_id"] == [message]


def test_unknown_upload_is_rejected(api: TestClient, headers: dict[str, str]) -> None:
    worker_id = add_worker(api, headers)

    response = api.post(
        f"{API}/workers/{worker_id}/verification/id/documents",
        headers=headers,
        json={"public_id": f"workers/docs/{worker_id}/id/never-uploaded"},
    )

    assert response.json()["error"]["details"]["fields"]["public_id"] == ["Upload the file again."]


def test_documents_are_described_by_metadata_only(
    api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary
) -> None:
    worker_id = add_worker(api, headers)
    created = upload_document(api, headers, cloudinary, worker_id, "id", fmt="png", size=2048)

    documents = check(api, headers, worker_id, "id")["documents"]
    assert isinstance(documents, list)
    [listed] = documents

    assert set(created) == {"id", "format", "bytes", "created_at"}
    assert listed == created
    assert created["format"] == "png"
    assert "workers/docs" not in str(
        api.get(f"{API}/workers/{worker_id}/verification", headers=headers).json()
    )


def test_removing_a_document(api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary) -> None:
    worker_id = add_worker(api, headers)
    doc = upload_document(api, headers, cloudinary, worker_id, "id")
    path = f"{API}/workers/{worker_id}/verification/id/documents/{doc['id']}"

    first = api.delete(path, headers=headers)
    second = api.delete(path, headers=headers)
    elsewhere = api.delete(
        f"{API}/workers/{worker_id}/verification/address/documents/{uuid.uuid4()}", headers=headers
    )

    assert first.status_code == 204
    assert second.status_code == 404
    assert elsewhere.status_code == 404
    assert check(api, headers, worker_id, "id")["documents"] == []
    [(deleted_at,)] = run_sql("SELECT deleted_at FROM verification_documents")
    assert deleted_at is not None  # soft delete: kept for audit, Cloudinary cleanup is a later job
