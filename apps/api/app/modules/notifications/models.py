"""The notification feed (B6, ADR 0015). PostgreSQL is the record; Firestore is a mirror (backend.md §7)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt


class Notification(CreatedAt, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
        Index("notifications_due", "next_attempt_at", postgresql_where=text("next_attempt_at IS NOT NULL")),
        CheckConstraint("attempts >= 0", name="attempts"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(Text)  # a web app path
    dedupe_key: Mapped[str | None] = mapped_column(Text, unique=True)
    email: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mirrored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default=text("0"))
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    last_error: Mapped[str | None] = mapped_column(Text)
