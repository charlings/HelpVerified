"""Column helpers shared by models."""

from enum import StrEnum

from sqlalchemy import Enum


def pg_enum(enum: type[StrEnum], name: str) -> Enum:
    """A PostgreSQL enum whose type is created and dropped by hand in the migrations."""
    return Enum(enum, name=name, values_callable=lambda e: [m.value for m in e], create_type=False)
