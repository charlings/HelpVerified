"""Workers (database.md §3). The raw NIN is never stored: only an HMAC hash and the last 4 digits."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps
from app.db.types import pg_enum
from app.modules.agencies.models import WorkerRole


class ListingStatus(StrEnum):
    draft = "draft"
    listed = "listed"  # only with 4/4 checks verified and unexpired (trigger workers_listing_gate)
    delisted = "delisted"
    suspended = "suspended"  # the agency is suspended


class Worker(Timestamps, Base):
    __tablename__ = "workers"
    __table_args__ = (
        CheckConstraint("years_experience BETWEEN 0 AND 60", name="years_experience"),
        CheckConstraint(
            "expected_salary_min_kobo IS NULL OR expected_salary_max_kobo IS NULL "
            "OR expected_salary_min_kobo <= expected_salary_max_kobo",
            name="salary_range",
        ),
        CheckConstraint("nin_last4 ~ '^[0-9]{4}$'", name="nin_last4"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id"), index=True)
    full_name: Mapped[str] = mapped_column(Text)
    role: Mapped[WorkerRole] = mapped_column(pg_enum(WorkerRole, "worker_role"))
    years_experience: Mapped[int] = mapped_column(SmallInteger)
    bio: Mapped[str | None] = mapped_column(Text)
    languages: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    live_in_ok: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    state: Mapped[str] = mapped_column(Text)
    lga: Mapped[str] = mapped_column(Text)
    expected_salary_min_kobo: Mapped[int | None] = mapped_column(BigInteger)
    expected_salary_max_kobo: Mapped[int | None] = mapped_column(BigInteger)
    photo_public_id: Mapped[str | None] = mapped_column(Text)
    nin_hash: Mapped[str] = mapped_column(Text, unique=True)
    nin_last4: Mapped[str] = mapped_column(CHAR(4))
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    listing_status: Mapped[ListingStatus] = mapped_column(
        pg_enum(ListingStatus, "listing_status"), server_default=ListingStatus.draft.value, index=True
    )
    listed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
