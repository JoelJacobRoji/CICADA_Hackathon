"""Per-window local health classification (instantaneous; hysteresis lives in the SaaS)."""

from __future__ import annotations

from dataclasses import dataclass

from aegis_contracts.common import HealthState, Metric, Severity
from aegis_contracts.outbound import SummaryCode

from .aggregator import WindowResult
from .localconfig import Thresholds

_CODE = {
    Metric.CPU_USAGE: SummaryCode.CPU_HIGH,
    Metric.MEMORY_USAGE: SummaryCode.MEMORY_HIGH,
    Metric.DISK_USAGE: SummaryCode.DISK_HIGH,
    Metric.LATENCY_MS: SummaryCode.LATENCY_HIGH,
    Metric.PACKET_LOSS: SummaryCode.PACKET_LOSS_HIGH,
    Metric.ERROR_RATE: SummaryCode.ERROR_RATE_HIGH,
    Metric.BANDWIDTH_MBPS: SummaryCode.BANDWIDTH_HIGH,
    Metric.SERVICE_UP: SummaryCode.SERVICE_DOWN,
    Metric.CONNECTIVITY: SummaryCode.CONNECTIVITY_LOST,
}
_SEVERITY = {
    HealthState.EXCELLENT: Severity.INFO,
    HealthState.GOOD: Severity.LOW,
    HealthState.FAIR: Severity.MEDIUM,
    HealthState.POOR: Severity.HIGH,
}


@dataclass(frozen=True)
class LocalVerdict:
    health: HealthState
    severity: Severity
    summary_code: SummaryCode


def classify(w: WindowResult, t: Thresholds) -> LocalVerdict:
    metric = w.metric
    if metric.value in t.binary_poor_when_zero:
        if w.min <= 0:
            return LocalVerdict(HealthState.POOR, Severity.CRITICAL, _CODE[metric])
        return LocalVerdict(HealthState.EXCELLENT, Severity.INFO, SummaryCode.OK)

    th = t.numeric.get(metric.value)
    if th is None:
        return LocalVerdict(HealthState.EXCELLENT, Severity.INFO, SummaryCode.OK)
    v = w.mean  # sustained level within the window; spikes are visible via max/p95
    if v > th.poor:
        state = HealthState.POOR
    elif v > th.fair:
        state = HealthState.FAIR
    elif v > th.good:
        state = HealthState.GOOD
    else:
        state = HealthState.EXCELLENT
    code = SummaryCode.OK if state == HealthState.EXCELLENT else _CODE[metric]
    return LocalVerdict(state, _SEVERITY[state], code)
