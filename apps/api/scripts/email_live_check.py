"""Live check of the email provider (B6): sends one test email through the configured SMTP relay.

Uses EMAIL_PROVIDER=smtp, SMTP_* and EMAIL_FROM from apps/api/.env.

    cd apps/api
    uv run python -m scripts.email_live_check you@example.com

Then look in that inbox (and its spam folder). Failures print the error type only, never the password.
"""

import asyncio
import sys

from app.core.config import load_settings
from app.integrations.email import EmailMessage, SmtpEmailSender, email_sender_from


async def main(to: str) -> int:
    settings = load_settings()
    sender = email_sender_from(settings)
    if not isinstance(sender, SmtpEmailSender):
        print("Set EMAIL_PROVIDER=smtp (and the SMTP_* keys) in apps/api/.env first.")
        return 1
    print(f"Sending through {sender.host}:{sender.port} as {sender.sender} ...")
    try:
        await sender.send(
            EmailMessage(
                to=to,
                subject="HelpVerified email check",
                text="This is a test from HelpVerified's email live check. If you can read it, email works.",
                kind="live_check",
            )
        )
    except Exception as exc:
        print("FAILED:", type(exc).__name__, "- check SMTP_HOST, SMTP_PORT, the credentials and EMAIL_FROM")
        return 1
    print("SENT. Check the inbox (and spam) of", to)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        print(__doc__)
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
