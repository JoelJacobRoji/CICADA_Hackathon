"""SaaS configuration. Loaded from environment / apps/saas-api/.env (git-ignored)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parents[2]  # apps/saas-api
REPO_CONFIG = APP_DIR.parents[1] / "config"

REGIONS: tuple[str, ...] = ("ap-south", "eu-west")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AEGIS_SAAS_",
        env_file=APP_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = Field(default="dev", pattern=r"^(dev|test|prod)$")
    host: str = "127.0.0.1"
    port: int = 9001
    log_level: str = Field(default="INFO", pattern=r"^(DEBUG|INFO|WARNING|ERROR)$")

    # Runtime connections use the non-superuser aegis_app role (RLS enforced).
    db_app_url_ap_south: SecretStr
    db_app_url_eu_west: SecretStr
    # Owner connections are used ONLY by migrations.
    db_owner_url_ap_south: SecretStr | None = None
    db_owner_url_eu_west: SecretStr | None = None
    # Password assigned to the aegis_app role by migration 0001.
    db_app_password: SecretStr | None = None
    db_schema: str = Field(default="aegis", pattern=r"^[a-z_][a-z0-9_]{0,62}$")

    jwt_signing_key: SecretStr
    cors_origins: list[str] = ["http://localhost:5180", "http://127.0.0.1:5180"]

    # Operator sessions
    session_ttl_minutes: int = Field(default=30, ge=5, le=24 * 60)
    session_cookie_name: str = "aegis_session"
    cookie_secure: bool = False  # MUST be true behind HTTPS (prod); false only for local http
    login_max_attempts_per_minute: int = Field(default=5, ge=1, le=100)

    # Ingest
    ingest_max_bytes: int = Field(default=1_048_576, ge=1024, le=8_388_608)
    late_after_seconds: float = Field(default=30.0, ge=1)
    offline_after_seconds: float = Field(default=30.0, ge=5)

    # Health engine
    thresholds_path: Path = REPO_CONFIG / "health_thresholds.yaml"
    health_sweep_interval_seconds: float = Field(default=5.0, ge=0.5, le=60)
    health_persist_interval_seconds: float = Field(default=1.0, ge=0.2, le=30)

    @field_validator("jwt_signing_key")
    @classmethod
    def _key_strength(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("jwt_signing_key must be at least 32 characters")
        return v

    def app_url(self, region: str) -> str:
        return {
            "ap-south": self.db_app_url_ap_south,
            "eu-west": self.db_app_url_eu_west,
        }[region].get_secret_value()

    def owner_url(self, region: str) -> str:
        url = {"ap-south": self.db_owner_url_ap_south, "eu-west": self.db_owner_url_eu_west}[region]
        if url is None:
            raise RuntimeError(f"owner URL for region {region} is not configured")
        return url.get_secret_value()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
