"""Shared fixtures. Test settings are set here, before the app is imported.

Unit tests need nothing running. Tests that use `api` (or `db_ready`) need PostgreSQL and
Redis: they skip when either is unreachable locally, and fail in CI.
"""

import asyncio
import os
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
import redis
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# Local services (docker compose, or scripts/pg-portable.ps1 + redis-portable.ps1) and CI use these.
# 127.0.0.1, not localhost: on Windows a refused ::1 attempt costs ~2 s per new connection.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://helpverified:helpverified@127.0.0.1:5432/helpverified_test",
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6379/15")

TEST_ENV = {
    "APP_ENV": "test",
    "API_BASE_URL": "http://testserver",
    "WEB_BASE_URL": "http://localhost:3000",
    "CORS_ORIGINS": "http://localhost:3000",
    "DATABASE_URL": TEST_DATABASE_URL,
    "REDIS_URL": TEST_REDIS_URL,
    "JWT_SECRET": "test-secret-not-for-real-use-0123456789abcdef",
}
os.environ.update(TEST_ENV)

from app.core.config import Settings, get_settings, load_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.fakes import MemoryEmailSender  # noqa: E402

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"
TABLES = ("one_time_tokens", "refresh_tokens", "users")


# Test helpers share one event loop and one engine, so they reuse pooled connections
# (each new PostgreSQL connection costs ~0.4 s on Windows).
_loop = asyncio.new_event_loop()
_engine: AsyncEngine | None = None


async def _execute(sql: str, params: dict[str, object]) -> list[tuple[object, ...]]:
    global _engine
    if _engine is None:
        _engine = create_async_engine(TEST_DATABASE_URL)
    async with _engine.begin() as connection:
        result = await connection.execute(text(sql), params)
        return [tuple(row) for row in result] if result.returns_rows else []


def run_sql(sql: str, **params: object) -> list[tuple[object, ...]]:
    """Runs one statement with bound parameters (never formatted into the SQL)."""
    return _loop.run_until_complete(_execute(sql, params))


def reset_sql_connections() -> None:
    """Drop pooled helper connections. Needed after types are dropped and recreated (the
    migration round-trip): asyncpg caches type OIDs per connection."""
    if _engine is not None:
        _loop.run_until_complete(_engine.dispose())


@pytest.fixture(scope="session", autouse=True)
def _close_helper_engine() -> Iterator[None]:
    yield
    if _engine is not None:
        _loop.run_until_complete(_engine.dispose())
    _loop.close()


def alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.attributes["database_url"] = TEST_DATABASE_URL
    return config


@pytest.fixture(scope="session")
def db_ready() -> None:
    """PostgreSQL migrated to head and Redis reachable, or skip (fail in CI)."""
    try:
        run_sql("SELECT 1")
        redis.Redis.from_url(TEST_REDIS_URL).ping()
    except (OSError, ConnectionError, redis.exceptions.ConnectionError) as exc:
        if os.environ.get("CI"):  # never skip silently in CI
            raise
        pytest.skip(f"PostgreSQL or Redis not reachable: {exc}")
    command.upgrade(alembic_config(), "head")


@pytest.fixture
def clean_state(db_ready: None) -> None:
    """Every test starts with empty tables and an empty Redis database."""
    run_sql("TRUNCATE " + ", ".join(TABLES) + " CASCADE")  # fixed table names, no input
    redis.Redis.from_url(TEST_REDIS_URL).flushdb()


@pytest.fixture
def settings() -> Settings:
    get_settings.cache_clear()
    return load_settings()


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """The app without services: for tests that don't touch the database or Redis."""
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def outbox() -> MemoryEmailSender:
    return MemoryEmailSender()


ApiFactory = Callable[..., TestClient]


@pytest.fixture
def make_api(clean_state: None, outbox: MemoryEmailSender) -> Iterator[ApiFactory]:
    """Builds a running app (with Postgres, Redis and the in-memory outbox) from settings overrides."""
    clients: list[TestClient] = []

    def build(**overrides: object) -> TestClient:
        get_settings.cache_clear()
        settings = load_settings().model_copy(update=overrides)
        test_client = TestClient(create_app(settings, email_sender=outbox), raise_server_exceptions=False)
        test_client.__enter__()
        clients.append(test_client)
        return test_client

    yield build
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def api(make_api: ApiFactory) -> TestClient:
    """The running app with default test settings."""
    return make_api()
