"""Each migration that embeds SQL matches its readable copy in app/db/sql/, statement by statement."""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

from app.db.sql_script import split_sql

API = Path(__file__).parents[2]
VERSIONS = API / "app/db/migrations/versions"
SQL = API / "app/db/sql"


def load(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EMBEDDING = [p for p in sorted(VERSIONS.glob("*.py")) if "UPGRADE_SQL" in p.read_text(encoding="utf-8")]


def test_migrations_with_sql_are_found() -> None:
    assert len(EMBEDDING) >= 2


@pytest.mark.parametrize("path", EMBEDDING, ids=lambda p: p.stem)
def test_readable_copy_matches(path: Path) -> None:
    revision = load(path).revision
    [copy] = SQL.glob(f"{revision}_*.sql")

    assert split_sql(load(path).UPGRADE_SQL) == split_sql(copy.read_text(encoding="utf-8"))
