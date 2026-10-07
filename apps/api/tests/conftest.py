"""Shared fixtures. Test settings are set here, before the app is imported."""

import os
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Local Postgres (docker compose or scripts/pg-portable.ps1) and the CI service use these credentials.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://helpverified:helpverified@localhost:5432/helpverified_test",
)

TEST_ENV = {
    "APP_ENV": "test",
    "API_BASE_URL": "http://testserver",
    "WEB_BASE_URL": "http://localhost:3000",
    "CORS_ORIGINS": "http://localhost:3000",
    "DATABASE_URL": TEST_DATABASE_URL,
}
os.environ.update(TEST_ENV)

from app.core.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def app() -> FastAPI:
    get_settings.cache_clear()
    return create_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
