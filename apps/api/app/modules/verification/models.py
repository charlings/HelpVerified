"""The four checks, their evidence and who viewed it (database.md §3)."""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, Timestamps
from app.db.types import pg_enum


class VerificationKind(StrEnum):
    id = "id"
    guarantor = "guarantor"
    references = "references"
    address = "address"


KINDS: tuple[VerificationKind, ...] = tuple(VerificationKind)


class VerificationStatus(StrEnum):
    not_started = "not_started"
    submitted = "submitted"
    verified = "verified"
    rejected = "rejected"
    expired = "expired"


class VerificationItem(Timestamps, Base):
    __tablename__ = "verification_items"
    __table_args__ = (
        UniqueConstraint("worker_id", "kind", name="uq_verification_items_worker_id_kind"),
        CheckConstraint(
            "status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)",
            name="verified_has_verifier",
        ),
        CheckConstraint("status <> 'rejected' OR rejection_reason IS NOT NULL", name="rejected_has_reason"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id", ondelete="CASCADE"))
    kind: Mapped[VerificationKind] = mapped_column(pg_enum(VerificationKind, "verification_kind"))
    status: Mapped[VerificationStatus] = mapped_column(
        pg_enum(VerificationStatus, "verification_status"),
        server_default=VerificationStatus.not_started.value,
        index=True,
    )
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'"))
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    flag_reason: Mapped[str | None] = mapped_column(Text)
    flagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class VerificationDocument(CreatedAt, Base):
    __tablename__ = "verification_documents"
    __table_args__ = (
        CheckConstraint("bytes > 0 AND bytes <= 10485760", name="bytes"),
        CheckConstraint("format IN ('jpg', 'png', 'pdf')", name="format"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("verification_items.id", ondelete="CASCADE"), index=True
    )
    cloudinary_public_id: Mapped[str] = mapped_column(Text, unique=True)
    resource_type: Mapped[str] = mapped_column(Text)
    format: Mapped[str] = mapped_column(Text)
    bytes: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # destroyed in Cloudinary


class DocumentAccess(CreatedAt, Base):
    __tablename__ = "document_access_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("verification_documents.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(INET)
