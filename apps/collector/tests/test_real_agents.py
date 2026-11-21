"""Diversified REAL sources: storage, database and web readers + contract/inventory additions."""

from __future__ import annotations

import json
import time

import httpx
import pytest
from aegis_collector.adapters.real_agents import (
    DATABASE_ID,
    STORAGE_ID,
    WEB_ID,
    PostgresAgent,
    StorageAgent,
    WebAgent,
)
from aegis_collector.config import REPO_CONFIG
from aegis_collector.pipeline.localconfig import load_inventory, merge_inventories
from aegis_contracts.inbound import MetricEvent, parse_inbound
from aegis_contracts.outbound import SourceKind


def _metrics(records):
    events = [parse_inbound(r) for r in records]
    assert all(isinstance(e, MetricEvent) for e in events)  # contract-valid
    return {e.metric.value: e.value for e in events}


def test_storage_first_sample_primes_then_reports_rates():
    agent = StorageAgent()
    first = _metrics(agent.sample())
    assert set(first) == {"disk_usage"}  # no invented rates on the first sample
    time.sleep(0.05)
    second = _metrics(agent.sample())
    assert "disk_iops" in second and second["disk_iops"] >= 0
    assert all(r["source_id"] == STORAGE_ID for r in agent.sample())


class FakeConn:
    def __init__(self, rows):
        self.rows = rows

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql):
        assert sql.lstrip().upper().startswith("SELECT")  # read-only statistics query
        row = self.rows.pop(0)
        return type("R", (), {"fetchone": lambda _s: row})()


def test_postgres_rates_from_counter_deltas():
    rows = [(5, 1000, 10, 9000, 1000), (6, 1100, 20, 9900, 1100)]
    agent = PostgresAgent("unused", connect=lambda: FakeConn(rows))
    first = _metrics(agent.sample())
    assert first == {"service_up": 1.0, "db_connections": 5.0}
    agent._last = (agent._last[0] - 2.0, *agent._last[1:])  # 2 s between samples
    m = _metrics(agent.sample())
    assert m["db_connections"] == 6
    assert m["db_tps"] == pytest.approx(55.0, rel=0.05)  # (100 commits + 10 rollbacks) / 2 s
    assert m["error_rate"] == pytest.approx(100 * 10 / 110, rel=0.01)
    assert m["cache_hit_ratio"] == pytest.approx(100 * 900 / 1000, rel=0.01)


def test_postgres_down_is_reported_not_hidden():
    def boom():
        raise OSError("connection refused")

    m = _metrics(PostgresAgent("unused", connect=boom).sample())
    assert m == {"service_up": 0.0}


def _web_client(payloads):
    def handler(request: httpx.Request) -> httpx.Response:
        p = payloads.pop(0)
        return httpx.Response(200, json=p) if p is not None else httpx.Response(503)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_web_reader_rates_errors_latency_and_down():
    payloads = [
        {"requests_total": 100, "errors_total": 0, "latency_p95_ms": 40.0},
        {"requests_total": 160, "errors_total": 6, "latency_p95_ms": 55.5},
        None,
    ]
    agent = WebAgent("http://127.0.0.1:9300/metrics", client=_web_client(payloads))
    assert _metrics(agent.sample()) == {"service_up": 1.0, "latency_ms": 40.0}
    agent._last = (agent._last[0] - 2.0, *agent._last[1:])
    m = _metrics(agent.sample())
    assert m["request_rate"] == pytest.approx(30.0, rel=0.05)
    assert m["error_rate"] == pytest.approx(10.0)
    assert m["latency_ms"] == 55.5
    assert _metrics(agent.sample()) == {"service_up": 0.0}
    assert all(r["source_id"] == WEB_ID for r in agent.sample() or [{"source_id": WEB_ID}])


def test_web_agent_url_must_be_local(col_env, monkeypatch):
    from aegis_collector.config import get_settings

    monkeypatch.setenv("AEGIS_COL_WEB_AGENT_URL", "http://example.com/metrics")
    get_settings.cache_clear()
    with pytest.raises(Exception):  # noqa: B017 - pydantic validation error
        get_settings()
    monkeypatch.setenv("AEGIS_COL_WEB_AGENT_URL", "http://127.0.0.1:9300/metrics")
    get_settings.cache_clear()
    assert get_settings().web_agent_url == "http://127.0.0.1:9300/metrics"


def test_real_inventory_is_additive_and_kinds_are_new():
    sim = load_inventory(REPO_CONFIG / "inventory.yaml")
    real = load_inventory(REPO_CONFIG / "inventory.real.yaml")
    merged = merge_inventories(sim, real)
    assert set(sim.sources) <= set(merged.sources)  # nothing removed
    assert len(merged.sources) == len(sim.sources) + 3
    assert merged.kind_of(STORAGE_ID) == SourceKind.STORAGE
    assert merged.kind_of(DATABASE_ID) == SourceKind.DATABASE
    assert merged.kind_of(WEB_ID) == SourceKind.APPLICATION
    assert {(e.src, e.dst) for e in real.edges} == {
        (WEB_ID, DATABASE_ID),
        (DATABASE_ID, STORAGE_ID),
    }


def test_simulator_never_generates_data_for_real_sources():
    from simulator.generator import load_series

    ids = {s.source_id for s in load_series()}
    assert not ids & {STORAGE_ID, DATABASE_ID, WEB_ID}
    assert len(ids) == 9  # the existing synthetic sources, unchanged


def test_real_records_are_pseudonymised_and_leak_nothing(pipeline):
    pipeline.inventory = merge_inventories(
        pipeline.inventory, load_inventory(REPO_CONFIG / "inventory.real.yaml")
    )
    rows = [(5, 1000, 10, 9000, 1000), (6, 1100, 20, 9900, 1100)]
    pg = PostgresAgent(
        "postgresql://aegis_reader:secret-pw@127.0.0.1:55432/postgres",
        connect=lambda: FakeConn(rows),
    )
    pg.sample()
    pg._last = (pg._last[0] - 2.0, *pg._last[1:])
    accepted, rejected = pipeline.process("postgres_agent", pg.sample())
    assert accepted >= 4 and rejected == 0
    pipeline.flush(force=True)
    payloads = [
        json.loads(r[0]) for r in pipeline.conn.execute("SELECT payload_json FROM egress_ledger")
    ]
    db = [p for p in payloads if p.get("source_pid") == pipeline.pseudo.pid(DATABASE_ID)]
    assert db and all(p["source_kind"] == "database" for p in db)
    assert {"db_tps", "cache_hit_ratio", "db_connections"} <= {p["metric"] for p in db}
    blob = json.dumps(payloads)
    for secret in (DATABASE_ID, "aegis_reader", "secret-pw", "55432", "127.0.0.1"):
        assert secret not in blob
