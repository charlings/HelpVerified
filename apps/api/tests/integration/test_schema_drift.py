"""The ORM models and the migrated database agree, so autogenerate would produce an empty migration."""

import asyncio

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import app.db.models  # noqa: F401  # registers every model
from app.db.base import Base
from tests.conftest import TEST_DATABASE_URL


def _diff(connection: Connection) -> list[object]:
    context = MigrationContext.configure(connection, opts={"compare_type": True})
    return list(compare_metadata(context, Base.metadata))


async def _schema_diff() -> list[object]:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(_diff)
    finally:
        await engine.dispose()


@pytest.mark.usefixtures("db_ready")
def test_models_match_migrations() -> None:
    assert asyncio.run(_schema_diff()) == []
