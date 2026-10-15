"""The public contact form: each message is emailed to CONTACT_INBOX. Nothing is stored (B7, ADR 0017).

Messages are personal data written by members of the public, so neither their text nor the sender's
address ever reaches the logs.
"""

from app.core.config import Settings
from app.core.logging import get_logger
from app.integrations.email import EmailMessage, EmailSender
from app.modules.contact.schemas import ContactIn, ContactTopic

log = get_logger("app.contact")

TOPIC_SUBJECTS: dict[ContactTopic, str] = {
    "family": "Family enquiry",
    "agency": "Agency enquiry",
    "partnership": "Partnership enquiry",
    "press": "Press enquiry",
    "other": "General enquiry",
}


class ContactService:
    def __init__(self, settings: Settings, email: EmailSender) -> None:
        self.settings = settings
        self.email = email

    def message(self, body: ContactIn) -> EmailMessage | None:
        """The email for the inbox, or None when no inbox is configured (development with SMTP only)."""
        inbox = self.settings.contact_inbox
        if inbox is None:
            log.warning("contact.no_inbox", topic=body.topic)
            return None
        lines = [
            f"Name: {body.name}",
            f"Email: {body.email}",
            f"Phone: {body.phone or 'not given'}",
            f"Topic: {TOPIC_SUBJECTS[body.topic]}",
            "",
            body.message,
            "",
            "Sent from the HelpVerified contact form. Reply to this email to answer the sender.",
        ]
        return EmailMessage(
            to=inbox,
            # Fixed text only: user input never goes into a header except the validated Reply-To address.
            subject=f"[Contact] {TOPIC_SUBJECTS[body.topic]}",
            text="\n".join(lines),
            kind="contact_message",
            reply_to=str(body.email),
        )

    async def send(self, message: EmailMessage | None) -> None:
        """Runs after the response. A failure is logged by error type only."""
        if message is None:
            return
        try:
            await self.email.send(message)
        except Exception as exc:
            log.error("email.send_failed", kind=message.kind, error=type(exc).__name__)
