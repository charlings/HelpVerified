"""Reads PostgreSQL error details (SQLSTATE, constraint, hint) out of SQLAlchemy's wrapped asyncpg errors,
so repositories can turn known database refusals into domain errors (database.md §4 and §5)."""

from dataclasses import dataclass

from sqlalchemy.exc import DBAPIError


@dataclass(frozen=True)
class PgError:
    sqlstate: str | None
    constraint: str | None
    hint: str | None


def pg_error(exc: DBAPIError) -> PgError:
    cause = getattr(exc.orig, "__cause__", None)  # the asyncpg exception
    return PgError(
        sqlstate=getattr(cause, "sqlstate", None),
        constraint=getattr(cause, "constraint_name", None),
        hint=getattr(cause, "hint", None),
    )
