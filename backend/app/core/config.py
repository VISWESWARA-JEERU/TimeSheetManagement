from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator , model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Runtime
    APP_ENV: Literal["local", "dev", "staging", "production"] = "local"
    APP_NAME: str = "Team Timesheet"
    LOG_LEVEL: str = "INFO"

    # DB / Redis
    DATABASE_URL: str
    DATABASE_URL_SYNC: str
    REDIS_URL: str = "redis://localhost:6379/0"

    # URLs
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Session
    SESSION_SECRET: str = Field(min_length=32)
    SESSION_COOKIE_NAME: str = "tsid"
    SESSION_TTL_SECONDS: int = 60 * 60 * 12
    SESSION_COOKIE_SECURE: bool = False
    SESSION_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    # Auth mode
    LOCAL_DEV_AUTH: bool = False

    # OIDC
    OIDC_ENABLED: bool = False
    OIDC_ISSUER: str | None = None
    OIDC_CLIENT_ID: str | None = None
    OIDC_CLIENT_SECRET: str | None = None
    OIDC_REDIRECT_URI: str | None = None
    OIDC_SCOPES: str = "openid email profile groups"
    OIDC_GROUP_CLAIM: str = "groups"
    OIDC_GROUP_TO_ROLE_ADMIN: str | None = None
    OIDC_GROUP_TO_ROLE_MANAGER: str | None = None
    OIDC_GROUP_TO_ROLE_MEMBER: str | None = None

    # Location
    LOCATION_REQUIRED: bool = False
    LOCATION_RETENTION_DAYS: int = 365
    REVERSE_GEOCODE_ENABLED: bool = False
    REVERSE_GEOCODE_PROVIDER: str | None = None

    # GitHub
    GITHUB_AUTH_MODE: Literal["app", "pat"] = "pat"
    GITHUB_APP_ID: str | None = None
    GITHUB_PRIVATE_KEY: str | None = None
    GITHUB_INSTALLATION_ID: str | None = None
    GITHUB_PAT: str | None = None
    GITHUB_API_BASE: str = "https://api.github.com"
    GITHUB_SYNC_INTERVAL_SECONDS: int = Field(default=600, ge=60)
    GITHUB_WEBHOOK_ENABLED: bool = False
    GITHUB_WEBHOOK_SECRET: str | None = None
    GITHUB_SCHEDULED_SYNC_ENABLED: bool = False

    # Rate limits
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_API: str = "600/minute"
    RATE_LIMIT_GITHUB_SYNC: str = "30/minute"
    RATE_LIMIT_ADMIN_RESYNC: str = "2/hour"

    # Business
    DEFAULT_WORKDAY_HOURS: int = 8
    VARIANCE_THRESHOLD_MINUTES: int = 60
    AUTO_LOGOUT_MINUTES: int = 600

    @model_validator(mode="after")
    def _guard_local_dev_auth(self) -> "Settings":
        if self.APP_ENV in ("staging", "production") and self.LOCAL_DEV_AUTH:
            raise ValueError(
                "LOCAL_DEV_AUTH must be false when APP_ENV is staging or production"
            )
        if self.APP_ENV in ("staging", "production") and not self.OIDC_ENABLED:
            raise ValueError("OIDC_ENABLED must be true when APP_ENV is staging or production")
        if self.GITHUB_WEBHOOK_ENABLED and not (
            self.GITHUB_WEBHOOK_SECRET and self.GITHUB_WEBHOOK_SECRET.strip()
        ):
            raise ValueError(
                "GITHUB_WEBHOOK_SECRET must be configured when GITHUB_WEBHOOK_ENABLED is true"
            )
        return self


    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()