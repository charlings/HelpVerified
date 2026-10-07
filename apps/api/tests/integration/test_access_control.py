"""require_role and require_verified_email (spec items 14, 16), on probe routes.

The per-router 401/403/404 matrix grows with each module from B3; these pin down the dependencies.
"""

from collections.abc import Iterator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.deps import VerifiedUser, require_role
from app.main import create_app
from app.modules.users.models import User, UserRole
from tests.fakes import MemoryEmailSender
from tests.helpers import bearer, create_user, error_code, login

AdminOnly = Annotated[User, Depends(require_role(UserRole.super_admin))]
AgencyOrAdmin = Annotated[User, Depends(require_role(UserRole.agency_admin, UserRole.super_admin))]


@pytest.fixture
def probe_api(clean_state: None, outbox: MemoryEmailSender) -> Iterator[TestClient]:
    app: FastAPI = create_app(email_sender=outbox)

    @app.get("/_probe/admin-only")
    async def admin_only(user: AdminOnly) -> dict[str, str]:
        return {"role": user.role.value}

    @app.get("/_probe/agency-or-admin")
    async def agency_or_admin(user: AgencyOrAdmin) -> dict[str, str]:
        return {"role": user.role.value}

    @app.get("/_probe/verified")
    async def verified(user: VerifiedUser) -> dict[str, str]:
        return {"email": user.email}

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.mark.parametrize(
    ("role", "path", "status", "code"),
    [
        ("super_admin", "/_probe/admin-only", 200, None),
        ("agency_admin", "/_probe/admin-only", 403, "FORBIDDEN"),
        ("family", "/_probe/admin-only", 403, "FORBIDDEN"),
        ("agency_admin", "/_probe/agency-or-admin", 200, None),
        ("super_admin", "/_probe/agency-or-admin", 200, None),
        ("family", "/_probe/agency-or-admin", 403, "FORBIDDEN"),
    ],
)
def test_require_role(probe_api: TestClient, role: str, path: str, status: int, code: str | None) -> None:
    create_user(f"{role}@example.com", role=role)

    response = probe_api.get(path, headers=bearer(login(probe_api, f"{role}@example.com")))

    assert response.status_code == status
    if code:
        assert error_code(response) == code


@pytest.mark.parametrize("path", ["/_probe/admin-only", "/_probe/agency-or-admin", "/_probe/verified"])
def test_no_token_is_401_before_any_role_check(probe_api: TestClient, path: str) -> None:
    response = probe_api.get(path)

    assert response.status_code == 401
    assert error_code(response) == "UNAUTHENTICATED"


def test_unverified_email_is_403_email_not_verified(probe_api: TestClient) -> None:
    create_user("new@example.com", verified=False)
    create_user("done@example.com", verified=True)

    unverified = probe_api.get("/_probe/verified", headers=bearer(login(probe_api, "new@example.com")))
    verified = probe_api.get("/_probe/verified", headers=bearer(login(probe_api, "done@example.com")))

    assert unverified.status_code == 403
    assert error_code(unverified) == "EMAIL_NOT_VERIFIED"
    assert verified.status_code == 200
