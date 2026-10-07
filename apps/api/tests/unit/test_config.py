"""Removing a required env var stops startup with a named error (spec requirement 3)."""

from pathlib import Path

import pytest

from app.core.config import MissingSettingsError, Settings, load_settings
from tests.conftest import TEST_ENV


@pytest.fixture(autouse=True)
def no_env_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # A developer's apps/api/.env must not fill in the variables these tests remove.
    monkeypatch.chdir(tmp_path)


@pytest.mark.parametrize("key", sorted(k for k in TEST_ENV if Settings.model_fields[k].is_required()))
def test_missing_required_key_is_named(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    monkeypatch.delenv(key)

    with pytest.raises(MissingSettingsError, match=rf"{key} \(missing\)"):
        load_settings()


def test_invalid_value_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "not-a-url")

    with pytest.raises(MissingSettingsError, match="DATABASE_URL") as raised:
        load_settings()
    assert "not-a-url" not in str(raised.value)  # values (which may be secrets) are never echoed


def test_cors_origins_are_split_on_commas(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, https://helpverified.ng")

    assert load_settings().CORS_ORIGINS == ["http://localhost:3000", "https://helpverified.ng"]


def test_every_setting_is_documented_in_env_example() -> None:
    env_example = (Path(__file__).parents[4] / ".env.example").read_text(encoding="utf-8")
    documented = {line.split("=", 1)[0].strip() for line in env_example.splitlines() if "=" in line}
    assert set(Settings.model_fields) <= documented
