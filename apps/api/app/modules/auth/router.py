"""`/auth` endpoints (api-contracts.md §3). Rate limits per backend.md §9."""

from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Request, Response, status

from app.core.config import Settings
from app.core.deps import AgencyServiceDep, AuthServiceDep, LimiterDep, SettingsDep
from app.core.errors import Forbidden
from app.core.rate_limit import identifier
from app.modules.auth.schemas import (
    EmailIn,
    LoginIn,
    LoginOut,
    RefreshOut,
    ResetPasswordIn,
    SignupIn,
    SignupOut,
    VerifyEmailIn,
    VerifyEmailOut,
)
from app.modules.users.models import UserRole
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "hv_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
MINUTE = timedelta(minutes=1)
HOUR = timedelta(hours=1)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.JWT_REFRESH_TTL_DAYS * 24 * 3600,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_deployed,  # plain-http localhost in development
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True, secure=settings.is_deployed, samesite="lax"
    )


def _check_origin(request: Request, settings: Settings) -> None:
    """CSRF guard for the cookie-authenticated endpoints (security-and-compliance.md §4)."""
    origin = request.headers.get("origin")
    allowed = {o.rstrip("/") for o in [*settings.CORS_ORIGINS, settings.WEB_BASE_URL]}
    if origin is not None and origin.rstrip("/") not in allowed:
        raise Forbidden()


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn,
    request: Request,
    background: BackgroundTasks,
    auth: AuthServiceDep,
    limiter: LimiterDep,
    settings: SettingsDep,
) -> SignupOut:
    """Creates a family or agency-admin account and emails a verification link (after the response)."""
    await limiter.hit(
        "auth", identifier(_client_ip(request), body.email), settings.RATE_LIMIT_AUTH_PER_MIN, MINUTE
    )
    user, message = await auth.signup(
        email=body.email,
        password=body.password,
        full_name=body.full_name,
        role=UserRole(body.role),
        privacy_notice_version=body.privacy_notice_version,
    )
    background.add_task(auth.send_email, message)
    return SignupOut(user=UserOut.of(user))


@router.post("/login")
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    auth: AuthServiceDep,
    agencies: AgencyServiceDep,
    limiter: LimiterDep,
    settings: SettingsDep,
) -> LoginOut:
    """Returns an access token and sets the refresh cookie. Same error whether or not the email exists."""
    await limiter.hit(
        "auth", identifier(_client_ip(request), body.email), settings.RATE_LIMIT_AUTH_PER_MIN, MINUTE
    )
    signed_in = await auth.login(body.email, body.password)
    _set_refresh_cookie(response, signed_in.refresh_token, settings)
    agency = await agencies.for_user(signed_in.user.id)
    return LoginOut(access_token=signed_in.access_token, user=UserOut.of(signed_in.user, agency))


@router.post("/refresh")
async def refresh(
    request: Request, response: Response, auth: AuthServiceDep, settings: SettingsDep
) -> RefreshOut:
    """Rotates the refresh cookie and returns a new access token."""
    _check_origin(request, settings)
    rotated = await auth.refresh(request.cookies.get(REFRESH_COOKIE))
    _set_refresh_cookie(response, rotated.refresh_token, settings)
    return RefreshOut(access_token=rotated.access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, auth: AuthServiceDep, settings: SettingsDep) -> Response:
    """Ends this sign-in (its whole refresh family). Works with an expired access token."""
    _check_origin(request, settings)
    await auth.logout(request.cookies.get(REFRESH_COOKIE))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, settings)
    return response


@router.post("/verify-email")
async def verify_email(body: VerifyEmailIn, auth: AuthServiceDep) -> VerifyEmailOut:
    """Spends the verification link; 410 TOKEN_EXPIRED if it was used or has expired."""
    user = await auth.verify_email(body.token)
    return VerifyEmailOut(verified=True, role=user.role.value)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    body: EmailIn,
    background: BackgroundTasks,
    auth: AuthServiceDep,
    limiter: LimiterDep,
    settings: SettingsDep,
) -> Response:
    """Always 202, so the response doesn't reveal whether the email has an account. The email (if any)
    is sent after the response, so the provider's speed doesn't show in the response time."""
    await limiter.hit("email", identifier(body.email), settings.RATE_LIMIT_EMAIL_PER_HOUR, HOUR)
    background.add_task(auth.send_email, await auth.resend_verification(body.email))
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    body: EmailIn,
    background: BackgroundTasks,
    auth: AuthServiceDep,
    limiter: LimiterDep,
    settings: SettingsDep,
) -> Response:
    """Always 202, so the response doesn't reveal whether the email has an account. The email (if any)
    is sent after the response, so the provider's speed doesn't show in the response time."""
    await limiter.hit("email", identifier(body.email), settings.RATE_LIMIT_EMAIL_PER_HOUR, HOUR)
    background.add_task(auth.send_email, await auth.forgot_password(body.email))
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    body: ResetPasswordIn, background: BackgroundTasks, auth: AuthServiceDep
) -> Response:
    """Sets a new password and signs the user out everywhere; 410 TOKEN_EXPIRED for a used or old link.
    The owner is then told by email that the password changed."""
    background.add_task(auth.send_email, await auth.reset_password(body.token, body.password))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
