"""`/auth` endpoints (api-contracts.md §3). Rate limits per backend.md §9."""

import hmac
from datetime import timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import Settings
from app.core.deps import (
    AgencyServiceDep,
    AuthServiceDep,
    GoogleDep,
    GoogleFlowsDep,
    LimiterDep,
    SettingsDep,
)
from app.core.errors import AccountSuspended, Forbidden, RateLimited, TokenExpired
from app.core.logging import get_logger
from app.core.rate_limit import identifier
from app.integrations.google import GoogleAuthError
from app.modules.auth.schemas import (
    EmailIn,
    GoogleCompleteIn,
    GooglePendingOut,
    LoginIn,
    LoginOut,
    RefreshOut,
    ResetPasswordIn,
    SignupIn,
    SignupOut,
    VerifyEmailIn,
    VerifyEmailOut,
)
from app.modules.auth.service import GoogleOutcome, SignedIn
from app.modules.users.models import UserRole
from app.modules.users.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
log = get_logger("app.auth")

REFRESH_COOKIE = "hv_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
GOOGLE_STATE_COOKIE = "hv_google_state"
GOOGLE_PENDING_COOKIE = "hv_google_pending"
GOOGLE_COOKIE_PATH = "/api/v1/auth/google"
GOOGLE_EXPIRED_MESSAGE = "Your Google sign-in has expired. Please continue with Google again."
WEB_LOGIN_PATH = "/login"  # apps/web/src/config/routes.ts: routes.auth.login
WEB_GOOGLE_SIGNUP_PATH = "/signup/google"  # routes.auth.googleSignup
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


# Google sign-in (ADR 0016). The browser navigates to start and callback (they answer with redirects,
# errors included, as `?google_error=` on the web app's sign-in page); the web app calls pending and
# complete with fetch, like the other endpoints.


def _web_redirect(settings: Settings, path: str, **query: str | None) -> RedirectResponse:
    params = urlencode({k: v for k, v in query.items() if v is not None})
    url = f"{settings.WEB_BASE_URL.rstrip('/')}{path}" + (f"?{params}" if params else "")
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


def _google_error(settings: Settings, code: str) -> RedirectResponse:
    response = _web_redirect(settings, WEB_LOGIN_PATH, google_error=code)
    _clear_google_cookie(response, GOOGLE_STATE_COOKIE, settings)
    return response


def _set_google_cookie(response: Response, name: str, value: str, minutes: int, settings: Settings) -> None:
    response.set_cookie(
        name,
        value,
        max_age=minutes * 60,
        path=GOOGLE_COOKIE_PATH,
        httponly=True,
        secure=settings.is_deployed,
        samesite="lax",  # sent on Google's top-level redirect back to the callback
    )


def _clear_google_cookie(response: Response, name: str, settings: Settings) -> None:
    response.delete_cookie(
        name, path=GOOGLE_COOKIE_PATH, httponly=True, secure=settings.is_deployed, samesite="lax"
    )


@router.get("/google/start", response_class=RedirectResponse, status_code=status.HTTP_303_SEE_OTHER)
async def google_start(
    request: Request,
    google: GoogleDep,
    flows: GoogleFlowsDep,
    limiter: LimiterDep,
    settings: SettingsDep,
    next: str | None = None,  # the web app's name for "return here afterwards"
) -> RedirectResponse:
    """Sends the browser to Google's consent screen. `next` is a web-app path to return to."""
    if google is None:
        return _google_error(settings, "unavailable")
    try:
        await limiter.hit("google", identifier(_client_ip(request)), settings.RATE_LIMIT_AUTH_PER_MIN, MINUTE)
    except RateLimited:
        return _google_error(settings, "rate_limited")
    flow = await flows.start(next)
    response = RedirectResponse(
        google.authorization_url(
            state=flow.state,
            code_challenge=flow.code_challenge,
            nonce=flow.nonce,
            redirect_uri=settings.google_redirect_uri,
        ),
        status_code=status.HTTP_303_SEE_OTHER,
    )
    _set_google_cookie(response, GOOGLE_STATE_COOKIE, flow.state, settings.GOOGLE_FLOW_TTL_MIN, settings)
    return response


