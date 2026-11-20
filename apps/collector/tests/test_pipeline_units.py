"""Unit tests: aggregator, local health, auth detector."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from aegis_collector.config import REPO_CONFIG
from aegis_collector.pipeline.aggregator import WindowAggregator, p95
from aegis_collector.pipeline.auth_detector import AuthDetector
from aegis_collector.pipeline.health_local import classify
from aegis_collector.pipeline.localconfig import load_thresholds
from aegis_contracts.common import Category, HealthState, Metric, Severity, Unit
from aegis_contracts.inbound import LogEvent
from aegis_contracts.outbound import RiskLevel, SecurityCode, SummaryCode

T0 = datetime(2026, 11, 20, 9, 30, 0, tzinfo=UTC)
TH = load_thresholds(REPO_CONFIG / "health_thresholds.yaml")


def add(agg, value, ts, source="SRV_001", metric=Metric.CPU_USAGE, unit=Unit.PERCENT):
    agg.add(
        source_id=source,
        metric=metric,
        unit=unit,
        category=Category.INFRASTRUCTURE,
        source_timezone="Asia/Kolkata",
        value=value,
        ts=ts,
    )


def test_window_stats():
    agg = WindowAggregator(2.0, 1.0)
    for i, v in enumerate([10, 20, 30, 40]):
        add(agg, v, T0 + timedelta(milliseconds=400 * i))
    assert agg.flush(T0 + timedelta(seconds=2.5)) == []  # grace not elapsed
    (w,) = agg.flush(T0 + timedelta(seconds=3.1))
    assert (w.count, w.min, w.max, w.mean, w.last) == (4, 10, 40, 25, 40)
    assert w.p95 == 40 and w.window_start == T0 and w.window_end == T0 + timedelta(seconds=2)
    assert w.first_event_ts == T0 and w.stream_key == "cpu_usage"


def test_events_split_into_correct_windows():
    agg = WindowAggregator(2.0, 0.0)
    add(agg, 1, T0 + timedelta(seconds=1.9))
    add(agg, 2, T0 + timedelta(seconds=2.0))
    ws = agg.flush(T0 + timedelta(seconds=10))
    assert [(w.window_start - T0).total_seconds() for w in ws] == [0.0, 2.0]


def test_late_event_goes_to_separate_late_partial():
    agg = WindowAggregator(2.0, 1.0)
    add(agg, 50, T0 + timedelta(seconds=0.5))
    (first,) = agg.flush(T0 + timedelta(seconds=4))
    add(agg, 99, T0 + timedelta(seconds=1.0))  # arrives after its window was flushed
    (late,) = agg.flush(T0 + timedelta(seconds=8))
    assert first.stream_key == "cpu_usage" and late.stream_key == "cpu_usage#late1"
    assert late.window_start == first.window_start and late.count == 1
    assert agg.late_events == 1


def test_p95_nearest_rank():
    assert p95(list(range(1, 101))) == 95
    assert p95([5.0]) == 5.0


def _w(metric, values, unit=Unit.PERCENT):
    agg = WindowAggregator(2.0, 0.0)
    for v in values:
        add(agg, v, T0, metric=metric, unit=unit)
    return agg.flush(T0 + timedelta(seconds=5))[0]


@pytest.mark.parametrize(
    "value,state",
    [
        (35, HealthState.EXCELLENT),
        (75, HealthState.GOOD),
        (90, HealthState.FAIR),
        (97, HealthState.POOR),
    ],
)
def test_cpu_thresholds(value, state):
    v = classify(_w(Metric.CPU_USAGE, [value]), TH)
    assert v.health == state
    assert (v.summary_code == SummaryCode.OK) == (state == HealthState.EXCELLENT)


def test_binary_down_is_poor_critical():
    v = classify(_w(Metric.SERVICE_UP, [1, 0, 1], unit=Unit.BOOL), TH)
    assert v.health == HealthState.POOR and v.severity == Severity.CRITICAL
    assert v.summary_code == SummaryCode.SERVICE_DOWN


def _auth(i, outcome="failure", user="admin", src="10.20.30.40", source="SRV_002", dt=0.8):
    return LogEvent(
        event_id=f"A{i}",
        source_id=source,
        event_timestamp=T0 + timedelta(seconds=i * dt),
        source_timezone="Asia/Kolkata",
        record_type="log",
        category=Category.SECURITY,
        log_kind="auth",
        message="Failed password for admin" if outcome == "failure" else "Accepted password",
        attributes={"user": user, "src_ip": src, "outcome": outcome},
    )


def test_four_failures_no_finding():
    d = AuthDetector(TH.security)
    assert [f for i in range(4) for f in d.observe(_auth(i))] == []


def test_burst_medium_then_high_once_each():
    d = AuthDetector(TH.security)
    found = [f for i in range(25) for f in d.observe(_auth(i))]
    assert [(f.code, f.risk) for f in found] == [
        (SecurityCode.AUTH_FAILURE_BURST, RiskLevel.MEDIUM),
        (SecurityCode.AUTH_FAILURE_BURST, RiskLevel.HIGH),
    ]
    assert found[-1].failure_count == 20 and found[-1].distinct_user_count == 1


def test_spray_detected():
    d = AuthDetector(TH.security)
    found = [f for i in range(6) for f in d.observe(_auth(i, user=f"u{i}"))]
    assert any(f.code == SecurityCode.AUTH_FAILURE_SPRAY for f in found)


def test_success_after_failures():
    d = AuthDetector(TH.security)
    for i in range(6):
        d.observe(_auth(i))
    found = d.observe(_auth(7, outcome="success"))
    assert [f.code for f in found] == [SecurityCode.AUTH_SUCCESS_AFTER_FAILURES]


def test_failures_outside_window_expire():
    d = AuthDetector(TH.security)
    found = [f for i in range(10) for f in d.observe(_auth(i, dt=30))]  # 1 failure / 30 s
    assert found == []
