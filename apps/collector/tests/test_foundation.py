from __future__ import annotations

import pytest
from aegis_collector.config import CollectorSettings
from aegis_collector.store import init_db, journal_mode
from fastapi.testclient import TestClient
from pydantic import ValidationError


def test_store_tables_and_wal(tmp_path):
    conn = init_db(tmp_path / "c.db")
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"raw_events", "egress_ledger", "outbox", "dead_letter", "pseudonyms", "meta"} <= names
    assert journal_mode(conn) == "wal"
    assert conn.execute("PRAGMA synchronous").fetchone()[0] == 2  # FULL


def test_sending_rows_reset_to_pending_on_restart(tmp_path):
    db = tmp_path / "c.db"
    conn = init_db(db)
    conn.execute(
        "INSERT INTO egress_ledger (payload_id, kind, payload_json, sha256, prev_hash, chain_hash,"
        " created_at) VALUES ('p1','metric_summary','{}','h','0','c','t')"
    )
    conn.execute(
        "INSERT INTO outbox (payload_id, status, next_attempt_at, created_at)"
        " VALUES ('p1','sending','t','t')"
    )
    conn.close()
    conn = init_db(db)
    assert conn.execute("SELECT status FROM outbox").fetchone()[0] == "pending"


def test_outbox_requires_ledger_entry(tmp_path):
    conn = init_db(tmp_path / "c.db")
    with pytest.raises(Exception):  # noqa: B017 - FK violation
        conn.execute(
            "INSERT INTO outbox (payload_id, status, next_attempt_at, created_at)"
            " VALUES ('ghost','pending','t','t')"
        )


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.10"])  # noqa: S104
def test_collector_refuses_non_loopback_bind(col_env, host):
    with pytest.raises(ValidationError):
        CollectorSettings(_env_file=None, host=host)  # type: ignore[call-arg]


def test_weak_secrets_rejected(monkeypatch):
    monkeypatch.setenv("AEGIS_COL_LOCAL_ADMIN_TOKEN", "short")
    monkeypatch.setenv("AEGIS_COL_PSEUDONYM_SECRET", "b" * 40)
    monkeypatch.setenv("AEGIS_COL_INGEST_TOKEN", "c" * 40)
    with pytest.raises(ValidationError):
        CollectorSettings(_env_file=None)  # type: ignore[call-arg]


def test_healthz(col_env):
    from aegis_collector.main import create_app

    with TestClient(create_app()) as client:
        r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["journal_mode"] == "wal" and r.json()["status"] == "ok"
    assert (col_env / "collector.db").exists()
