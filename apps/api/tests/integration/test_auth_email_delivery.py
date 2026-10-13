"""Auth emails go out after the response, say nothing about whether an account exists, never leak into
the logs when the provider fails, and a reset is followed by a "password changed" notice."""

import json
from typing import Any

import anyio
import pytest
from fastapi.testclient import TestClient
from starlette.types import ASGIApp, Message

from app.integrations.email import EmailMessage
from tests.fakes import MemoryEmailSender
from tests.helpers import API, PASSWORD, create_user, login, signup_body

NEW_PASSWORD = "a brand new phrase"


async def _post_raw(app: ASGIApp, path: str, body: dict[str, Any], events: list[str]) -> int:
    """Calls the app as an ASGI server would, recording when the response finished."""
    payload = json.dumps(body).encode()
    scope: dict[str, Any] = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"testserver"), (b"content-type", b"application/json")],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }
    status = 0
    delivered = False

    async def receive() -> Message:
        nonlocal delivered
        if not delivered:
            delivered = True
            return {"type": "http.request", "body": payload, "more_body": False}
        await anyio.sleep_forever()  # the client stays connected
        raise AssertionError("unreachable")

    async def send(message: Message) -> None:
        nonlocal status
        if message["type"] == "http.response.start":
            status = message["status"]
        elif message["type"] == "http.response.body" and not message.get("more_body", False):
            events.append("response")

    with anyio.fail_after(30):
        await app(scope, receive, send)
    return status


def _record_sends(monkeypatch: pytest.MonkeyPatch, outbox: MemoryEmailSender, events: list[str]) -> None:
    original = outbox.send

    async def send(message: EmailMessage) -> None:
        events.append(f"email:{message.kind}")
        await original(message)

    monkeypatch.setattr(outbox, "send", send)


@pytest.mark.parametrize(
    ("path", "body", "status", "kind"),
    [
        ("/auth/forgot-password", {"email": "ada@example.com"}, 202, "reset_password"),
        ("/auth/resend-verification", {"email": "ada@example.com"}, 202, "verify_email"),
        ("/auth/signup", signup_body("new@example.com"), 201, "verify_email"),
    ],
)
def test_the_email_is_sent_after_the_response(
    api: TestClient,
    outbox: MemoryEmailSender,
    monkeypatch: pytest.MonkeyPatch,
    path: str,
    body: dict[str, Any],
    status: int,
    kind: str,
) -> None:
    create_user("ada@example.com", verified=False)
    events: list[str] = []
    _record_sends(monkeypatch, outbox, events)
    assert api.portal is not None

    async def post() -> int:
        return await _post_raw(api.app, f"{API}{path}", body, events)

    code = api.portal.call(post)

    assert code == status
    assert events == ["response", f"email:{kind}"]


@pytest.mark.parametrize("path", ["/auth/forgot-password", "/auth/resend-verification"])
def test_known_and_unknown_emails_get_the_same_response(
    api: TestClient, outbox: MemoryEmailSender, path: str
) -> None:
    create_user("ada@example.com", verified=False)

    known = api.post(f"{API}{path}", json={"email": "ada@example.com"})
    unknown = api.post(f"{API}{path}", json={"email": "nobody@example.com"})

    assert known.status_code == unknown.status_code == 202
    assert known.content == unknown.content == b""
    assert dict(known.headers).keys() == dict(unknown.headers).keys()
    assert [m.to for m in outbox.sent] == ["ada@example.com"]


def test_a_provider_failure_logs_only_the_error_type(
    api: TestClient, outbox: MemoryEmailSender, capsys: pytest.CaptureFixture[str]
) -> None:
    create_user("ada@example.com")
    outbox.down = True

    signup = api.post(f"{API}/auth/signup", json=signup_body("grace@example.com"))
    forgot = api.post(f"{API}/auth/forgot-password", json={"email": "ada@example.com"})

    assert signup.status_code == 201
    assert forgot.status_code == 202
    failures = [
        json.loads(line) for line in capsys.readouterr().out.splitlines() if '"email.send_failed"' in line
    ]
    assert [f["kind"] for f in failures] == ["verify_email", "reset_password"]
    for failure in failures:
        assert failure["error"] == "ConnectionError"
        assert set(failure) <= {"event", "kind", "error", "level", "timestamp", "request_id", "logger"}
        assert "exception" not in failure
        text = json.dumps(failure)
        for leak in ("ada@example.com", "grace@example.com", "token", "http", "Ada"):
            assert leak not in text


def test_a_reset_is_followed_by_a_password_changed_notice(api: TestClient, outbox: MemoryEmailSender) -> None:
    create_user("ada@example.com")
    api.post(f"{API}/auth/forgot-password", json={"email": "ada@example.com"})
    token = outbox.token("reset_password")

    response = api.post(f"{API}/auth/reset-password", json={"token": token, "password": NEW_PASSWORD})

    assert response.status_code == 204
    notice = outbox.last("password_changed", "ada@example.com")
    assert notice.subject == "Your password was changed"
    assert notice.link == "http://localhost:3000/forgot-password"
    for secret in (token, NEW_PASSWORD, PASSWORD, "token="):
        assert secret not in notice.text
        assert secret not in (notice.link or "")
    assert login(api, password=NEW_PASSWORD)


def test_a_failed_reset_sends_no_notice(api: TestClient, outbox: MemoryEmailSender) -> None:
    create_user("ada@example.com")

    response = api.post(f"{API}/auth/reset-password", json={"token": "not-a-token", "password": NEW_PASSWORD})

    assert response.status_code == 410
    assert outbox.sent == []
