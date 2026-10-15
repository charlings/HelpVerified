"""The demo seed (B7): what it creates, that the API serves it, and that both hard rules hold over it."""

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings, get_settings, load_settings
from app.scripts import seed as seed_script
from app.scripts.seed import SeedError, seed, seed_id
from tests.conftest import run_sql
from tests.helpers import API, bearer, error_code, login

DEMO = "seed-demo-password-1"
ADMIN = "seed-admin-password-2"


def seed_settings(**overrides: object) -> Settings:
    get_settings.cache_clear()
    values = {"SEED_DEMO_PASSWORD": SecretStr(DEMO), "SEED_ADMIN_PASSWORD": SecretStr(ADMIN)} | overrides
    return load_settings().model_copy(update=values)


@pytest.fixture
def seeded(api: TestClient) -> TestClient:
    asyncio.run(seed(seed_settings(), reset=True))
    return api


def test_ids_are_stable_uuid5s_of_the_mock_ids() -> None:
    """apps/web/e2e/seed-ids.ts derives the same values; these two pin both implementations."""
    assert seed_id("w-amaka") == uuid.UUID("95cf43fa-2ca2-56d2-b52d-c8dc12c0a60b")
    assert seed_id("p-blessing") == uuid.UUID("a757e9df-c47f-542e-92ae-c87abd4f1c26")


def test_demo_accounts_sign_in_with_the_passwords_from_settings(seeded: TestClient) -> None:
    login(seeded, "family@demo.hv", DEMO)
    login(seeded, "agency@demo.hv", DEMO)
    login(seeded, "admin@demo.hv", ADMIN)
    wrong = seeded.post(f"{API}/auth/login", json={"email": "admin@demo.hv", "password": DEMO})
    assert wrong.status_code == 401


def test_the_api_serves_the_demo_workspaces(seeded: TestClient) -> None:
    agency = bearer(login(seeded, "agency@demo.hv", DEMO))
    workers = seeded.get(f"{API}/workers", headers=agency, params={"page_size": 50}).json()
    by_name = {w["full_name"]: w for w in workers["items"]}
    assert workers["total"] == 10  # Sunrise's; Zainab belongs to Kano Home Helpers
    assert by_name["Amaka Obi"]["listing_status"] == "listed"
    assert by_name["Amaka Obi"]["id"] == str(seed_id("w-amaka"))
    assert by_name["Joy Nwosu"]["verified_count"] == 3
    assert by_name["Halima Sani"]["listing_status"] == "delisted"
    assert by_name["Blessing Eze"]["active_placement"]["status"] == "trial"

    family = bearer(login(seeded, "family@demo.hv", DEMO))
    dashboard = seeded.get(f"{API}/families/me/dashboard", headers=family).json()
    assert [p["id"] for p in dashboard["active_placements"]] == [str(seed_id("p-blessing"))]
    proposals = seeded.get(f"{API}/requests/{seed_id('r-ada-nanny')}/proposals", headers=family).json()
    assert [p["worker"]["first_name"] for p in proposals] == ["Amaka"]

    admin = bearer(login(seeded, "admin@demo.hv", ADMIN))
    overview = seeded.get(f"{API}/admin/overview", headers=admin).json()
    assert overview["agencies_pending"] == 1
    assert overview["placements_active"] == 3


def test_rule_1_holds_over_seeded_data(seeded: TestClient) -> None:
    """Joy has 3 of 4 checks: neither the API nor raw SQL can list her."""
    agency = bearer(login(seeded, "agency@demo.hv", DEMO))
    response = seeded.post(f"{API}/workers/{seed_id('w-joy')}/list", headers=agency)
    assert response.status_code == 409
    assert error_code(response) == "WORKER_NOT_VERIFIED"
    with pytest.raises(Exception, match="not fully verified"):
        run_sql(f"UPDATE workers SET listing_status = 'listed' WHERE id = '{seed_id('w-joy')}'")  # noqa: S608


def test_rule_2_holds_over_seeded_data(seeded: TestClient) -> None:
    """Blessing is on trial with the Okafors: a second active placement is refused by the database."""
    ids = ", ".join(
        f"'{seed_id(key)}'" for key in ("r-ada-nanny", "pr-amaka-ada", "w-blessing", "f-ada", "a-sunrise")
    )
    columns = "request_id, proposal_id, worker_id, family_id, agency_id, status, trial_starts_on"
    with pytest.raises(Exception, match="placements_one_active_per_worker"):
        # Fixed seed UUIDs, not input.
        run_sql(f"INSERT INTO placements ({columns}) VALUES ({ids}, 'trial', current_date)")  # noqa: S608


def test_it_refuses_a_database_that_already_has_users(seeded: TestClient) -> None:
    with pytest.raises(SeedError, match="--reset"):
        asyncio.run(seed(seed_settings(), reset=False))


def test_it_refuses_deployed_environments_and_a_missing_password(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(seed_script, "load_settings", lambda: seed_settings(APP_ENV="production"))
    assert seed_script.main([]) == 1
    assert "Refusing" in capsys.readouterr().out

    monkeypatch.setattr(seed_script, "load_settings", lambda: seed_settings(SEED_DEMO_PASSWORD=None))
    assert seed_script.main([]) == 1
    assert "SEED_DEMO_PASSWORD" in capsys.readouterr().out
