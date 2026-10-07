"""Settings. The only module that reads environment variables (backend.md §3).

Keys are added in the milestone that first uses them (ADR 0010), and every key
here is also listed in the repo's `.env.example`.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, ValidationError, field_validator
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

    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    MAX_BODY_BYTES: int = Field(default=1_048_576, gt=0)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def database_url(self) -> str:
        return str(self.DATABASE_URL)


def load_settings() -> Settings:
    """Read settings from the environment, failing with the names of the bad keys."""
    try:
        return Settings()
    except ValidationError as exc:
        problems = sorted(
            {
                f"{error['loc'][0]} ({'missing' if error['type'] == 'missing' else error['msg']})"
                for error in exc.errors()
                if error["loc"]
            }
        )
        raise MissingSettingsError(
            "Invalid or missing environment variables: " + ", ".join(problems) + ". See .env.example."
        ) from None


@lru_cache
def get_settings() -> Settings:
    return load_settings()
