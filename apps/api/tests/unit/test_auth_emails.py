"""Auth email links point at pages the web app actually has."""

from pathlib import Path

from app.modules.auth import emails

WEB_ROUTES = Path(__file__).parents[4] / "apps" / "web" / "src" / "config" / "routes.ts"


def test_link_paths_exist_in_the_web_routes() -> None:
    routes = WEB_ROUTES.read_text(encoding="utf-8")

    assert f'verifyEmail: "{emails.VERIFY_EMAIL_PATH}"' in routes
    assert f'reset: "{emails.RESET_PASSWORD_PATH}"' in routes


def test_verify_email_message() -> None:
    message = emails.verify_email("ada@example.com", "Ada", "http://localhost:3000/", "tok-123", 24)

    assert message.to == "ada@example.com"
    assert message.link == "http://localhost:3000/verify-email?token=tok-123"
    assert message.link in message.text
    assert "24 hours" in message.text


def test_reset_password_message() -> None:
    message = emails.reset_password("ada@example.com", "Ada", "http://localhost:3000", "tok-456", 60)

    assert message.link == "http://localhost:3000/reset-password?token=tok-456"
    assert "60 minutes" in message.text
