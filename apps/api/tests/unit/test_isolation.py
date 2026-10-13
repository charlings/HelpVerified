"""Tests never reach the owner's live SMTP relay or Firestore project, whatever apps/api/.env says."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import load_settings
from app.integrations.email import OutboxEmailSender, SmtpEmailSender, email_sender_from
from app.integrations.firestore import mirror_from

LIVE_ENV_FILE = """\
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_USERNAME=someone
SMTP_PASSWORD=not-a-real-password
NOTIFICATIONS_MIRROR=firestore
FIREBASE_PROJECT_ID=not-a-real-project
FIREBASE_CREDENTIALS_FILE=C:/nowhere/key.json
"""


def test_a_live_env_file_does_not_switch_tests_to_live_services(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / ".env").write_text(LIVE_ENV_FILE, encoding="utf-8")
    monkeypatch.chdir(tmp_path)  # settings read `.env` from the working directory
    settings = load_settings()
    assert settings.EMAIL_PROVIDER == "outbox"
    assert settings.NOTIFICATIONS_MIRROR == "none"
    assert isinstance(email_sender_from(settings), OutboxEmailSender)
    assert mirror_from(settings) is None


def test_an_app_built_without_fakes_uses_the_outbox_and_no_mirror(client: TestClient) -> None:
    state = client.app.state  # type: ignore[attr-defined]
    assert not isinstance(state.email_sender, SmtpEmailSender)
    assert state.notifications.mirror is None
