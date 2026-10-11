"""The notification feed's responses (B6). Additive to the frozen contract (ADR 0009, ADR 0015)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.core.pagination import Page
from app.modules.notifications.models import Notification


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str = Field(examples=["proposal_received"])
    title: str = Field(examples=["New proposal for your request"])
    body: str
    link: str | None = Field(examples=["/family/requests/9d0c1c9e-5f7e-4d43-9b1b-8f2b6f3f3a10"])
    created_at: datetime
    read: bool

    @classmethod
    def of(cls, row: Notification) -> NotificationOut:
        return cls(
            id=row.id,
            kind=row.kind,
            title=row.title,
            body=row.body,
            link=row.link,
            created_at=row.created_at,
            read=row.read_at is not None,
        )


class NotificationPage(Page[NotificationOut]):
    unread: int = Field(description="Unread notifications in the whole feed, for the bell's badge")


class MarkedRead(BaseModel):
    updated: int
