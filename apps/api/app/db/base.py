"""Declarative base for every ORM model.

The naming convention gives constraints stable names, which repositories match on
(for example `placements_one_active_per_worker` → WORKER_UNAVAILABLE) and which
Alembic needs to drop them in a downgrade.
"""

from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class CreatedAt:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Timestamps(CreatedAt):
    """`updated_at` is kept current by the `<table>_set_updated_at` trigger (migration 0001)."""

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
