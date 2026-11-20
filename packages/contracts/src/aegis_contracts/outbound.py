"""Outbound contracts: the ONLY data allowed to leave the customer environment.

Every model is ``extra="forbid"``. There are deliberately no free-text fields: identifiers are
pattern-constrained and descriptive information is limited to enums. The same models are used
by the collector (before enqueue) and the SaaS (on ingest).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from .common import (
    Category,
    CollectorId,
    FiniteFloat,
    HealthState,
    IanaTimezone,
    Metric,
    NonNegFloat,
    RegionCode,
    Severity,
    Sha256Hex,
    SourcePid,
    StrictModel,
    Unit,
    UtcDatetime,
    check_metric_unit,
)

# Fixed namespace so payload IDs are reproducible across restarts (ADR-11).
PAYLOAD_NAMESPACE = uuid.UUID("6f1c2a52-6b0e-4c5e-9a43-2a9d1b7e0c11")

MAX_BATCH_ITEMS = 500
MAX_BATCH_BYTES = 1_048_576


class SourceKind(StrEnum):
    SERVER = "server"
    NETWORK_DEVICE = "network_device"
    APPLICATION = "application"


class SummaryCode(StrEnum):
    OK = "OK"
    CPU_HIGH = "CPU_HIGH"
    MEMORY_HIGH = "MEMORY_HIGH"
    DISK_HIGH = "DISK_HIGH"
    SERVICE_DOWN = "SERVICE_DOWN"
    ERROR_RATE_HIGH = "ERROR_RATE_HIGH"
    LATENCY_HIGH = "LATENCY_HIGH"
    LATENCY_RISING = "LATENCY_RISING"
    PACKET_LOSS_HIGH = "PACKET_LOSS_HIGH"
    BANDWIDTH_HIGH = "BANDWIDTH_HIGH"
    CONNECTIVITY_LOST = "CONNECTIVITY_LOST"
    BASELINE_DEVIATION = "BASELINE_DEVIATION"


class SecurityCode(StrEnum):
    AUTH_FAILURE_BURST = "AUTH_FAILURE_BURST"
    AUTH_FAILURE_SPRAY = "AUTH_FAILURE_SPRAY"
    AUTH_SUCCESS_AFTER_FAILURES = "AUTH_SUCCESS_AFTER_FAILURES"


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AdapterStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"
    AUTH_ERROR = "auth_error"
    DISABLED = "disabled"


class Relation(StrEnum):
    DEPENDS_ON = "depends_on"
    ROUTES_THROUGH = "routes_through"


class RejectReason(StrEnum):
    SCHEMA_INVALID = "SCHEMA_INVALID"
    COLLECTOR_MISMATCH = "COLLECTOR_MISMATCH"
    REGION_MISMATCH = "REGION_MISMATCH"
    TOO_LARGE = "TOO_LARGE"


def payload_id_for(
    collector_id: str, source_pid: str, stream: str, window_start: datetime
) -> uuid.UUID:
    """Deterministic UUIDv5 so a regenerated or retried payload keeps the same ID."""
    key = f"{collector_id}|{source_pid}|{stream}|{window_start.isoformat()}"
    return uuid.uuid5(PAYLOAD_NAMESPACE, key)


class AnomalyInfo(StrictModel):
    method: Literal["robust_z"]
    score: FiniteFloat
    baseline_median: FiniteFloat
    baseline_mad: NonNegFloat
    history_n: int = Field(ge=0)
    direction: Literal["up", "down"]


class _WindowedItem(StrictModel):
    schema_version: Literal[1] = 1
    payload_id: uuid.UUID
    collector_id: CollectorId
    source_pid: SourcePid
    window_start_utc: UtcDatetime
    window_end_utc: UtcDatetime
    source_timezone: IanaTimezone
    collector_seq: int = Field(ge=0)

    @model_validator(mode="after")
    def _window_order(self) -> _WindowedItem:
        if self.window_end_utc <= self.window_start_utc:
            raise ValueError("window_end_utc must be after window_start_utc")
        return self


class MetricSummary(_WindowedItem):
    kind: Literal["metric_summary"] = "metric_summary"
    source_kind: SourceKind
    metric: Metric
    unit: Unit
    category: Category
    count: int = Field(ge=1)
    min: FiniteFloat
    max: FiniteFloat
    mean: FiniteFloat
    last: FiniteFloat
    p95: FiniteFloat
    severity: Severity
    local_health: HealthState
    anomaly: AnomalyInfo | None = None
    summary_code: SummaryCode
    first_event_ts_utc: UtcDatetime

    @model_validator(mode="after")
    def _consistency(self) -> MetricSummary:
        check_metric_unit(self.metric, self.unit)
        if not (self.min <= self.mean <= self.max and self.min <= self.p95 <= self.max):
            raise ValueError("aggregate statistics are inconsistent")
        return self


class SecuritySummary(_WindowedItem):
    kind: Literal["security_summary"] = "security_summary"
    summary_code: SecurityCode
    failure_count: int = Field(ge=0)
    distinct_user_count: int = Field(ge=0)
    distinct_src_count: int = Field(ge=0)
    severity: Severity
    local_health: HealthState
    risk_level: RiskLevel


class TopologyEdge(StrictModel):
    kind: Literal["topology_edge"] = "topology_edge"
    schema_version: Literal[1] = 1
    payload_id: uuid.UUID
    collector_id: CollectorId
    from_pid: SourcePid
    to_pid: SourcePid
    relation: Relation


OutboundItem = Annotated[
    MetricSummary | SecuritySummary | TopologyEdge, Field(discriminator="kind")
]


class IngestBatch(StrictModel):
    batch_id: uuid.UUID
    sent_at_utc: UtcDatetime
    items: list[OutboundItem] = Field(min_length=1, max_length=MAX_BATCH_ITEMS)


class AdapterInfo(StrictModel):
    name: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{1,31}$")]
    status: AdapterStatus


class Heartbeat(StrictModel):
    kind: Literal["heartbeat"] = "heartbeat"
    schema_version: Literal[1] = 1
    collector_id: CollectorId
    sent_at_utc: UtcDatetime
    collector_version: Annotated[str, StringConstraints(pattern=r"^\d+\.\d+\.\d+$")]
    uptime_s: NonNegFloat
    cpu_percent: NonNegFloat
    memory_mb: NonNegFloat
    outbox_depth: int = Field(ge=0)
    oldest_pending_age_s: NonNegFloat
    config_hash: Sha256Hex
    adapters: list[AdapterInfo] = Field(max_length=20)
    region: RegionCode


class Rejection(StrictModel):
    payload_id: uuid.UUID | None
    reason: RejectReason


class IngestAck(StrictModel):
    batch_id: uuid.UUID
    accepted: list[uuid.UUID]
    duplicate: list[uuid.UUID]
    rejected: list[Rejection]
