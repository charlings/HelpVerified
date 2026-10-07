"""Users (database.md §3, Identity)."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, Text, text
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps


class UserRole(StrEnum):
    super_admin = "super_admin"
    agency_admin = "agency_admin"
    family = "family"


class AccountStatus(StrEnum):
    active = "active"
    suspended = "suspended"


def pg_enum(enum: type[StrEnum], name: str) -> Enum:
    """A PostgreSQL enum whose type is created and dropped by hand in the migrations."""
    return Enum(enum, name=name, values_callable=lambda e: [m.value for m in e], create_type=False)


class User(Timestamps, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)  # NULL for Google-only accounts
    google_sub: Mapped[str | None] = mapped_column(Text, unique=True)
    full_name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    role: Mapped[UserRole] = mapped_column(pg_enum(UserRole, "user_role"))
    status: Mapped[AccountStatus] = mapped_column(
        pg_enum(AccountStatus, "account_status"), server_default=AccountStatus.active.value
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Privacy notice accepted at signup (security-and-compliance.md §2)
    privacy_notice_version: Mapped[str | None] = mapped_column(Text)
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
