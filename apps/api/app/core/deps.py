"""FastAPI dependencies shared by routers (backend.md §4).

Resources (settings, DB sessionmaker, Redis, email sender) live on `app.state`, set up by the
lifespan in `app.main`.
"""

from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import EmailNotVerified, Forbidden, Unauthenticated
from app.core.rate_limit import RateLimiter
from app.core.security import decode_access_token
from app.integrations.email import EmailSender
from app.modules.auth.service import AuthService
from app.modules.users.models import User, UserRole
from app.modules.users.service import UserService


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """One session per request. Services own the transaction (`async with session.begin():`)."""
    async with request.app.state.sessionmaker() as session:
        yield session


def get_rate_limiter(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.rate_limiter
    return limiter


def get_email_sender(request: Request) -> EmailSender:
    sender: EmailSender = request.app.state.email_sender
    return sender


SettingsDep = Annotated[Settings, Depends(get_settings)]
SessionDep = Annotated[AsyncSession, Depends(get_db)]
LimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


def get_auth_service(
    session: SessionDep, settings: SettingsDep, email: Annotated[EmailSender, Depends(get_email_sender)]
) -> AuthService:
    return AuthService(session, settings, email)


def get_user_service(session: SessionDep) -> UserService:
    return UserService(session)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]

_bearer = HTTPBearer(auto_error=False, description="Access token from /auth/login or /auth/refresh")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    auth: AuthServiceDep,
    limiter: LimiterDep,
    settings: SettingsDep,
) -> User:
    """401 UNAUTHENTICATED without a valid token; 403 ACCOUNT_SUSPENDED for suspended users;
    429 RATE_LIMITED past RATE_LIMIT_USER_PER_MIN."""
    if credentials is None:
        raise Unauthenticated()
    claims = decode_access_token(credentials.credentials, settings.JWT_SECRET.get_secret_value(), utcnow())
    await limiter.hit("user", str(claims.user_id), settings.RATE_LIMIT_USER_PER_MIN, timedelta(minutes=1))
    return await auth.active_user(claims.user_id)


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole) -> Callable[[User], Awaitable[User]]:
    """403 FORBIDDEN unless the caller has one of `roles`."""

    async def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise Forbidden()
        return user

    return dependency


async def require_verified_email(user: CurrentUser) -> User:
    """403 EMAIL_NOT_VERIFIED: families posting requests and agencies submitting onboarding (B3, B4)."""
    if user.email_verified_at is None:
        raise EmailNotVerified()
    return user


VerifiedUser = Annotated[User, Depends(require_verified_email)]
