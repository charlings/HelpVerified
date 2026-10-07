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

    # Email: "outbox" writes messages to EMAIL_OUTBOX_DIR (development and test only). Providers arrive in B6.
    EMAIL_PROVIDER: Literal["outbox"] = "outbox"
    EMAIL_FROM: str = "HelpVerified <no-reply@helpverified.local>"
    EMAIL_OUTBOX_DIR: str = ".outbox"

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
            raise ValueError("EMAIL_PROVIDER=outbox is for development only; configure a provider (B6)")
        return self

    @property
    def database_url(self) -> str:
        return str(self.DATABASE_URL)

    @property
    def is_deployed(self) -> bool:
        """Staging and production: real email, Secure cookies."""
        return self.APP_ENV in ("staging", "production")


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