@router.get("/google/callback", response_class=RedirectResponse, status_code=status.HTTP_303_SEE_OTHER)
async def google_callback(
    request: Request,
    google: GoogleDep,
    flows: GoogleFlowsDep,
    auth: AuthServiceDep,
    settings: SettingsDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Where Google sends the browser back. Signs in (refresh cookie, then the web app restores the
    session), or sends a new user to choose family or agency, or reports why it couldn't."""
    if google is None:
        return _google_error(settings, "unavailable")
    if error is not None:
        return _google_error(settings, "cancelled" if error == "access_denied" else "failed")
    cookie = request.cookies.get(GOOGLE_STATE_COOKIE)
    # The state must be the one this browser was given at start (no login CSRF), and unspent.
    if not code or not state or not cookie or not hmac.compare_digest(cookie, state):
        return _google_error(settings, "expired")
    flow = await flows.finish(state)
    if flow is None:
        return _google_error(settings, "expired")
    try:
        identity = await google.identify(
            code=code,
            code_verifier=flow.code_verifier,
            redirect_uri=settings.google_redirect_uri,
            nonce=flow.nonce,
        )
    except GoogleAuthError as exc:
        log.warning("google.sign_in_failed", reason=str(exc))
        return _google_error(settings, "failed")
    if not identity.email_verified:
        return _google_error(settings, "email_not_verified")
    try:
        outcome = await auth.google_sign_in(identity)
    except AccountSuspended:
        return _google_error(settings, "suspended")
    if isinstance(outcome, SignedIn):
        response = _web_redirect(settings, WEB_LOGIN_PATH, google="signed_in", next=flow.next)
        _set_refresh_cookie(response, outcome.refresh_token, settings)
    elif outcome is GoogleOutcome.new_user:
        token = await flows.hold_signup(identity)
        response = _web_redirect(settings, WEB_GOOGLE_SIGNUP_PATH, next=flow.next)
        _set_google_cookie(response, GOOGLE_PENDING_COOKIE, token, settings.GOOGLE_PENDING_TTL_MIN, settings)
    else:
        return _google_error(settings, "other_google_account")
    _clear_google_cookie(response, GOOGLE_STATE_COOKIE, settings)
    return response


@router.get("/google/pending")
async def google_pending(request: Request, flows: GoogleFlowsDep, settings: SettingsDep) -> GooglePendingOut:
    """The Google identity waiting for its role choice; 410 TOKEN_EXPIRED if none (or it expired)."""
    _check_origin(request, settings)
    pending = await flows.pending_signup(request.cookies.get(GOOGLE_PENDING_COOKIE))
    if pending is None:
        raise TokenExpired(GOOGLE_EXPIRED_MESSAGE)
    return GooglePendingOut(email=pending.email, full_name=pending.name)


@router.post("/google/complete", status_code=status.HTTP_201_CREATED)
async def google_complete(
    body: GoogleCompleteIn,
    request: Request,
    response: Response,
    flows: GoogleFlowsDep,
    auth: AuthServiceDep,
    agencies: AgencyServiceDep,
    settings: SettingsDep,
) -> LoginOut:
    """Creates the new Google user's account (email already verified) and signs them in, like login.
    410 TOKEN_EXPIRED if the pending sign-up is gone; 409 EMAIL_TAKEN if the email was registered since."""
    _check_origin(request, settings)
    pending = await flows.take_signup(request.cookies.get(GOOGLE_PENDING_COOKIE))
    if pending is None:
        raise TokenExpired(GOOGLE_EXPIRED_MESSAGE)
    _clear_google_cookie(response, GOOGLE_PENDING_COOKIE, settings)
    signed_in = await auth.google_sign_up(
        pending,
        full_name=body.full_name,
        role=UserRole(body.role),
        privacy_notice_version=body.privacy_notice_version,
    )
    _set_refresh_cookie(response, signed_in.refresh_token, settings)
    agency = await agencies.for_user(signed_in.user.id)
    return LoginOut(access_token=signed_in.access_token, user=UserOut.of(signed_in.user, agency))
