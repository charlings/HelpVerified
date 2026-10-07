"""Layer rules (backend.md §2), checked on imports so they hold as modules are added.

- A router never imports a repository or SQLAlchemy.
- A service never imports FastAPI or Starlette.
- A repository never imports FastAPI or Starlette.
"""

import ast
from pathlib import Path

import pytest

MODULES = Path(__file__).parents[2] / "app" / "modules"

# Dotted prefixes a layer may not import; "repository" also matches any module of that name.
FORBIDDEN_IMPORTS = {
    "router.py": ("sqlalchemy", "app.db", "repository"),
    "service.py": ("fastapi", "starlette"),
    "repository.py": ("fastapi", "starlette"),
}


def imported_names(path: Path) -> list[str]:
    """Every imported module and name, dotted, with relative imports' leading dots dropped."""
    names: list[str] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            names.extend(".".join(filter(None, (module, alias.name))) for alias in node.names)
    return names


def is_banned(name: str, banned: tuple[str, ...]) -> bool:
    parts = name.split(".")
    return any(name == b or name.startswith(f"{b}.") or (b == "repository" and b in parts) for b in banned)


def layer_files() -> list[Path]:
    return sorted(p for p in MODULES.rglob("*.py") if p.name in FORBIDDEN_IMPORTS) if MODULES.exists() else []


@pytest.mark.parametrize("path", layer_files(), ids=lambda p: str(p.relative_to(MODULES)))
def test_layer_imports(path: Path) -> None:
    banned = FORBIDDEN_IMPORTS[path.name]
    offending = [name for name in imported_names(path) if is_banned(name, banned)]
    assert not offending, f"{path.name} must not import {offending}"


@pytest.mark.parametrize(
    ("filename", "source"),
    [
        ("router.py", "from sqlalchemy import select\n"),
        ("router.py", "from . import repository\n"),
        ("router.py", "from app.modules.workers.repository import WorkerRepository\n"),
        ("router.py", "from app.db.session import get_db\n"),
        ("service.py", "from fastapi import HTTPException\n"),
        ("repository.py", "import starlette.requests\n"),
    ],
)
def test_checker_catches_violations(tmp_path: Path, filename: str, source: str) -> None:
    path = tmp_path / filename
    path.write_text(source, encoding="utf-8")

    assert any(is_banned(name, FORBIDDEN_IMPORTS[filename]) for name in imported_names(path))


def test_checker_allows_the_normal_imports(tmp_path: Path) -> None:
    router = tmp_path / "router.py"
    router.write_text("from fastapi import APIRouter\nfrom . import schemas, service\n", encoding="utf-8")

    assert not [n for n in imported_names(router) if is_banned(n, FORBIDDEN_IMPORTS["router.py"])]


def test_core_errors_do_not_import_http() -> None:
    """Services import app.core.errors, so it must stay free of HTTP frameworks too."""
    errors = Path(__file__).parents[2] / "app" / "core" / "errors.py"
    assert not [n for n in imported_names(errors) if n.split(".")[0] in {"fastapi", "starlette"}]
