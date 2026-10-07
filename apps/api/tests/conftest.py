"""Shared fixtures. Test settings are set here, before the app is imported.

Unit tests need nothing running. Tests that use `api` (or `db_ready`) need PostgreSQL and
Redis: they skip when either is unreachable locally, and fail in CI.
"""

import asyncio
import os
from collections.abc import Callable, Coroutine, Iterator
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
    "NIN_PEPPER": "test-pepper-not-for-real-use-0123456789abcdef",
    "CLOUDINARY_CLOUD_NAME": "hv-test",
    "CLOUDINARY_API_KEY": "123456789012345",
    "CLOUDINARY_API_SECRET": "test-cloudinary-secret",
}
os.environ.update(TEST_ENV)

from app.core.config import Settings, get_settings, load_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.fakes import FakeCloudinary, MemoryEmailSender  # noqa: E402

ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"
TABLES = (
    "audit_log",
    "document_access_log",
    "verification_documents",
    "verification_items",
    "workers",
    "subscriptions",
    "agency_members",
    "agencies",
    "one_time_tokens",
    "refresh_tokens",
    "users",
)


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


def run_async[T](coroutine: Coroutine[object, object, T]) -> T:
    """Runs a coroutine on the helpers' loop (for calling services directly, as jobs will)."""
    return _loop.run_until_complete(coroutine)


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
    """Every test starts with empty tables and an empty Redis database.
    DELETE, not TRUNCATE: on small tables it's ~100x faster (TRUNCATE rewrites files)."""
    run_async(_delete_all())
    redis.Redis.from_url(TEST_REDIS_URL).flushdb()


async def _delete_all() -> None:
    global _engine
    if _engine is None:
        _engine = create_async_engine(TEST_DATABASE_URL)
    async with _engine.begin() as connection:
        for table in TABLES:  # children first, so foreign keys are satisfied
            await connection.execute(text(f"DELETE FROM {table}"))  # noqa: S608  # fixed names


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


@pytest.fixture(scope="session")
def _session_outbox() -> MemoryEmailSender:
    return MemoryEmailSender()


@pytest.fixture(scope="session")
def _session_cloudinary() -> FakeCloudinary:
    return FakeCloudinary()


@pytest.fixture
def outbox(_session_outbox: MemoryEmailSender) -> MemoryEmailSender:
    _session_outbox.sent.clear()
    return _session_outbox


@pytest.fixture
def cloudinary(_session_cloudinary: FakeCloudinary) -> FakeCloudinary:
    _session_cloudinary.assets.clear()
    return _session_cloudinary


@pytest.fixture(scope="session")
def shared_api(
    db_ready: None, _session_outbox: MemoryEmailSender, _session_cloudinary: FakeCloudinary
) -> Iterator[TestClient]:
    """One running app for the whole session. Closing pooled PostgreSQL connections costs seconds
    on Windows, so tests share this app's pool; `api` resets its state between tests."""
    get_settings.cache_clear()
    app = create_app(load_settings(), email_sender=_session_outbox, cloudinary=_session_cloudinary)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def reset_app_connections(client: TestClient) -> None:
    """Drops the app's pooled connections (after types are recreated: asyncpg caches type OIDs)."""
    engine = client.app.state.sessionmaker.kw["bind"]  # type: ignore[attr-defined]
    client.portal.call(engine.dispose)  # type: ignore[union-attr]


ApiFactory = Callable[..., TestClient]


@pytest.fixture
def make_api(
    clean_state: None, outbox: MemoryEmailSender, cloudinary: FakeCloudinary
) -> Iterator[ApiFactory]:
    """Builds a separate running app with settings overrides (slower: it opens its own connections)."""
    clients: list[TestClient] = []

    def build(**overrides: object) -> TestClient:
        get_settings.cache_clear()
        settings = load_settings().model_copy(update=overrides)
        app = create_app(settings, email_sender=outbox, cloudinary=cloudinary)
        test_client = TestClient(app, raise_server_exceptions=False)
        test_client.__enter__()
        clients.append(test_client)
        return test_client

    yield build
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def api(
    shared_api: TestClient, clean_state: None, outbox: MemoryEmailSender, cloudinary: FakeCloudinary
) -> TestClient:
    """The running app with default test settings, empty data, no cookies and fresh fakes."""
    shared_api.cookies.clear()
    return shared_api
