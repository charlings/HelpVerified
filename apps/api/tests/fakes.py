"""Test doubles for integrations."""

from app.integrations.email import EmailMessage


class MemoryEmailSender:
    """Keeps sent messages in a list instead of delivering them."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)

    def last(self, kind: str, to: str | None = None) -> EmailMessage:
        for message in reversed(self.sent):
            if message.kind == kind and (to is None or message.to.lower() == to.lower()):
                return message
        raise AssertionError(f"no {kind} email sent to {to or 'anyone'}")

    def token(self, kind: str, to: str | None = None) -> str:
        link = self.last(kind, to).link
        assert link is not None
        return link.split("token=", 1)[1]


class FailingEmailSender:
    async def send(self, message: EmailMessage) -> None:
        raise ConnectionError("email provider down")
