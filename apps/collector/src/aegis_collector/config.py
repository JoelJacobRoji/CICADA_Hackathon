"""Collector configuration. Loaded from environment / apps/collector/.env (git-ignored)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parents[2]  # apps/collector
REPO_CONFIG = APP_DIR.parents[1] / "config"

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


class CollectorSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AEGIS_COL_",
        env_file=APP_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    collector_id: str = Field(default="col_dev_01", pattern=r"^col_[a-z0-9_-]{3,48}$")
    region: str = Field(default="ap-south", pattern=r"^[a-z]{2}-[a-z]+$")
    host: str = "127.0.0.1"
    port: int = 9100
    log_level: str = Field(default="INFO", pattern=r"^(DEBUG|INFO|WARNING|ERROR)$")

    db_path: Path = APP_DIR / "data" / "collector.db"
    config_dir: Path = REPO_CONFIG
    raw_retention_hours: int = Field(default=24, ge=1, le=24 * 30)

    # Pipeline
    window_seconds: float = Field(default=2.0, ge=0.5, le=60)
    window_grace_seconds: float = Field(default=1.0, ge=0, le=30)
    flush_interval_seconds: float = Field(default=0.5, ge=0.1, le=5)
    queue_max_records: int = Field(default=100_000, ge=1000)
    ingest_max_records: int = Field(default=1000, ge=1, le=10_000)
    ingest_max_bytes: int = Field(default=1_048_576, ge=1024, le=8_388_608)

    # Real local agent (psutil + TCP connect probes). Off by default so demos are deterministic.
    system_agent_enabled: bool = False
    system_agent_interval_seconds: float = Field(default=2.0, ge=0.5, le=60)
    probe_targets: list[str] = ["1.1.1.1:443", "8.8.8.8:443"]

    saas_base_url: str = "http://127.0.0.1:9001"
    collector_token: SecretStr | None = None  # issued by SaaS at registration (Phase 4)
    ingest_token: SecretStr  # required by local telemetry sources to POST /api/v1/telemetry
    local_admin_token: SecretStr  # required by the local console API
    pseudonym_secret: SecretStr  # HMAC key for source pseudonyms; never leaves this machine
    web_origins: list[str] = ["http://localhost:5180", "http://127.0.0.1:5180"]

    @field_validator("host")
    @classmethod
    def _loopback_only(cls, v: str) -> str:
        # The collector console exposes raw (local-only) data: never bind beyond loopback.
        if v not in LOOPBACK_HOSTS:
            raise ValueError("collector must bind to a loopback address")
        return v

    @field_validator("local_admin_token", "pseudonym_secret", "ingest_token")
    @classmethod
    def _strong(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("must be at least 32 characters")
        return v


@lru_cache(maxsize=1)
def get_settings() -> CollectorSettings:
    return CollectorSettings()  # type: ignore[call-arg]
