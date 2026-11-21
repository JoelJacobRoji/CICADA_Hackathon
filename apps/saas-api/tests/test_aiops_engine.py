"""Unit tests: AIOps engine (deterministic, controllable clock, scenario-shaped signals)."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from saas_api.aiops.config import load as load_aiops
from saas_api.aiops.engine import AiopsEngine
from saas_api.config import REPO_CONFIG
from saas_api.health.engine import HealthEngine
from saas_api.health.thresholds import load as load_th

T0 = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
TENANT = uuid.uuid4()
NET, APP1, APP2, SRV = (f"src_{c * 16}" for c in "abcd")
UNIT = {
    "cpu_usage": "percent",
    "latency_ms": "ms",
    "packet_loss": "percent",
    "error_rate": "percent",
}
CAT = {
    "cpu_usage": "infrastructure",
    "latency_ms": "network",
    "packet_loss": "network",
    "error_rate": "application",
}


class Clock:
    def __init__(self) -> None:
        self.now = T0

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clk() -> Clock:
    return Clock()


@pytest.fixture
def eng(clk) -> AiopsEngine:
    he = HealthEngine(load_th(str(REPO_CONFIG / "health_thresholds.yaml")))
    return AiopsEngine(load_aiops(str(REPO_CONFIG / "aiops.yaml")), he.classify, clock=clk)


def row(pid, metric, v, i, kind="server", collector="col_t_01"):
    we = T0 + timedelta(seconds=2 * (i + 1))
    return {
        "source_pid": pid,
        "source_kind": kind,
        "metric": metric,
        "unit": UNIT[metric],
        "category": CAT[metric],
        "mean": v,
        "min": v,
        "window_end": we,
        "payload_id": uuid.uuid4(),
        "collector_id": collector,
    }


def feed(eng, clk, pid, metric, values, start=0, kind="server", collector="col_t_01"):
    changes = []
    for k, v in enumerate(values):
        clk.now = T0 + timedelta(seconds=2 * (start + k + 1))
        changes += eng.observe_metrics(
            TENANT, "ap-south", [row(pid, metric, v, start + k, kind, collector)]
        )
    return changes


def noisy(mean, sd, n, seed=1):
    r = random.Random(seed)
    return [r.gauss(mean, sd) for _ in range(n)]


def incidents(eng):
    return [i for i in eng.incidents.values() if i.tenant_id == TENANT]


def test_no_verdict_while_baseline_learning(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 29) + [80])  # spike before min_history
    assert incidents(eng) == []


def test_single_spike_is_transient_not_alert(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [80] + noisy(35, 2, 5, seed=2))
    assert incidents(eng) == []
    assert eng.noise(TENANT)["transients_suppressed"] == 1


def test_s5_baseline_deviation_below_static_threshold(eng, clk):
    ch = feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [80, 81, 79])
    (inc,) = incidents(eng)
    alerts = eng._alerts_of(inc)
    assert {a.family for a in alerts} == {"BASELINE"}  # 80% is only "Good": no threshold alert
    ev = alerts[0].evidence
    assert ev["detection"] == "robust_z" and ev["z"] >= 3.5 and 30 <= ev["baseline_median"] <= 40
    assert ev["history_n"] >= 30 and ev["windows"] >= 2
    x = inc.explanation
    assert x["probable_cause"]["entity"] == SRV
    assert any("statistical" in u for u in x["uncertainty"])
    assert x["recommendations"][0]["id"] == "BASELINE_CPU_USAGE"
    assert ch[0].kind == "opened"


def test_s4_trend_detected_before_threshold(eng, clk):
    base = noisy(20, 3, 40)
    ramp = [20 + (400 - 20) * k / 30 for k in range(1, 31)]
    feed(eng, clk, NET, "latency_ms", base + ramp, kind="network_device")
    (inc,) = incidents(eng)
    alerts = sorted(eng._alerts_of(inc), key=lambda a: a.first_seen)
    codes = [a.code for a in alerts]
    assert "LATENCY_MS_RISING" in codes
    assert any(c.startswith("LATENCY_MS_") and c != "LATENCY_MS_RISING" for c in codes)
    rising = next(a for a in alerts if a.code == "LATENCY_MS_RISING")
    thresh = next(a for a in alerts if a.family == "THRESHOLD")
    assert rising.first_seen < thresh.first_seen  # trend fired before the static threshold


def test_s6_cascade_one_incident_root_cause_upstream(eng, clk):
    eng.observe_edges(
        TENANT,
        [
            {"from_pid": APP1, "to_pid": NET, "relation": "routes_through"},
            {"from_pid": APP2, "to_pid": NET, "relation": "routes_through"},
        ],
    )
    feed(eng, clk, NET, "packet_loss", noisy(0.1, 0.05, 40), kind="network_device")
    feed(eng, clk, APP1, "latency_ms", noisy(80, 6, 40, 3), kind="application")
    feed(eng, clk, APP2, "latency_ms", noisy(80, 6, 40, 4), kind="application")
    feed(eng, clk, NET, "packet_loss", [8.0] * 12, start=40, kind="network_device")
    feed(eng, clk, APP1, "latency_ms", [400.0] * 6, start=50, kind="application")
    feed(eng, clk, APP2, "latency_ms", [390.0] * 6, start=50, kind="application")
    feed(
        eng,
        clk,
        APP1,
        "error_rate",
        noisy(0.5, 0.2, 40, 5) + [9.0] * 4,
        start=12,
        kind="application",
    )
    incs = incidents(eng)
    assert len(incs) == 1, [i.title for i in incs]
    inc = incs[0]
    alerts = eng._alerts_of(inc)
    assert len(alerts) >= 4
    assert inc.root_entity == NET
    assert inc.explanation["probable_cause"]["status"] == "determined"
    assert {c["rule"] for c in inc.correlation} >= {"C-TOPO"}
    assert any(r["id"] == "NET_UPSTREAM" for r in inc.explanation["recommendations"])
    assert eng.noise(TENANT)["ratio"] >= 4
    assert "affecting" in inc.title


def test_unrelated_simultaneous_failures_are_not_correlated_by_time(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40), collector="col_a_01")
    feed(
        eng,
        clk,
        NET,
        "packet_loss",
        noisy(0.1, 0.05, 40),
        kind="network_device",
        collector="col_b_01",
    )
    feed(eng, clk, SRV, "cpu_usage", [97.0] * 3, start=40, collector="col_a_01")
    feed(
        eng,
        clk,
        NET,
        "packet_loss",
        [12.0] * 3,
        start=40,
        kind="network_device",
        collector="col_b_01",
    )
    assert len(incidents(eng)) == 2


def test_site_rule_groups_network_alerts_from_one_collector(eng, clk):
    a, b, c = "src_" + "1" * 16, "src_" + "2" * 16, "src_" + "3" * 16
    for p in (a, b, c):
        feed(eng, clk, p, "packet_loss", noisy(0.1, 0.05, 40), kind="network_device")
    for p in (a, b, c):
        feed(eng, clk, p, "packet_loss", [12.0] * 3, start=40, kind="network_device")
    incs = incidents(eng)
    assert any(any(cr["rule"] == "C-SITE" for cr in i.correlation) for i in incs)
    assert max(len(i.alert_ids) for i in incs) >= 3


def test_duplicates_increment_not_multiply(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [97.0] * 10)
    (inc,) = incidents(eng)
    thr = [a for a in eng._alerts_of(inc) if a.family == "THRESHOLD"]
    assert len(thr) == 1 and thr[0].occurrences >= 8 and thr[0].dedup_hits >= 7


def test_alerts_and_incident_resolve_after_clear_period(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [97.0] * 3)
    clk.now += timedelta(seconds=121)
    ch = eng.sweep()
    (inc,) = incidents(eng)
    assert inc.status == "resolved" and any(c.kind == "resolved" for c in ch)


def test_security_incident_prioritised_with_counts_only(eng, clk):
    eng.observe_security(
        TENANT,
        "ap-south",
        [
            {
                "source_pid": SRV,
                "collector_id": "col_t_01",
                "risk_level": "high",
                "summary_code": "AUTH_FAILURE_BURST",
                "failure_count": 25,
                "distinct_user_count": 1,
                "distinct_src_count": 1,
                "window_end": T0,
                "payload_id": uuid.uuid4(),
            }
        ],
    )
    (inc,) = incidents(eng)
    assert inc.priority in ("P1", "P2")
    assert inc.title.startswith("Repeated failed logins")
    assert inc.explanation["recommendations"][0]["id"] == "SEC_AUTH_REVIEW"
    assert any("Only counts" in u for u in inc.explanation["uncertainty"])


def test_every_recommendation_cites_alerts_of_its_incident(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [97.0] * 4)
    for inc in incidents(eng):
        ids = {str(a) for a in inc.alert_ids}
        for r in inc.explanation["recommendations"]:
            assert r["evidence"] and set(r["evidence"]) <= ids and r["rationale"]


def test_evidence_strength_levels(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [80, 81])
    (inc,) = incidents(eng)
    assert inc.explanation["evidence_strength"]["level"] in ("Low", "Medium")
    feed(eng, clk, SRV, "cpu_usage", [82, 83, 97, 97, 97], start=42)
    assert inc.explanation["evidence_strength"]["level"] == "High"
    assert "Not a probability" in inc.explanation["evidence_strength"]["definition"]


def test_late_window_is_ignored(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40))
    eng.observe_metrics(TENANT, "ap-south", [row(SRV, "cpu_usage", 99.0, 5)])  # old window
    eng.observe_metrics(TENANT, "ap-south", [row(SRV, "cpu_usage", 99.0, 6)])
    assert incidents(eng) == []


def test_tenants_never_correlate_or_leak(eng, clk):
    other = uuid.uuid4()
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [97.0] * 3)
    clk.now += timedelta(seconds=1)
    for i in range(40):
        eng.observe_metrics(other, "ap-south", [row(SRV, "cpu_usage", 35.0 + (i % 3), i)])
    for i in range(40, 43):
        eng.observe_metrics(other, "ap-south", [row(SRV, "cpu_usage", 97.0, i)])
    mine = incidents(eng)
    theirs = [i for i in eng.incidents.values() if i.tenant_id == other]
    assert len(mine) == 1 and len(theirs) == 1 and mine[0].id != theirs[0].id
    assert eng.noise(other)["transients_suppressed"] == eng.transients.get(other, 0)


# ---- Regression (production, 2026-11-20 19:50): the baseline absorbed an incident's values, so
# the return to normal raised "down" deviations (false P1) and a repeat incident looked normal.


def test_return_to_normal_after_incident_is_not_an_incident(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [80.0] * 60)  # 2 min incident
    (first,) = incidents(eng)
    clk.now += timedelta(seconds=200)
    eng.sweep()
    assert first.status == "resolved"
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 60, seed=9), start=100)  # back to normal
    assert [i for i in incidents(eng) if i.status == "open"] == []


def test_repeat_incident_is_detected_again(eng, clk):
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [80.0] * 60)
    clk.now += timedelta(seconds=200)
    eng.sweep()
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 30, seed=4) + [80.0] * 3, start=100)
    opened = [i for i in incidents(eng) if i.status == "open"]
    assert len(opened) == 1
    ev = eng._alerts_of(opened[0])[0].evidence
    assert ev["direction"] == "up" and ev["baseline_median"] < 40  # baseline was not polluted


def test_drop_in_bad_when_high_metric_never_alerts(eng, clk):
    feed(eng, clk, NET, "packet_loss", noisy(1.0, 0.1, 40) + [0.0] * 10, kind="network_device")
    assert incidents(eng) == []


def test_persistent_new_level_is_adopted_after_adaptation_window(eng, clk):
    cfg = eng.cfg
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [60.0] * (cfg.adapt_after_windows + 160))
    s = eng.baselines.series[(TENANT, SRV, "cpu_usage")]
    import statistics

    assert statistics.median(s.hist) == 60.0  # the new normal, learned only after ~5 min


def test_warm_start_seed_excludes_incident_values(eng):
    key = (TENANT, SRV, "cpu_usage")
    eng.baselines.seed(key, noisy(35, 2, 100) + [80.0] * 40, T0)
    s = eng.baselines.series[key]
    assert max(s.hist) < 50 and len(s.hist) == 100


# ---- Regression (production e2e, 20:29): when the collector stopped, NO_DATA alerts joined the
# S5 incident via topology and the root cause flipped to the network device.


def _tr(etype, eid, code, to_state, clk):
    from types import SimpleNamespace

    return SimpleNamespace(
        entity_type=etype,
        entity_id=eid,
        to_state=to_state,
        tenant_id=TENANT,
        region="ap-south",
        at_utc=clk.now,
        reasons=[{"code": code}],
    )


def test_collector_outage_groups_no_data_and_keeps_real_root_cause(eng, clk):
    eng.observe_edges(
        TENANT,
        [
            {"from_pid": SRV, "to_pid": NET, "relation": "routes_through"},
            {"from_pid": APP1, "to_pid": NET, "relation": "routes_through"},
        ],
    )
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [80.0] * 3)
    (s5,) = incidents(eng)
    clk.now += timedelta(seconds=30)
    eng.observe_health(
        [
            _tr("source", NET, "NO_DATA", "Poor", clk),
            _tr("source", SRV, "NO_DATA", "Poor", clk),
            _tr("source", APP1, "NO_DATA", "Poor", clk),
            _tr("collector", "col_t_01", "HEARTBEAT_MISSING", "Poor", clk),  # same sweep, any order
        ]
    )
    assert s5.root_entity == SRV and s5.title.startswith("Baseline deviation")
    outage = next(
        i for i in incidents(eng) if any(eng.alerts[x].family == "OFFLINE" for x in i.alert_ids)
    )
    nodata = [eng.alerts[x] for x in outage.alert_ids if eng.alerts[x].family == "NO_DATA"]
    # every source's missing data is a symptom of the outage (C-COLLECTOR runs before C-SRC)
    assert {a.entity_id for a in nodata} == {NET, APP1, SRV}
    assert outage.title == "Collector col_t_01 offline"
    assert "C-COLLECTOR" in {c["rule"] for c in outage.correlation}


def test_summary_from_engine_memory_counts_open_and_signals(eng, clk):
    """K36: the dashboard summary comes from engine memory (no database), per tenant."""
    feed(eng, clk, SRV, "cpu_usage", noisy(35, 2, 40) + [97.0] * 10)
    (inc,) = incidents(eng)
    s = eng.summary(TENANT)
    assert s["open_by_priority"][inc.priority] == 1 and sum(s["open_by_priority"].values()) == 1
    assert s["incidents_total"] == 1
    signals = sum(a.occurrences for a in eng._alerts_of(inc))
    assert s["alerts_total"] == len(eng._alerts_of(inc))
    assert s["alert_signals_total"] == signals >= 8
    assert s["noise_reduction_ratio"] == round(signals / 1, 1)
    assert s["since"] == T0.isoformat()  # engine start time: totals are since then
    # resolved incidents leave the open counts but stay in the totals
    clk.now += timedelta(seconds=121)
    eng.sweep()
    s2 = eng.summary(TENANT)
    assert sum(s2["open_by_priority"].values()) == 0 and s2["incidents_total"] == 1
    # another tenant sees nothing of this one
    other = eng.summary(uuid.uuid4())
    assert other["incidents_total"] == 0 and other["noise_reduction_ratio"] is None
