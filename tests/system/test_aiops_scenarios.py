"""System test: simulator -> REAL collector pipeline (pseudonymise, window, egress ledger) ->
exact ledger JSON -> REAL AIOps engine. Simulated clock (no sleeping), no network, no DB.

Proves the Phase 6 detection targets on the official synthetic data source:
  S5 baseline deviation below static thresholds, S4 trend before threshold, S6 cascade -> one
  incident with the upstream network device as probable cause, S3 security incident, and a
  10-minute clean run with zero incidents (false-positive check).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from aegis_collector.config import REPO_CONFIG
from aegis_collector.pipeline.localconfig import load_inventory, load_thresholds
from aegis_collector.pipeline.runner import Pipeline
from aegis_collector.store import init_db
from saas_api.aiops.config import load as load_aiops
from saas_api.aiops.engine import AiopsEngine
from saas_api.health.engine import HealthEngine
from saas_api.health.thresholds import load as load_th

from simulator.generator import Generator
from simulator.scenarios import s3_failed_logins, s4_latency_ramp, s5_cpu_step, s6_cascade

TENANT = uuid.uuid4()
WARMUP_S = 120  # 60 windows per series: past the 30-window minimum baseline history
RATE = 80  # events/s across all series


class Harness:
    def __init__(self, db: Path) -> None:
        self.p = Pipeline(
            conn=init_db(db),
            collector_id="col_sys_01",
            pseudonym_secret="s" * 40,
            thresholds=load_thresholds(REPO_CONFIG / "health_thresholds.yaml"),
            inventory=load_inventory(REPO_CONFIG / "inventory.yaml"),
            window_seconds=2.0,
            grace_seconds=1.0,
        )
        self.now = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
        he = HealthEngine(load_th(str(REPO_CONFIG / "health_thresholds.yaml")))
        self.eng = AiopsEngine(
            load_aiops(str(REPO_CONFIG / "aiops.yaml")), he.classify, clock=lambda: self.now
        )
        self.seq = 0
        self.p.emit_topology()
        self.ship()

    def pid(self, source_id: str) -> str:
        return self.p.pseudo.pid(source_id)

    def ship(self) -> None:
        """Hand every new ledger entry (exact egress JSON) to the engine, as ingest would."""
        rows = self.p.conn.execute(
            "SELECT seq, kind, payload_json FROM egress_ledger WHERE seq > ? ORDER BY seq",
            (self.seq,),
        ).fetchall()
        metrics, security, edges = [], [], []
        for seq, kind, js in rows:
            self.seq = seq
            d = json.loads(js)
            if kind == "topology_edge":
                edges.append(d)
                continue
            d["window_end"] = datetime.fromisoformat(d["window_end_utc"])
            (metrics if kind == "metric_summary" else security).append(d)
        if edges:
            self.eng.observe_edges(TENANT, edges)
        if metrics:
            self.eng.observe_metrics(TENANT, "ap-south", metrics)
        if security:
            self.eng.observe_security(TENANT, "ap-south", security)

    def run(self, gen: Generator, start: datetime, seconds: float) -> None:
        tick = 0.5
        for k, batch in enumerate(gen.run_offline(start, seconds, RATE, tick=tick)):
            self.now = start + timedelta(seconds=(k + 1) * tick)
            if batch:
                self.p.process("simulator", batch)
            self.p.flush(now=self.now)
            self.ship()

    def incidents(self):
        return [i for i in self.eng.incidents.values() if i.tenant_id == TENANT]


@pytest.fixture
def h(tmp_path) -> Harness:
    return Harness(tmp_path / "sys.db")


def _scenario(h: Harness, scenario, after: float, seed: int = 11) -> None:
    start = h.now
    gen = Generator(seed=seed)
    gen.add_scenario(scenario, start + timedelta(seconds=WARMUP_S))
    h.run(gen, start, WARMUP_S + after)


def test_clean_10_minutes_has_zero_incidents(h):
    h.run(Generator(seed=5), h.now, 600)
    assert h.incidents() == [], [i.title for i in h.incidents()]
    assert h.eng.noise(TENANT)["alerts"] == 0


def test_s5_baseline_deviation_below_static_threshold(h):
    _scenario(h, s5_cpu_step(), after=40)
    (inc,) = h.incidents()
    alerts = h.eng._alerts_of(inc)  # noqa: SLF001
    assert {a.family for a in alerts} == {"BASELINE"}
    assert {a.entity_id for a in alerts} == {h.pid("SRV_002")}
    assert inc.root_entity == h.pid("SRV_002")
    ev = alerts[0].evidence
    assert ev["observed"] < 85 and ev["z"] >= 3.5  # below the static Fair threshold


def test_s4_trend_alert_precedes_threshold_alert(h):
    _scenario(h, s4_latency_ramp(), after=90)
    (inc,) = h.incidents()
    alerts = h.eng._alerts_of(inc)  # noqa: SLF001
    assert {a.entity_id for a in alerts} == {h.pid("NET_001")}
    rising = [a for a in alerts if a.code == "LATENCY_MS_RISING"]
    thresh = [a for a in alerts if a.family == "THRESHOLD"]
    assert rising and thresh
    assert rising[0].onset < thresh[0].onset  # early warning before the static threshold


def test_s6_cascade_one_incident_root_cause_network(h):
    _scenario(h, s6_cascade(), after=60)
    incs = h.incidents()
    assert len(incs) == 1, [i.title for i in incs]
    inc = incs[0]
    alerts = h.eng._alerts_of(inc)  # noqa: SLF001
    assert len(alerts) >= 4
    assert {h.pid("APP_001"), h.pid("APP_002"), h.pid("NET_001")} <= {a.entity_id for a in alerts}
    assert inc.root_entity == h.pid("NET_001")
    assert inc.explanation["probable_cause"]["status"] == "determined"
    assert "C-TOPO" in {c["rule"] for c in inc.correlation}
    assert h.eng.noise(TENANT)["ratio"] >= 4


def test_s3_failed_logins_security_incident(h):
    _scenario(h, s3_failed_logins(), after=40)
    incs = [i for i in h.incidents() if i.title.startswith("Repeated failed logins")]
    assert len(incs) == 1
    blob = json.dumps(incs[0].explanation)
    assert "failure_count" in blob and "@" not in blob
