"""Builds allow-listed outbound models. Each builder takes the collector_seq assigned at commit."""

from __future__ import annotations

import uuid
from collections.abc import Callable

from aegis_contracts.common import HealthState, Severity
from aegis_contracts.outbound import (
    PAYLOAD_NAMESPACE,
    MetricSummary,
    RiskLevel,
    SecuritySummary,
    SourceKind,
    TopologyEdge,
    payload_id_for,
)

from ..pipeline.aggregator import WindowResult
from ..pipeline.auth_detector import SecurityFinding
from ..pipeline.health_local import LocalVerdict
from ..pipeline.localconfig import Edge

OutboundModel = MetricSummary | SecuritySummary | TopologyEdge
Builder = Callable[[int], OutboundModel]

_RISK_HEALTH = {
    RiskLevel.LOW: (HealthState.GOOD, Severity.LOW),
    RiskLevel.MEDIUM: (HealthState.FAIR, Severity.MEDIUM),
    RiskLevel.HIGH: (HealthState.POOR, Severity.HIGH),
}


def metric_summary(
    collector_id: str, pid: str, kind: SourceKind, w: WindowResult, v: LocalVerdict
) -> Builder:
    pid_ = payload_id_for(collector_id, pid, w.stream_key, w.window_start)

    def build(seq: int) -> MetricSummary:
        return MetricSummary(
            payload_id=pid_,
            collector_id=collector_id,
            source_pid=pid,
            source_kind=kind,
            metric=w.metric,
            unit=w.unit,
            category=w.category,
            window_start_utc=w.window_start,
            window_end_utc=w.window_end,
            source_timezone=w.source_timezone,
            count=w.count,
            min=w.min,
            max=w.max,
            mean=w.mean,
            last=w.last,
            p95=w.p95,
            severity=v.severity,
            local_health=v.health,
            anomaly=None,  # robust baselines arrive in Phase 6
            summary_code=v.summary_code,
            first_event_ts_utc=w.first_event_ts,
            collector_seq=seq,
        )

    return build


def security_summary(collector_id: str, pid: str, f: SecurityFinding) -> Builder:
    pid_ = payload_id_for(
        collector_id, pid, f"security:{f.code.value}:{f.risk.value}", f.window_start
    )
    health, severity = _RISK_HEALTH[f.risk]

    def build(seq: int) -> SecuritySummary:
        return SecuritySummary(
            payload_id=pid_,
            collector_id=collector_id,
            source_pid=pid,
            window_start_utc=f.window_start,
            window_end_utc=f.window_end,
            source_timezone=f.source_timezone,
            collector_seq=seq,
            summary_code=f.code,
            failure_count=f.failure_count,
            distinct_user_count=f.distinct_user_count,
            distinct_src_count=f.distinct_src_count,
            severity=severity,
            local_health=health,
            risk_level=f.risk,
        )

    return build


def topology_edge(collector_id: str, from_pid: str, to_pid: str, edge: Edge) -> Builder:
    key = f"{collector_id}|edge|{from_pid}|{to_pid}|{edge.relation.value}"
    pid_ = uuid.uuid5(PAYLOAD_NAMESPACE, key)

    def build(_seq: int) -> TopologyEdge:
        return TopologyEdge(
            payload_id=pid_,
            collector_id=collector_id,
            from_pid=from_pid,
            to_pid=to_pid,
            relation=edge.relation,
        )

    return build
