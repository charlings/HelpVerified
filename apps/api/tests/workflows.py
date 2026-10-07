"""Multi-step API flows used by many tests: add a worker, upload evidence, verify checks."""

from typing import Any

from fastapi.testclient import TestClient

from app.modules.verification.models import KINDS
from tests.factories import next_nin
from tests.fakes import FakeCloudinary
from tests.helpers import API


def worker_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "full_name": "Amaka Obi",
        "role": "nanny",
        "years_experience": 6,
        "languages": ["English", "Igbo"],
        "live_in_ok": True,
        "state": "Lagos",
        "lga": "Ikeja",
        "expected_salary_min_kobo": 8_000_000,
        "expected_salary_max_kobo": 12_000_000,
        "nin": next_nin(),
        "consent": True,
    }
    return body | overrides


def add_worker(api: TestClient, headers: dict[str, str], **overrides: Any) -> str:
    response = api.post(f"{API}/workers", headers=headers, json=worker_body(**overrides))
    assert response.status_code == 201, response.text
    worker_id: str = response.json()["id"]
    return worker_id


def upload_document(
    api: TestClient,
    headers: dict[str, str],
    cloudinary: FakeCloudinary,
    worker_id: str,
    kind: str,
    *,
    fmt: str = "pdf",
    size: int = 180_000,
) -> dict[str, Any]:
    """Signature → (fake) Cloudinary upload → register with the API."""
    signed = api.post(
        f"{API}/uploads/signature",
        headers=headers,
        json={"purpose": "verification_doc", "worker_id": worker_id, "kind": kind},
    )
    assert signed.status_code == 200, signed.text
    public_id = cloudinary.upload(signed.json()["folder"], signed.json()["type"], fmt=fmt, size=size)
    response = api.post(
        f"{API}/workers/{worker_id}/verification/{kind}/documents",
        headers=headers,
        json={"public_id": public_id},
    )
    assert response.status_code == 201, response.text
    document: dict[str, Any] = response.json()
    return document


def verify_check(
    api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary, worker_id: str, kind: str
) -> None:
    upload_document(api, headers, cloudinary, worker_id, kind)
    response = api.patch(
        f"{API}/workers/{worker_id}/verification/{kind}", headers=headers, json={"status": "verified"}
    )
    assert response.status_code == 200, response.text


def verify_all(api: TestClient, headers: dict[str, str], cloudinary: FakeCloudinary, worker_id: str) -> None:
    for kind in KINDS:
        verify_check(api, headers, cloudinary, worker_id, kind.value)
