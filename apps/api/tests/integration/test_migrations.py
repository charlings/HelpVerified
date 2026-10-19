"""Migrations go up, down to base and up again (database.md §8). Needs PostgreSQL."""

import pytest
from alembic import command
from fastapi.testclient import TestClient

from tests.conftest import alembic_config, reset_app_connections, reset_sql_connections, run_sql

# Empty tables first: migration 0008's downgrade refuses while unresolved refunds or alerts exist.
pytestmark = pytest.mark.usefixtures("db_ready", "clean_state")

TABLES = {
    "users",
    "refresh_tokens",
    "one_time_tokens",
    "agencies",
    "agency_members",
    "subscriptions",
    "workers",
    "verification_items",
    "verification_documents",
    "document_access_log",
    "audit_log",
    "families",
    "requests",
    "proposals",
    "placements",
    "placement_events",
    "replacement_requests",
}
TYPES = {
    "user_role",
    "account_status",
    "agency_status",
    "worker_role",
    "listing_status",
    "verification_kind",
    "verification_status",
    "subscription_status",
    "request_status",
    "proposal_status",
    "placement_status",
    "placement_end_reason",
    "replacement_status",
}


def extensions() -> set[object]:
    return {
        row[0] for row in run_sql("SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'citext')")
    }


def tables() -> set[object]:
    return {row[0] for row in run_sql("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")} - {
        "alembic_version"
    }


def enum_types() -> set[object]:
    return {row[0] for row in run_sql("SELECT typname FROM pg_type WHERE typtype = 'e'")}


def functions() -> set[object]:
    return {row[0] for row in run_sql("SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'")}


def assert_at_head() -> None:
    assert extensions() == {"pgcrypto", "citext"}
    assert functions() == {"set_updated_at"}
    assert tables() >= TABLES
    assert enum_types() >= TYPES


def test_upgrade_downgrade_upgrade(shared_api: TestClient) -> None:
    config = alembic_config()
    command.upgrade(config, "head")
    assert_at_head()

    command.downgrade(config, "base")
    assert extensions() == set()
    assert functions() == set()
    assert tables() == set()
    assert not TYPES & enum_types()

    command.upgrade(config, "head")
    reset_sql_connections()  # the enum types were recreated with new OIDs
    reset_app_connections(shared_api)
    assert_at_head()
    assert run_sql("SELECT gen_random_uuid()::text")  # pgcrypto works


def test_updated_at_trigger_runs() -> None:
    run_sql("TRUNCATE users CASCADE")
    run_sql(
        "INSERT INTO users (email, full_name, role, updated_at) "
        "VALUES ('t@example.com', 'T', 'family', now() - interval '1 day')"
    )
    run_sql("UPDATE users SET full_name = 'Changed'")

    [(fresh,)] = run_sql("SELECT updated_at > now() - interval '1 minute' FROM users")
    assert fresh is True
    run_sql("TRUNCATE users CASCADE")
