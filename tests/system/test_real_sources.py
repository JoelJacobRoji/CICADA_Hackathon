"""Diversified REAL sources through the real pipeline + AIOps engine (records shaped exactly like
the storage / database / web readers emit). A storage problem that degrades the database and then
the web app must become ONE incident whose probable cause is the disk (reported dependencies)."""

from __future__ import annotations

import json
import random
import uuid
from datetime import UTC, datetime, timedelta

from aegis_collector.config import REPO_CONFIG
from aegis_collector.pipeline.localconfig import load_inventory, load_thresholds, merge_inventories
from aegis_collector.pipeline.runner import Pipeline
from aegis_collector.store import init_db
from saas_api.aiops.config import load as load_aiops
from saas_api.aiops.engine import AiopsEngine
from saas_api.health.engine import HealthEngine
from saas_api.health.thresholds import load as load_th

TENANT = uuid.uuid4()
STO, DB, WEB = "STO_LAPTOP_DISK", "DB_AEGIS_PG", "APP_WEB_DEMO"


def _rec(sid, metric, value, unit, cat, ts):
    return {
        "event_id": f"RAG_{uuid.uuid4().hex[:16]}",
        "source_id": sid,
        "event_timestamp": ts.isoformat(),
        "source_timezone": "UTC",
        "metric": metric,
        "value": value,
        "unit": unit,
        "category": cat,
    }


def test_storage_fault_cascades_to_db_and_web_as_one_incident(tmp_path):
    inv = merge_inventories(
        load_inventory(REPO_CONFIG / "inventory.yaml"),
        load_inventory(REPO_CONFIG / "inventory.real.yaml"),
    )
    p = Pipeline(
        conn=init_db(tmp_path / "c.db"),
        collector_id="col_real_01",
        pseudonym_secret="r" * 40,
        thresholds=load_thresholds(REPO_CONFIG / "health_thresholds.yaml"),
        inventory=inv,
        window_seconds=2.0,
        grace_seconds=1.0,
    )
    now = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)
    he = HealthEngine(load_th(str(REPO_CONFIG / "health_thresholds.yaml")))
    eng = AiopsEngine(load_aiops(str(REPO_CONFIG / "aiops.yaml")), he.classify, clock=lambda: now)
    seq = 0

    def ship() -> None:
        nonlocal seq
        rows = p.conn.execute(
            "SELECT seq, kind, payload_json FROM egress_ledger WHERE seq > ? ORDER BY seq", (seq,)
        ).fetchall()
        metrics, edges = [], []
        for s, kind, js in rows:
            seq = s
            d = json.loads(js)
            if kind == "topology_edge":
                edges.append(d)
            elif kind == "metric_summary":
                d["window_end"] = datetime.fromisoformat(d["window_end_utc"])
                metrics.append(d)
        if edges:
            eng.observe_edges(TENANT, edges)
        if metrics:
            eng.observe_metrics(TENANT, "ap-south", metrics)

    p.emit_topology()
    ship()
    rng = random.Random(3)  # noqa: S311
    start = now
    for k in range(int(260 / 0.5)):
        t = k * 0.5
        now = start + timedelta(seconds=t)
        lat = rng.gauss(4, 0.6) if t < 150 else rng.gauss(80, 5)  # disk latency fault at t=150 s
        db_err = rng.gauss(0.3, 0.1) if t < 170 else rng.gauss(12, 1)  # DB rollbacks 20 s later
        web_err = rng.gauss(0.4, 0.1) if t < 180 else rng.gauss(18, 2)  # web 5xx 30 s later
        recs = [
            _rec(STO, "disk_latency_ms", max(lat, 0.1), "ms", "infrastructure", now),
            _rec(STO, "disk_iops", max(rng.gauss(120, 10), 0), "ops", "infrastructure", now),
            _rec(DB, "error_rate", max(db_err, 0), "percent", "application", now),
            _rec(DB, "db_tps", max(rng.gauss(55, 4), 0), "rps", "application", now),
            _rec(
                DB, "cache_hit_ratio", min(rng.gauss(99, 0.3), 100), "percent", "application", now
            ),
            _rec(WEB, "error_rate", max(web_err, 0), "percent", "application", now),
            _rec(WEB, "request_rate", max(rng.gauss(8, 1), 0), "rps", "application", now),
        ]
        p.process("real_agents", recs)
        p.flush(now=now)
        ship()

    incs = [i for i in eng.incidents.values() if i.tenant_id == TENANT]
    assert len(incs) == 1, [i.title for i in incs]
    inc = incs[0]
    entities = {a.entity_id for a in eng._alerts_of(inc)}  # noqa: SLF001
    assert {p.pseudo.pid(STO), p.pseudo.pid(DB), p.pseudo.pid(WEB)} <= entities
    assert inc.root_entity == p.pseudo.pid(STO)  # most upstream + earliest = the disk
    assert "C-TOPO" in {c["rule"] for c in inc.correlation}
    assert inc.explanation["probable_cause"]["entity_kind"] == "storage"
    blob = "".join(r[0] for r in p.conn.execute("SELECT payload_json FROM egress_ledger"))
    assert STO not in blob and DB not in blob and WEB not in blob  # pseudonymous egress only
