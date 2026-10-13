"""Settings. The only module that reads environment variables (backend.md §3).

Keys are added in the milestone that first uses them (ADR 0010), and every key
here is also listed in the repo's `.env.example`.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import (
    Field,
    PostgresDsn,
    RedisDsn,
    SecretStr,
    ValidationError,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class MissingSettingsError(RuntimeError):
    """Startup error naming every required environment variable that is missing or invalid."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", frozen=True)

    APP_ENV: Literal["development", "test", "staging", "production"]
    API_BASE_URL: str
    WEB_BASE_URL: str
    CORS_ORIGINS: Annotated[list[str], NoDecode]
    DATABASE_URL: PostgresDsn
    REDIS_URL: RedisDsn

    # Auth (B2)
    JWT_SECRET: SecretStr = Field(min_length=32)
    JWT_ACCESS_TTL_MIN: int = Field(default=15, gt=0)
    JWT_REFRESH_TTL_DAYS: int = Field(default=14, gt=0)
    VERIFY_EMAIL_TTL_HOURS: int = Field(default=24, gt=0)
    RESET_PASSWORD_TTL_MIN: int = Field(default=60, gt=0)

    # Google sign-in (ADR 0016). Both set, or neither (Google sign-in is then off). The OAuth client's
    # authorised redirect URI must be API_BASE_URL + /api/v1/auth/google/callback, exactly.
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: SecretStr | None = None
    GOOGLE_FLOW_TTL_MIN: int = Field(default=10, gt=0)  # time allowed on Google's consent screen
    GOOGLE_PENDING_TTL_MIN: int = Field(default=15, gt=0)  # a new Google user choosing family or agency

    # Rate limits (backend.md §9)
    RATE_LIMIT_AUTH_PER_MIN: int = Field(default=5, gt=0)
    RATE_LIMIT_EMAIL_PER_HOUR: int = Field(default=3, gt=0)
    RATE_LIMIT_USER_PER_MIN: int = Field(default=120, gt=0)

    # Workers and verification (B3)
    NIN_PEPPER: SecretStr = Field(min_length=32)  # HMAC key for NINs; long-lived (rotation needs a rehash)
    # References and address are re-verified after this; ID and guarantor don't expire.
    VERIFICATION_TTL_MONTHS: int = Field(default=12, gt=0)
    CLOUDINARY_CLOUD_NAME: str = Field(min_length=1)
    CLOUDINARY_API_KEY: str = Field(min_length=1)
    CLOUDINARY_API_SECRET: SecretStr = Field(min_length=1)
    CLOUDINARY_SIGNED_URL_TTL_SEC: int = Field(default=300, gt=0, le=3600)

    # Placements (B4). Business defaults the owner may change (CLAUDE.md "Open decisions").
    TRIAL_DAYS_DEFAULT: int = Field(default=14, ge=7, le=30)
    REPLACEMENT_WINDOW_DAYS: int = Field(default=30, ge=0)  # after confirmation; the trial always counts
    FREE_REPLACEMENTS: int = Field(default=1, ge=0)  # per placement fee
    PAYMENT_HOLD_MINUTES: int = Field(default=30, gt=0)  # an unpaid accept holds the worker this long
    FEE_CHARGED_AT: Literal["accept"] = "accept"  # owner decision 2026-10-07 (ADR 0013)
    IDEMPOTENCY_TTL_HOURS: int = Field(default=24, gt=0)

    # Payments (B5). Amounts are integer kobo; defaults are the frontend's demo prices (docs/placeholders.md).
    PAYSTACK_SECRET_KEY: SecretStr = Field(min_length=10)
    PAYSTACK_AGENCY_PLAN_CODE: str | None = None  # a monthly plan created in Paystack; subscriptions need it
    PLACEMENT_FEE_KOBO: int = Field(default=2_000_000, gt=0)  # NGN 20,000
    AGENCY_SUBSCRIPTION_KOBO: int = Field(default=2_500_000, gt=0)  # NGN 25,000 a month; must match the plan

    # Email (B6). "outbox" writes messages to EMAIL_OUTBOX_DIR (development and test only); "smtp" sends
    # through any provider's SMTP relay (Resend, Brevo, Postmark, SendGrid...): changing provider is config.
    EMAIL_PROVIDER: Literal["outbox", "smtp"] = "outbox"
    EMAIL_FROM: str = "HelpVerified <no-reply@helpverified.local>"
    EMAIL_OUTBOX_DIR: str = ".outbox"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = Field(default=587, gt=0)  # STARTTLS; 465 means TLS from the first byte
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: SecretStr | None = None

    # Notifications (B6). The feed lives in PostgreSQL; "firestore" also mirrors it for the web app's live
    # feed. FIREBASE_CREDENTIALS_FILE is a service-account JSON kept outside the repository.
    NOTIFICATIONS_MIRROR: Literal["none", "firestore"] = "none"
    FIREBASE_PROJECT_ID: str | None = None
    FIREBASE_CREDENTIALS_FILE: str | None = None
    NOTIFICATION_MAX_ATTEMPTS: int = Field(default=8, gt=0)

    # Jobs (B6): run in the API process; a Redis lock keeps each run to one instance.
    JOBS_ENABLED: bool = True
    TRIAL_REMINDER_DAYS: int = Field(
        default=2, ge=1
    )  # remind both sides this many days before the trial ends
    REFUND_MAX_ATTEMPTS: int = Field(default=10, gt=0)

    # Retention (security-and-compliance.md §1, NDPA storage limitation). Proposed defaults; owner to confirm.
    RETENTION_REJECTED_EVIDENCE_DAYS: int = Field(default=90, gt=0)
    RETENTION_IDLE_WORKER_MONTHS: int = Field(default=12, gt=0)  # owner, 2026-10-13 (ADR 0015 item 9)

    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    MAX_BODY_BYTES: int = Field(default=1_048_576, gt=0)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _no_outbox_in_deployed_envs(self) -> Settings:
        if self.EMAIL_PROVIDER == "outbox" and self.is_deployed:
            raise ValueError("EMAIL_PROVIDER=outbox is for development only; set EMAIL_PROVIDER=smtp")
        return self

    @model_validator(mode="after")
    def _providers_complete(self) -> Settings:
        """A chosen provider must have everything it needs, so a typo fails at startup, not at first send."""
        if self.EMAIL_PROVIDER == "smtp":
            missing = [k for k in ("SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD") if not getattr(self, k)]
            if missing:
                raise ValueError(f"EMAIL_PROVIDER=smtp needs {', '.join(missing)}")
        if self.NOTIFICATIONS_MIRROR == "firestore":
            missing = [
                k for k in ("FIREBASE_PROJECT_ID", "FIREBASE_CREDENTIALS_FILE") if not getattr(self, k)
            ]
            if missing:
                raise ValueError(f"NOTIFICATIONS_MIRROR=firestore needs {', '.join(missing)}")
        if bool(self.GOOGLE_CLIENT_ID) != bool(self.GOOGLE_CLIENT_SECRET):
            raise ValueError("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither")
        return self

    @model_validator(mode="after")
    def _live_paystack_only_in_production(self) -> Settings:
        """Test keys everywhere except production (security-and-compliance.md §5). Never echoes the value."""
        key = self.PAYSTACK_SECRET_KEY.get_secret_value()
        if not key.startswith(("sk_test_", "sk_live_")):
            raise ValueError("PAYSTACK_SECRET_KEY must be a Paystack secret key (sk_test_... or sk_live_...)")
        if key.startswith("sk_live_") and self.APP_ENV != "production":
            raise ValueError(
                "PAYSTACK_SECRET_KEY is a live key; use a test key (sk_test_...) outside production"
            )
        return self

    @property
    def database_url(self) -> str:
        return str(self.DATABASE_URL)

    @property
    def is_deployed(self) -> bool:
        """Staging and production: real email, Secure cookies."""
        return self.APP_ENV in ("staging", "production")

    @property
    def google_enabled(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)

    @property
    def google_redirect_uri(self) -> str:
        """Must match the OAuth client's authorised redirect URI character for character."""
        return f"{self.API_BASE_URL.rstrip('/')}/api/v1/auth/google/callback"


def load_settings() -> Settings:
    """Read settings from the environment, failing with the names of the bad keys."""
    try:
        return Settings()
    except ValidationError as exc:
        problems = sorted(
            {
                f"{error['loc'][0]} ({'missing' if error['type'] == 'missing' else error['msg']})"
                if error["loc"]
                else str(error["msg"])
                for error in exc.errors()
            }
        )
        raise MissingSettingsError(
            "Invalid or missing environment variables: " + ", ".join(problems) + ". See .env.example."
        ) from None


@lru_cache
def get_settings() -> Settings:
    return load_settings()
