"""Every error path returns the envelope with a request_id (spec requirement 4)."""

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.core.errors import DomainError, NotFound, WorkerUnavailable


class Probe(BaseModel):
    email: str
    age: int = Field(ge=18)


@pytest.fixture
def probe_client(app: FastAPI) -> TestClient:
    """The real app plus routes that fail in each way."""

    @app.get("/_probe/domain/{kind}")
    async def raise_domain(kind: str) -> None:
        errors: dict[str, DomainError] = {
            "not_found": NotFound(),
            "unavailable": WorkerUnavailable(details={"worker_id": "w1"}),
        }
        raise errors[kind]

    @app.get("/_probe/crash")
    async def crash() -> None:
        raise RuntimeError("secret internal detail")

    @app.post("/_probe/validate")
    async def validate(body: Probe) -> Probe:
        return body

    return TestClient(app, raise_server_exceptions=False)


def assert_envelope(body: dict[str, Any], code: str) -> dict[str, Any]:
    assert set(body) == {"error"}
    error: dict[str, Any] = body["error"]
    assert set(error) == {"code", "message", "details", "request_id"}
    assert error["code"] == code
    assert error["message"]
    assert error["request_id"]
    return error


@pytest.mark.parametrize(
    ("method", "path", "kwargs", "status", "code"),
    [
        ("get", "/_probe/domain/not_found", {}, 404, "NOT_FOUND"),
        ("get", "/_probe/domain/unavailable", {}, 409, "WORKER_UNAVAILABLE"),
        ("get", "/no/such/route", {}, 404, "NOT_FOUND"),
        ("delete", "/health", {}, 405, "BAD_REQUEST"),
        ("post", "/_probe/validate", {"json": {"age": 3}}, 422, "VALIDATION_ERROR"),
        (
            "post",
            "/_probe/validate",
            {"content": b"{not json", "headers": {"content-type": "application/json"}},
            422,
            "VALIDATION_ERROR",
        ),
        ("post", "/_probe/validate", {"content": b"x" * 1_048_577}, 413, "BAD_REQUEST"),
        ("get", "/_probe/crash", {}, 500, "INTERNAL_ERROR"),
    ],
)
def test_error_paths_return_the_envelope(
    probe_client: TestClient, method: str, path: str, kwargs: dict[str, Any], status: int, code: str
) -> None:
    response = probe_client.request(method, path, **kwargs)

    assert response.status_code == status
    error = assert_envelope(response.json(), code)
    assert response.headers["x-request-id"] == error["request_id"]


def test_domain_error_details_are_returned(probe_client: TestClient) -> None:
    error = assert_envelope(probe_client.get("/_probe/domain/unavailable").json(), "WORKER_UNAVAILABLE")

    assert error["details"] == {"worker_id": "w1"}


def test_validation_error_lists_fields(probe_client: TestClient) -> None:
    error = assert_envelope(probe_client.post("/_probe/validate", json={"age": 3}).json(), "VALIDATION_ERROR")

    assert set(error["details"]["fields"]) == {"email", "age"}
    assert all(isinstance(messages, list) and messages for messages in error["details"]["fields"].values())


def test_unhandled_error_is_generic(probe_client: TestClient, capsys: pytest.CaptureFixture[str]) -> None:
    response = probe_client.get("/_probe/crash")

    assert "secret internal detail" not in response.text
    # ...but the stack trace is logged, tagged with the request ID.
    logged = capsys.readouterr().out
    assert "secret internal detail" in logged
    assert response.json()["error"]["request_id"] in logged


def test_request_id_is_taken_from_the_caller(client: TestClient) -> None:
    response = client.get("/no/such/route", headers={"X-Request-ID": "trace-abc.123"})

    assert response.headers["x-request-id"] == "trace-abc.123"
    assert response.json()["error"]["request_id"] == "trace-abc.123"


def test_malformed_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "bad id\twith spaces"})

    assert response.headers["x-request-id"] != "bad id\twith spaces"
    assert len(response.headers["x-request-id"]) == 32


def test_access_log_is_json_with_request_id(client: TestClient, capsys: pytest.CaptureFixture[str]) -> None:
    client.get("/health", headers={"X-Request-ID": "log-check"})

    lines = [line for line in capsys.readouterr().out.splitlines() if '"request"' in line]
    assert any('"request_id": "log-check"' in line and '"status": 200' in line for line in lines)
