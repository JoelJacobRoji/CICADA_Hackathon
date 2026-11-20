"""Unit tests: four-state health engine (pure logic, controllable clock)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from saas_api.config import REPO_CONFIG
from saas_api.health.engine import (
    DEGRADE_WINDOWS,
    EXCELLENT,
    FAIR,
    GOOD,
    POOR,
    RECOVER_WINDOWS,
    HealthEngine,
)
from saas_api.health.thresholds import load

T0 = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
TENANT = uuid.uuid4()
PID = "src_00000000000000a1"


class Clock:
    def __init__(self) -> None:
        self.now = T0

    def __call__(self) -> datetime:
        return self.now

    def tick(self, s: float) -> None:
        self.now += timedelta(seconds=s)


@pytest.fixture
def clk() -> Clock:
    return Clock()


@pytest.fixture
def eng(clk) -> HealthEngine:
    return HealthEngine(load(str(REPO_CONFIG / "health_thresholds.yaml")), clock=clk)


def row(i: int, metric="cpu_usage", mean=35.0, minimum=None, unit="percent", pid=PID):
    we = T0 + timedelta(seconds=2 * (i + 1))
    return {
        "source_pid": pid,
        "source_kind": "server",
        "metric": metric,
        "unit": unit,
        "mean": mean,
        "min": mean if minimum is None else minimum,
        "window_end": we,
    }


def feed(eng, clk, values, metric="cpu_usage", start=0, unit="percent"):
    trans = []
    for k, v in enumerate(values):
        clk.tick(2)
        trans += eng.observe_metrics(TENANT, "ap-south", [row(start + k, metric, v, unit=unit)])
    return trans


def state(eng, etype="source", eid=PID):
    return eng.get(TENANT, etype, eid)["state"]


@pytest.mark.parametrize(
    "value,expected",
    [(70, EXCELLENT), (70.1, GOOD), (85, GOOD), (85.1, FAIR), (95, FAIR), (95.1, POOR)],
)
def test_threshold_boundaries(eng, value, expected):
    assert eng.classify("cpu_usage", value, value, "percent", T0).state == expected


def test_binary_zero_is_critical_poor(eng):
    t = eng.classify("service_up", 0.7, 0.0, "bool", T0)
    assert t.state == POOR and t.critical


def test_first_observation_sets_state_and_initial_transition(eng, clk):
    trans = feed(eng, clk, [35])
    assert state(eng) == EXCELLENT
    src = [t for t in trans if t.entity_type == "source"]
    assert src and src[0].from_state is None and src[0].to_state == EXCELLENT
    assert src[0].at_utc.tzinfo is not None  # UTC timestamped


def test_degrade_needs_two_windows_with_reasons(eng, clk):
    feed(eng, clk, [35])
    feed(eng, clk, [90], start=1)
    v = eng.get(TENANT, "source", PID)
    assert v["state"] == EXCELLENT
    assert any(r["code"] == "PENDING_DEGRADE" for r in v["reasons"])
    trans = feed(eng, clk, [91], start=2)
    assert state(eng) == FAIR and DEGRADE_WINDOWS == 2
    t = next(t for t in trans if t.entity_type == "source")
    assert (t.from_state, t.to_state) == (EXCELLENT, FAIR)
    reason = next(r for r in t.reasons if r["code"] == "CPU_USAGE_FAIR")
    assert reason["observed"] == 91 and reason["threshold"] == 85 and reason["unit"] == "percent"


def test_single_spike_does_not_degrade(eng, clk):
    feed(eng, clk, [35, 92, 35, 35])
    assert state(eng) == EXCELLENT


def test_critical_degrades_immediately(eng, clk):
    feed(eng, clk, [1], metric="service_up", unit="bool")
    trans = eng.observe_metrics(TENANT, "ap-south", [row(1, "service_up", 0.5, 0.0, "bool")])
    assert state(eng) == POOR
    assert any(r.get("critical") for t in trans for r in t.reasons)


def test_recovery_one_level_per_five_better_windows(eng, clk):
    feed(eng, clk, [96, 96])  # -> Poor after 2 windows
    assert state(eng) == POOR
    feed(eng, clk, [30] * (RECOVER_WINDOWS - 1), start=2)
    assert state(eng) == POOR  # held
    v = eng.get(TENANT, "source", PID)
    assert any(r["code"] == "RECOVERING" for r in v["reasons"])
    feed(eng, clk, [30], start=2 + RECOVER_WINDOWS - 1)
    assert state(eng) == FAIR  # one level, not straight to Excellent
    feed(eng, clk, [30] * RECOVER_WINDOWS, start=2 + RECOVER_WINDOWS)
    assert state(eng) == GOOD


def test_worst_metric_wins_and_all_factors_listed(eng, clk):
    for i in range(3):
        clk.tick(2)
        eng.observe_metrics(
            TENANT,
            "ap-south",
            [
                row(i, "cpu_usage", 80),
                row(i, "memory_usage", 90),
            ],
        )
    v = eng.get(TENANT, "source", PID)
    assert v["state"] == FAIR
    codes = {r["code"] for r in v["reasons"]}
    assert {"CPU_USAGE_GOOD", "MEMORY_USAGE_FAIR"} <= codes


def test_staleness_downgrades_then_clears(eng, clk):
    feed(eng, clk, [35])
    clk.tick(11)
    eng.sweep()
    v = eng.get(TENANT, "source", PID)
    assert v["state"] == FAIR and v["reasons"][-1]["code"] == "STALE_DATA"
    clk.tick(20)  # 31 s without data
    eng.sweep()
    assert state(eng) == POOR
    assert eng.get(TENANT, "source", PID)["reasons"][-1]["code"] == "NO_DATA"
    feed(eng, clk, [35], start=10)  # data returns -> overlay cleared immediately
    assert state(eng) == EXCELLENT


def test_late_window_never_changes_state(eng, clk):
    feed(eng, clk, [35, 35, 35], start=5)
    clk.tick(1)
    eng.observe_metrics(TENANT, "ap-south", [row(0, "cpu_usage", 99)])  # older window, late
    eng.observe_metrics(TENANT, "ap-south", [row(1, "cpu_usage", 99)])
    assert state(eng) == EXCELLENT


def test_security_high_is_poor_then_expires(eng, clk):
    feed(eng, clk, [35])
    eng.observe_security(
        TENANT,
        "ap-south",
        [
            {
                "source_pid": PID,
                "risk_level": "high",
                "summary_code": "AUTH_FAILURE_BURST",
                "failure_count": 25,
                "distinct_user_count": 1,
                "window_end": clk.now,
            }
        ],
    )
    v = eng.get(TENANT, "source", PID)
    assert v["state"] == POOR and v["reasons"][-1]["code"] == "SECURITY_AUTH_FAILURE_BURST"
    clk.tick(301)
    feed(eng, clk, [35], start=200)
    assert state(eng) == EXCELLENT


def test_collector_heartbeat_states(eng, clk):
    hb = {
        "outbox_depth": 0,
        "oldest_pending_age_s": 0.0,
        "adapters": [{"name": "sender", "status": "ok"}],
    }
    eng.observe_heartbeat(TENANT, "ap-south", "col_x_01", hb)
    assert state(eng, "collector", "col_x_01") == EXCELLENT
    eng.observe_heartbeat(TENANT, "ap-south", "col_x_01", {**hb, "outbox_depth": 150})
    assert state(eng, "collector", "col_x_01") == GOOD
    eng.observe_heartbeat(
        TENANT,
        "ap-south",
        "col_x_01",
        {**hb, "adapters": [{"name": "sender", "status": "auth_error"}]},
    )
    assert state(eng, "collector", "col_x_01") == FAIR
    eng.observe_heartbeat(TENANT, "ap-south", "col_x_01", hb)
    clk.tick(21)
    eng.sweep()
    assert state(eng, "collector", "col_x_01") == FAIR  # heartbeat late
    clk.tick(10)  # 31 s since last heartbeat
    trans = eng.sweep()
    assert state(eng, "collector", "col_x_01") == POOR
    t = next(t for t in trans if t.entity_type == "collector")
    assert t.reasons[0]["code"] == "HEARTBEAT_MISSING"


def test_collector_registered_at_startup_detected_offline(eng, clk):
    eng.register_collector(TENANT, "ap-south", "col_y_01", T0 - timedelta(minutes=5), {})
    eng.sweep()
    assert state(eng, "collector", "col_y_01") == POOR


def test_tenant_rollup_is_worst_member_with_counts(eng, clk):
    feed(eng, clk, [35])
    eng.observe_metrics(
        TENANT,
        "ap-south",
        [
            row(1, "cpu_usage", 96, pid="src_00000000000000b2"),
            row(1, "service_up", 0, 0, "bool", pid="src_00000000000000b2"),
        ],
    )
    v = eng.get(TENANT, "tenant", "tenant")
    assert v["state"] == POOR
    counts = v["reasons"][0]["counts"]
    assert counts[EXCELLENT] == 1 and counts[POOR] == 1


def test_other_tenants_never_visible(eng, clk):
    feed(eng, clk, [35])
    assert eng.snapshot(uuid.uuid4()) == []
    assert eng.get(uuid.uuid4(), "source", PID) is None
