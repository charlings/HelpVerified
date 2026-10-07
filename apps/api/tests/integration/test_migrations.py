"""Migrations go up, down to base and up again (database.md §8). Needs PostgreSQL."""

import asyncio
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import TEST_DATABASE_URL

pytestmark = pytest.mark.db

ALEMBIC_INI = Path(__file__).parents[2] / "alembic.ini"


async def _query(sql: str) -> set[str]:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with engine.connect() as connection:
            return {row[0] for row in await connection.execute(text(sql))}
    finally:
        await engine.dispose()


def query(sql: str) -> set[str]:
    return asyncio.run(_query(sql))


@pytest.fixture(scope="module")
def alembic_config() -> Config:
    try:
        query("SELECT 1")
    except (OSError, ConnectionError) as exc:
        if os.environ.get("CI"):  # never skip silently in CI
            raise
        pytest.skip(f"PostgreSQL not reachable at TEST_DATABASE_URL: {exc}")
    config = Config(str(ALEMBIC_INI))
    config.attributes["database_url"] = TEST_DATABASE_URL
    return config


def installed_extensions() -> set[str]:
    return query("SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'citext')")


def has_set_updated_at() -> bool:
    return bool(query("SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'"))


def test_upgrade_downgrade_upgrade(alembic_config: Config) -> None:
    command.downgrade(alembic_config, "base")

    command.upgrade(alembic_config, "head")
    assert installed_extensions() == {"pgcrypto", "citext"}
    assert has_set_updated_at()

    command.downgrade(alembic_config, "base")
    assert installed_extensions() == set()
    assert not has_set_updated_at()

    command.upgrade(alembic_config, "head")
    assert installed_extensions() == {"pgcrypto", "citext"}
    assert query("SELECT gen_random_uuid()::text")  # pgcrypto works
