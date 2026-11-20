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
    # Settings require the DB URLs and signing key. Provide placeholders FIRST so this works with
    # no apps/saas-api/.env (CI); the real temp-DB URLs are set below once the DB exists.
    for region in ("AP_SOUTH", "EU_WEST"):
        monkeypatch.setenv(f"AEGIS_SAAS_DB_APP_URL_{region}", UNREACHABLE)
    monkeypatch.setenv("AEGIS_SAAS_JWT_SIGNING_KEY", "x" * 48)
    get_settings.cache_clear()
    app_pw = get_settings().db_app_password  # env (CI) or apps/saas-api/.env (local)
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


# ---------------------------------------------------------------------------------------------
# Phase 4: two regional databases + seeded tenants
# ---------------------------------------------------------------------------------------------


def _migrate_region(region: str) -> None:
    import argparse
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.cmd_opts = argparse.Namespace(x=[f"region={region}"])
    command.upgrade(cfg, "head")


def _clear_caches() -> None:
    from saas_api.db import owner_engine

    for eng_cache in (app_engine, owner_engine):
        for region in ("ap-south", "eu-west"):
            try:
                if eng_cache.cache_info().currsize:
                    eng_cache(region).dispose()
            except Exception:  # noqa: BLE001, S110
                pass
        eng_cache.cache_clear()
    get_settings.cache_clear()


@pytest.fixture
def regions(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, dict[str, str]]]:
    """Two throwaway databases on the local test Postgres: one per AEGIS region, both migrated."""
    admin = os.environ.get("AEGIS_TEST_DB_ADMIN_URL")
    if not admin:
        pytest.skip("AEGIS_TEST_DB_ADMIN_URL not set (local Postgres integration tests)")
    for region in ("AP_SOUTH", "EU_WEST"):
        monkeypatch.setenv(f"AEGIS_SAAS_DB_APP_URL_{region}", UNREACHABLE)
    monkeypatch.setenv("AEGIS_SAAS_JWT_SIGNING_KEY", "x" * 48)
    monkeypatch.setenv("AEGIS_SAAS_LOGIN_MAX_ATTEMPTS_PER_MINUTE", "100")
    get_settings.cache_clear()
    app_pw = get_settings().db_app_password
    if app_pw is None:
        pytest.skip("AEGIS_SAAS_DB_APP_PASSWORD not configured")

    admin_engine = create_engine(
        admin.replace("postgresql://", "postgresql+psycopg://"), isolation_level="AUTOCOMMIT"
    )
    out: dict[str, dict[str, str]] = {}
    suffix = uuid.uuid4().hex[:8]
    for region, env in (("ap-south", "AP_SOUTH"), ("eu-west", "EU_WEST")):
        dbname = f"aegis_t_{env.lower()}_{suffix}"
        with admin_engine.connect() as c:
            c.execute(text(f'CREATE DATABASE "{dbname}"'))
        owner = _with_db(admin, dbname)
        app = _with_user(owner, "aegis_app", app_pw.get_secret_value())
        monkeypatch.setenv(f"AEGIS_SAAS_DB_OWNER_URL_{env}", owner)
        monkeypatch.setenv(f"AEGIS_SAAS_DB_APP_URL_{env}", app)
        out[region] = {"dbname": dbname, "owner_url": owner, "app_url": app}
    _clear_caches()
    for region in out:
        _migrate_region(region)
    try:
        yield out
    finally:
        _clear_caches()
        with admin_engine.connect() as c:
            for info in out.values():
                c.execute(
                    text(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :d"
                    ),
                    {"d": info["dbname"]},
                )
                c.execute(text(f'DROP DATABASE IF EXISTS "{info["dbname"]}"'))
        admin_engine.dispose()


@pytest.fixture
def seeded(regions) -> dict[str, dict[str, object]]:
    """acme + initech in ap-south, globex in eu-west; one operator + one collector each."""
    from saas_api import admin as adm

    out: dict[str, dict[str, object]] = {}
    for slug, region in (("acme", "ap-south"), ("initech", "ap-south"), ("globex", "eu-west")):
        t = adm.create_tenant(slug, slug.title(), region)
        pw = f"pw-{slug}-" + uuid.uuid4().hex
        adm.create_user(t, f"ops@{slug}.example", "tenant_operator", pw)
        col = f"col_{slug}_01"
        token = adm.register_collector(t, col)
        out[slug] = {
            "tenant": t,
            "region": region,
            "email": f"ops@{slug}.example",
            "password": pw,
            "collector_id": col,
            "token": token,
        }
    return out


@pytest.fixture
def api(regions):
    from fastapi.testclient import TestClient
    from saas_api.main import create_app

    return TestClient(create_app())
