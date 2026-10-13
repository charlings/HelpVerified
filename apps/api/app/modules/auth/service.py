"""Sign-up, sign-in, sessions and one-time tokens (backend.md §4, security-and-compliance.md §4).

Every method owns its transaction. Methods that email return the message instead of sending it; the
router passes it to `send_email` as a background task, after the response has gone out. A slow
provider then doesn't hold the response, so the email-sending paths can't be timed to learn whether an
account exists (the token itself is written inside the request, so timing is not perfectly uniform).
A failed send is logged with its error type only, never undoing the change: the user can ask for a
new link.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import AccountSuspended, EmailTaken, InvalidCredentials, TokenExpired, Unauthenticated
from app.core.logging import get_logger
from app.core.security import (
    encode_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    verify_password,
)
from app.integrations.email import EmailMessage, EmailSender
from app.modules.auth import emails
from app.modules.auth.models import TokenPurpose
from app.modules.auth.repository import TokenRepository
from app.modules.users.models import AccountStatus, User, UserRole
from app.modules.users.repository import UserRepository

log = get_logger("app.auth")


@dataclass(frozen=True)
class SignedIn:
    user: User
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class Refreshed:
    access_token: str
    refresh_token: str


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings, email: EmailSender) -> None:
        self.session = session
        self.settings = settings
        self.email = email
        self.users = UserRepository(session)
        self.tokens = TokenRepository(session)

    # Accounts

    async def signup(
        self, *, email: str, password: str, full_name: str, role: UserRole, privacy_notice_version: str
    ) -> tuple[User, EmailMessage]:
        """The new user and their verification email (for `send_email`)."""
        now = utcnow()
        async with self.session.begin():
            if await self.users.get_by_email(email):
                raise EmailTaken()
            user = await self.users.add(
                User(
                    email=email.strip(),
                    password_hash=hash_password(password),
                    full_name=full_name,
                    role=role,
                    privacy_notice_version=privacy_notice_version,
                    privacy_accepted_at=now,
                )
            )
            token = await self._issue_one_time(user.id, TokenPurpose.verify_email, now)
        log.info("user.signed_up", user_id=str(user.id), role=user.role.value)
        return user, self._verify_message(user, token)

    async def verify_email(self, token: str) -> User:
        now = utcnow()
        async with self.session.begin():
            user = await self._consume_one_time(token, TokenPurpose.verify_email, now)
            if user.email_verified_at is None:
                user.email_verified_at = now
        return user

    async def resend_verification(self, email: str) -> EmailMessage | None:
        """A new verification email, or None (and nothing said) for unknown or already verified emails."""
        now = utcnow()
        async with self.session.begin():
            user = await self.users.get_by_email(email)
            if user is None or user.email_verified_at is not None:
                return None
            await self.tokens.use_all_one_time(user.id, TokenPurpose.verify_email, now)
            token = await self._issue_one_time(user.id, TokenPurpose.verify_email, now)
        return self._verify_message(user, token)

    async def forgot_password(self, email: str) -> EmailMessage | None:
        """A reset email, or None (and nothing said) for unknown or suspended accounts."""
        now = utcnow()
        async with self.session.begin():
            user = await self.users.get_by_email(email)
            if user is None or user.status is AccountStatus.suspended:
                return None
            await self.tokens.use_all_one_time(user.id, TokenPurpose.reset_password, now)
            token = await self._issue_one_time(user.id, TokenPurpose.reset_password, now)
        return emails.reset_password(
            user.email,
            user.full_name,
            self.settings.WEB_BASE_URL,
            token,
            self.settings.RESET_PASSWORD_TTL_MIN,
        )

    async def reset_password(self, token: str, new_password: str) -> EmailMessage:
        """Sets the password, spends every reset link and signs the user out everywhere. Returns the
        "your password was changed" notice for the account's owner."""
        now = utcnow()
        async with self.session.begin():
            user = await self._consume_one_time(token, TokenPurpose.reset_password, now)
            await self.tokens.use_all_one_time(user.id, TokenPurpose.reset_password, now)
            user.password_hash = hash_password(new_password)
            await self.tokens.revoke_all_for_user(user.id, now)
        log.info("user.password_reset", user_id=str(user.id))
        return emails.password_changed(user.email, user.full_name, self.settings.WEB_BASE_URL)

    async def send_email(self, message: EmailMessage | None) -> None:
        """Sends an auth email; run as a background task after the response. Nothing for None, so callers
        schedule it the same way whether or not an account matched. A failure is logged by template and
        error type only: the message, its link (a one-time token) and the address never reach the logs."""
        if message is None:
            return
        try:
            await self.email.send(message)
        except Exception as exc:
            log.error("email.send_failed", kind=message.kind, error=type(exc).__name__)

    # Sessions

    async def login(self, email: str, password: str) -> SignedIn:
        now = utcnow()
        async with self.session.begin():
            user = await self.users.get_by_email(email)
            # verify_password runs argon2 even for unknown emails, so both failures look the same.
            password_ok = verify_password(password, user.password_hash if user else None)
            if user is None or not password_ok:
                raise InvalidCredentials()
            if user.status is AccountStatus.suspended:
                raise AccountSuspended()
            user.last_login_at = now
            refresh = await self._issue_refresh(user.id, uuid.uuid4(), now)
        return SignedIn(user=user, access_token=self._access_token(user, now), refresh_token=refresh)

    async def refresh(self, refresh_token: str | None) -> Refreshed:
        """Rotates the refresh token. Presenting a revoked one revokes its whole family."""
        if not refresh_token:
            raise Unauthenticated()
        now = utcnow()
        async with self.session.begin():
            current = await self.tokens.get_refresh_for_update(hash_token(refresh_token))
            if current is None or current.expires_at <= now:
                raise Unauthenticated()
            if current.revoked_at is not None:
                await self.tokens.revoke_family(current.family_id, now)
                rotated: Refreshed | None = None  # raise after the commit, so the revocation sticks
            else:
                user = await self.users.get(current.user_id)
                if user is None or user.status is not AccountStatus.active:
                    raise Unauthenticated()
                new_token = new_opaque_token()
                replacement = await self.tokens.add_refresh(
                    user.id, hash_token(new_token), current.family_id, self._refresh_expiry(now)
                )
                current.revoked_at = now
                current.replaced_by = replacement.id
                rotated = Refreshed(access_token=self._access_token(user, now), refresh_token=new_token)
        if rotated is None:
            log.warning("auth.refresh_reuse", family_id=str(current.family_id), user_id=str(current.user_id))
            raise Unauthenticated("Your session has ended. Please sign in again.")
        return rotated

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        now = utcnow()
        async with self.session.begin():
            current = await self.tokens.get_refresh_for_update(hash_token(refresh_token))
            if current is not None:
                await self.tokens.revoke_family(current.family_id, now)

    async def active_user(self, user_id: uuid.UUID) -> User:
        """The user behind a valid access token: 401 if gone, 403 ACCOUNT_SUSPENDED if suspended."""
        async with self.session.begin():
            user = await self.users.get(user_id)
        if user is None:
            raise Unauthenticated()
        if user.status is AccountStatus.suspended:
            raise AccountSuspended()
        return user

    # Helpers

    def _access_token(self, user: User, now: datetime) -> str:
        return encode_access_token(
            user.id,
            user.role.value,
            self.settings.JWT_SECRET.get_secret_value(),
            now,
            timedelta(minutes=self.settings.JWT_ACCESS_TTL_MIN),
        )

    def _refresh_expiry(self, now: datetime) -> datetime:
        return now + timedelta(days=self.settings.JWT_REFRESH_TTL_DAYS)

    async def _issue_refresh(self, user_id: uuid.UUID, family_id: uuid.UUID, now: datetime) -> str:
        token = new_opaque_token()
        await self.tokens.add_refresh(user_id, hash_token(token), family_id, self._refresh_expiry(now))
        return token

    async def _issue_one_time(self, user_id: uuid.UUID, purpose: TokenPurpose, now: datetime) -> str:
        ttl = (
            timedelta(hours=self.settings.VERIFY_EMAIL_TTL_HOURS)
            if purpose is TokenPurpose.verify_email
            else timedelta(minutes=self.settings.RESET_PASSWORD_TTL_MIN)
        )
        token = new_opaque_token()
        await self.tokens.add_one_time(user_id, purpose, hash_token(token), now + ttl)
        return token

    async def _consume_one_time(self, token: str, purpose: TokenPurpose, now: datetime) -> User:
        """Marks the token used and returns its user; 410 TOKEN_EXPIRED if unknown, used or expired."""
        row = await self.tokens.get_one_time_for_update(hash_token(token), purpose)
        if row is None or row.used_at is not None or row.expires_at <= now:
            raise TokenExpired()
        row.used_at = now
        user = await self.users.get(row.user_id)
        if user is None:
            raise TokenExpired()
        return user

    def _verify_message(self, user: User, token: str) -> EmailMessage:
        return emails.verify_email(
            user.email,
            user.full_name,
            self.settings.WEB_BASE_URL,
            token,
            self.settings.VERIFY_EMAIL_TTL_HOURS,
        )
