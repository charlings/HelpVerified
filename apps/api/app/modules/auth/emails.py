"""Auth emails. Links point at the web app's pages (apps/web/src/config/routes.ts: auth.verifyEmail,
auth.reset); tests/unit/test_auth_emails.py checks the paths still exist there."""

from urllib.parse import urlencode

from app.integrations.email import EmailMessage

VERIFY_EMAIL_PATH = "/verify-email"
RESET_PASSWORD_PATH = "/reset-password"  # noqa: S105  # a URL path, not a password
FORGOT_PASSWORD_PATH = "/forgot-password"  # noqa: S105  # a URL path, not a password


def _link(web_base_url: str, path: str, token: str) -> str:
    return f"{web_base_url.rstrip('/')}{path}?{urlencode({'token': token})}"


def verify_email(to: str, full_name: str, web_base_url: str, token: str, ttl_hours: int) -> EmailMessage:
    link = _link(web_base_url, VERIFY_EMAIL_PATH, token)
    text = (
        f"Hello {full_name},\n\n"
        f"Confirm your email address to finish setting up your HelpVerified account:\n{link}\n\n"
        f"The link works once and expires in {ttl_hours} hours. "
        "If you didn't create an account, you can ignore this email."
    )
    return EmailMessage(
        to=to, subject="Confirm your email address", text=text, kind="verify_email", link=link
    )


def reset_password(to: str, full_name: str, web_base_url: str, token: str, ttl_minutes: int) -> EmailMessage:
    link = _link(web_base_url, RESET_PASSWORD_PATH, token)
    text = (
        f"Hello {full_name},\n\n"
        f"Someone asked to reset the password for your HelpVerified account. To choose a new one:\n{link}\n\n"
        f"The link works once and expires in {ttl_minutes} minutes. "
        "If it wasn't you, ignore this email; your password hasn't changed."
    )
    return EmailMessage(to=to, subject="Reset your password", text=text, kind="reset_password", link=link)


def password_changed(to: str, full_name: str, web_base_url: str) -> EmailMessage:
    """Sent after a reset. No token: the link only opens the forgot-password page."""
    link = f"{web_base_url.rstrip('/')}{FORGOT_PASSWORD_PATH}"
    text = (
        f"Hello {full_name},\n\n"
        "The password for your HelpVerified account was just changed, and you were signed out "
        "on every device.\n\n"
        "If this was you, there's nothing more to do.\n\n"
        f"If it wasn't you, someone may have access to your email. Secure your email account, then "
        f"reset your HelpVerified password straight away:\n{link}"
    )
    return EmailMessage(
        to=to, subject="Your password was changed", text=text, kind="password_changed", link=link
    )
