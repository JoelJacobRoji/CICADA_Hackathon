from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from saas_api.config import Settings
from saas_api.db import tenant_connection
from saas_api.logs import REDACTED, redact_sensitive
from sqlalchemy import create_engine, text

APP_DIR = Path(__file__).resolve().parents[1]


# ---------- unit ----------


def test_healthz_and_time(unit_env):
    from saas_api.main import create_app

    client = TestClient(create_app())
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    t = client.get("/api/v1/time").json()["utc"]
    assert t.endswith("+00:00")


def test_readyz_reports_unavailable_without_leaking_details(unit_env):
    from saas_api.main import create_app

    r = TestClient(create_app()).get("/readyz")
    assert r.status_code == 503
    body = r.text
    assert "nobody" not in body and "127.0.0.1" not in body
    assert r.json()["regions"] == {"ap-south": "unavailable", "eu-west": "unavailable"}


def test_weak_jwt_key_rejected(monkeypatch):
    monkeypatch.setenv("AEGIS_SAAS_JWT_SIGNING_KEY", "short")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, db_app_url_ap_south="x", db_app_url_eu_west="x")  # type: ignore[call-arg]


def test_settings_repr_hides_secrets(unit_env):
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert "x" * 48 not in repr(s)
    assert "nothing" not in repr(s)


def test_log_redaction():
    out = redact_sensitive(
        None,
        "info",
        {"event": "x", "authorization": "Bearer abc", "db_url": "postgresql://u:p@h/d", "n": 1},
    )
    assert out["authorization"] == REDACTED and out["db_url"] == REDACTED and out["n"] == 1
    assert "abc" not in json.dumps(out)


# ---------- integration (local Postgres) ----------


def _migrate():
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(APP_DIR / "alembic.ini"))
    cfg.cmd_opts = argparse.Namespace(x=["region=ap-south"])
    command.upgrade(cfg, "head")


@pytest.mark.integration
def test_migration_and_rls_isolation(temp_region_db):
    _migrate()
    a, b = uuid.uuid4(), uuid.uuid4()
    owner = create_engine(
        temp_region_db["owner_url"].replace("postgresql://", "postgresql+psycopg://")
    )
    with owner.begin() as c:
        c.execute(
            text(
                "INSERT INTO aegis.tenants (id, slug, name, region) VALUES "
                "(:a, 'tenant-a', 'Tenant A', 'ap-south'), (:b, 'tenant-b', 'Tenant B', 'ap-south')"
            ),
            {"a": a, "b": b},
        )
    owner.dispose()

    app = create_engine(temp_region_db["app_url"].replace("postgresql://", "postgresql+psycopg://"))
    with app.connect() as c:
        # No tenant context -> RLS hides everything.
        assert c.execute(text("SELECT count(*) FROM aegis.tenants")).scalar_one() == 0
        # The role really is subject to RLS (not superuser, no BYPASSRLS).
        row = c.execute(
            text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
        ).one()
        assert row == (False, False)
        # aegis_app cannot write tenants.
        with pytest.raises(Exception):  # noqa: B017
            c.execute(
                text("INSERT INTO aegis.tenants VALUES (gen_random_uuid(),'x-x-x','x','ap-south')")
            )
    app.dispose()

    with tenant_connection("ap-south", a) as c:
        slugs = [r[0] for r in c.execute(text("SELECT slug FROM tenants"))]
    assert slugs == ["tenant-a"]
    with tenant_connection("ap-south", b) as c:
        slugs = [r[0] for r in c.execute(text("SELECT slug FROM tenants"))]
    assert slugs == ["tenant-b"]


@pytest.mark.integration
def test_readyz_ok_against_real_db(temp_region_db):
    _migrate()
    from saas_api.main import create_app

    r = TestClient(create_app()).get("/readyz")
    assert r.status_code == 200 and r.json()["status"] == "ready"
