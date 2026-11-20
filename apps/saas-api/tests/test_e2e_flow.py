"""End to end: simulator -> collector pipeline -> egress ledger -> sender -> SaaS -> Postgres.

Proves (M3 / S1 / T4 groundwork):
- every ledgered payload is stored exactly once,
- SaaS payload_sha256 == collector ledger sha256 for every payload (egress proof matches receipt),
- S1 fake secrets and raw identifiers appear nowhere in the SaaS database,
- a replay of the whole outbox creates zero duplicate rows,
- an auth failure keeps everything queued (nothing dropped).
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta

import pytest
from aegis_collector.config import REPO_CONFIG
from aegis_collector.egress.sender import Sender
from aegis_collector.pipeline.localconfig import load_inventory, load_thresholds
from aegis_collector.pipeline.runner import Pipeline
from aegis_collector.store import init_db
from fastapi.testclient import TestClient
from saas_api.db import owner_connection
from sqlalchemy import text

from simulator.generator import Generator
from simulator.scenarios import FAKE_SECRETS, s1_secret_log, s3_failed_logins

pytestmark = pytest.mark.integration


def create_app():
    """Lazy import: importing saas_api.main builds the app, which needs settings.
    At module import time the test DB settings do not exist yet (CI has no .env, K16)."""
    from saas_api.main import create_app as _create_app

    return _create_app()


def _pipeline(tmp_path, collector_id: str) -> Pipeline:
    return Pipeline(
        conn=init_db(tmp_path / "collector.db"),
        collector_id=collector_id,
        pseudonym_secret="p" * 40,
        thresholds=load_thresholds(REPO_CONFIG / "health_thresholds.yaml"),
        inventory=load_inventory(REPO_CONFIG / "inventory.yaml"),
    )


SAAS_TABLES = (
    "metric_summaries",
    "security_summaries",
    "topology_edges",
    "ingest_receipts",
    "heartbeats",
    "audit_log",
    "collectors",
)


def _saas_dump(region: str) -> dict[str, str]:
    with owner_connection(region) as c:
        return {
            t: json.dumps([list(r) for r in c.execute(text(f"SELECT * FROM {t}"))], default=str)
            for t in SAAS_TABLES
        }


def test_end_to_end_flow(tmp_path, regions, seeded, capsys):
    acme = seeded["acme"]
    p = _pipeline(tmp_path, acme["collector_id"])
    p.emit_topology()
    start = datetime.now(UTC) - timedelta(seconds=40)
    gen = Generator(seed=11)
    gen.add_scenario(s1_secret_log(), start + timedelta(seconds=2))
    gen.add_scenario(s3_failed_logins(), start + timedelta(seconds=3))
    for batch in gen.run_offline(start, 30, 100):
        p.process("simulator", batch)
    p.flush(force=True)

    with TestClient(create_app()) as api:
        sender = Sender(
            conn=p.conn, lock=p.lock, client=api, region="ap-south", token=acme["token"]
        )
        res = sender.drain()
        assert res.status == "ok" and res.rejected == 0

        ledger = dict(p.conn.execute("SELECT payload_id, sha256 FROM egress_ledger").fetchall())
        assert len(ledger) > 400  # ~15 windows x 29 series + 10 edges + security summaries
        statuses = dict(
            p.conn.execute("SELECT status, count(*) FROM outbox GROUP BY status").fetchall()
        )
        assert statuses == {"delivered": len(ledger)}

        with owner_connection("ap-south") as c:
            saas = {}
            for t in ("metric_summaries", "security_summaries", "topology_edges"):
                saas.update(
                    {
                        str(r[0]): r[1]
                        for r in c.execute(text(f"SELECT payload_id, payload_sha256 FROM {t}"))
                    }
                )
        # exactly once, and byte-identical to the egress proof
        assert set(saas) == set(ledger)
        mismatched = [pid for pid, h in ledger.items() if saas[pid] != h]
        assert mismatched == []

        # S1/S3: nothing sensitive or raw-identifying reached the SaaS (DB or logs)
        dump = _saas_dump("ap-south")
        needles = [
            *FAKE_SECRETS.values(),
            "SRV_001",
            "SRV_002",
            "svc_billing",
            "Failed password",
            "TENANT_01",
        ]
        leaks = {(t, n) for t, d in dump.items() for n in needles if n in d}
        # S3's raw username is "admin" - match it as a standalone word, so the SaaS's own audit
        # actor "platform_admin" is not mistaken for leaked collector data.
        leaks |= {(t, "admin") for t, d in dump.items() if re.search(r"(?<![A-Za-z_])admin\b", d)}
        assert leaks == set(), f"raw data reached the SaaS: {sorted(leaks)}"
        assert "platform_admin" in dump["audit_log"]  # sanity: the false-positive source is known
        out = capsys.readouterr()
        for secret in FAKE_SECRETS.values():
            assert secret not in out.out + out.err

        # Replay EVERYTHING (simulates lost acks after an outage): zero new rows.
        p.conn.execute(
            "UPDATE outbox SET status='pending', next_attempt_at='1970-01-01T00:00:00+00:00'"
        )
        replay = sender.drain()
        assert replay.accepted == 0 and replay.duplicate == len(ledger)
        with owner_connection("ap-south") as c:
            n = sum(
                c.execute(text(f"SELECT count(*) FROM {t}")).scalar_one()
                for t in ("metric_summaries", "security_summaries", "topology_edges")
            )
        assert n == len(ledger)


def test_auth_failure_keeps_everything_queued(tmp_path, regions, seeded):
    acme = seeded["acme"]
    p = _pipeline(tmp_path, acme["collector_id"])
    start = datetime.now(UTC) - timedelta(seconds=20)
    for batch in Generator(seed=12).run_offline(start, 5, 50):
        p.process("simulator", batch)
    p.flush(force=True)
    queued = p.conn.execute("SELECT count(*) FROM outbox").fetchone()[0]
    with TestClient(create_app()) as api:
        s = Sender(conn=p.conn, lock=p.lock, client=api, region="ap-south", token="x" * 43)
        r = s.send_once()
    assert r.status == "auth_error" and s.state == "auth_error"
    rows = dict(p.conn.execute("SELECT status, count(*) FROM outbox GROUP BY status").fetchall())
    assert rows == {"pending": queued}  # nothing dropped, nothing marked delivered


def test_network_failure_backs_off_and_recovers(tmp_path, regions, seeded):
    import httpx

    acme = seeded["acme"]
    p = _pipeline(tmp_path, acme["collector_id"])
    for batch in Generator(seed=13).run_offline(datetime.now(UTC) - timedelta(seconds=20), 5, 50):
        p.process("simulator", batch)
    p.flush(force=True)
    dead = httpx.Client(base_url="http://127.0.0.1:1", timeout=0.5)  # SaaS unreachable
    s = Sender(conn=p.conn, lock=p.lock, client=dead, region="ap-south", token=acme["token"])
    assert s.send_once().status == "network_error"
    row = p.conn.execute("SELECT min(attempts), min(next_attempt_at) FROM outbox").fetchone()
    assert row[0] == 1 and row[1] > datetime.now(UTC).isoformat()  # scheduled in the future
    # SaaS "comes back": make everything due now and deliver with a working client.
    p.conn.execute("UPDATE outbox SET next_attempt_at='1970-01-01T00:00:00+00:00'")
    with TestClient(create_app()) as api:
        s.client = api
        res = s.drain()
    assert res.status == "ok"
    assert dict(
        p.conn.execute("SELECT status, count(*) FROM outbox GROUP BY status").fetchall()
    ).keys() == {"delivered"}


def test_collector_heartbeat_reaches_fleet_view(tmp_path, regions, seeded):
    from aegis_collector.egress import heartbeat as hb

    acme = seeded["acme"]
    p = _pipeline(tmp_path, acme["collector_id"])
    beat = hb.build(
        collector_id=acme["collector_id"],
        region="ap-south",
        cfg_hash=hb.config_hash(REPO_CONFIG),
        depth=0,
        oldest_age=0.0,
        adapters={"sender": hb.AdapterStatus.OK, "system_agent": hb.AdapterStatus.DISABLED},
    )
    with TestClient(create_app()) as api:
        assert hb.send(api, acme["token"], beat) == 204
        api.post("/api/v1/auth/login", json={"email": acme["email"], "password": acme["password"]})
        (col,) = api.get("/api/v1/collectors").json()
    assert col["id"] == acme["collector_id"] and col["connectivity"] == "online"
    assert col["collector_version"] == "0.1.0" and col["config_hash"] == beat.config_hash
    assert {a["name"] for a in col["adapters"]} == {"sender", "system_agent"}
    p.conn.close()
