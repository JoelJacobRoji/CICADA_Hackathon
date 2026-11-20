from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from urllib.parse import urlsplit, urlunsplit

import pytest
from saas_api.config import get_settings
from saas_api.db import app_engine
from sqlalchemy import create_engine, text

UNREACHABLE = "postgresql://nobody:nothing@127.0.0.1:1/none"


@pytest.fixture
def unit_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Settings that never touch a real database."""
    monkeypatch.setenv("AEGIS_SAAS_ENV", "test")
    monkeypatch.setenv("AEGIS_SAAS_DB_APP_URL_AP_SOUTH", UNREACHABLE)
    monkeypatch.setenv("AEGIS_SAAS_DB_APP_URL_EU_WEST", UNREACHABLE)
    monkeypatch.setenv("AEGIS_SAAS_JWT_SIGNING_KEY", "x" * 48)
    get_settings.cache_clear()
    app_engine.cache_clear()
    yield
    get_settings.cache_clear()
    app_engine.cache_clear()


def _with_db(url: str, dbname: str) -> str:
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, "/" + dbname, p.query, p.fragment))


def _with_user(url: str, user: str, password: str) -> str:
    p = urlsplit(url)
    host = p.netloc.split("@", 1)[-1]
    return urlunsplit((p.scheme, f"{user}:{password}@{host}", p.path, p.query, p.fragment))


@pytest.fixture
def temp_region_db(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
    """Create a throwaway database on the LOCAL test Postgres and migrate it as region ap-south.

    Requires AEGIS_TEST_DB_ADMIN_URL (superuser URL of the local docker Postgres) and
    AEGIS_SAAS_DB_APP_PASSWORD (same value as the dev .env so the shared role keeps working).
    """
    admin = os.environ.get("AEGIS_TEST_DB_ADMIN_URL")
    if not admin:
        pytest.skip("AEGIS_TEST_DB_ADMIN_URL not set (local Postgres integration tests)")
    get_settings.cache_clear()
    app_pw = get_settings().db_app_password  # from env or apps/saas-api/.env
    if app_pw is None:
        pytest.skip("AEGIS_SAAS_DB_APP_PASSWORD not configured")

    dbname = f"aegis_test_{uuid.uuid4().hex[:10]}"
    admin_engine = create_engine(
        admin.replace("postgresql://", "postgresql+psycopg://"), isolation_level="AUTOCOMMIT"
    )
    with admin_engine.connect() as c:
        c.execute(text(f'CREATE DATABASE "{dbname}"'))

    owner_url = _with_db(admin, dbname)
    app_url = _with_user(owner_url, "aegis_app", app_pw.get_secret_value())
    for region in ("AP_SOUTH", "EU_WEST"):
        monkeypatch.setenv(f"AEGIS_SAAS_DB_OWNER_URL_{region}", owner_url)
        monkeypatch.setenv(f"AEGIS_SAAS_DB_APP_URL_{region}", app_url)
    monkeypatch.setenv("AEGIS_SAAS_JWT_SIGNING_KEY", "x" * 48)
    get_settings.cache_clear()
    app_engine.cache_clear()
    try:
        yield {"owner_url": owner_url, "app_url": app_url, "dbname": dbname}
    finally:
        app_engine.cache_clear()
        get_settings.cache_clear()
        with admin_engine.connect() as c:
            c.execute(
                text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :d"),
                {"d": dbname},
            )
            c.execute(text(f'DROP DATABASE IF EXISTS "{dbname}"'))
        admin_engine.dispose()
