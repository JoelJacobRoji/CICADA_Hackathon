"""Inbound (collector-side) telemetry records.

These records are LOCAL ONLY. They never cross the collector boundary. Unknown fields are
tolerated (kept in ``model_extra`` for the local raw store) because source formats vary;
nothing here is ever serialised outbound - outbound uses ``aegis_contracts.outbound`` only.

Schema provenance: team-defined (2026-11-20), NOT organizer-provided. Will be mapped onto
the official organizer stream when supplied.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .common import (
    Category,
    FiniteFloat,
    IanaTimezone,
    Metric,
    Severity,
    Unit,
    UtcDatetime,
    check_metric_unit,
)

EventId = Annotated[str, StringConstraints(min_length=1, max_length=128)]
SourceId = Annotated[str, StringConstraints(min_length=1, max_length=128)]
AttrValue = str | int | float | bool | None


class _InboundBase(BaseModel):
    model_config = ConfigDict(extra="allow", frozen=True, str_strip_whitespace=True)

    event_id: EventId
    # Untrusted. Never used for authorisation; the SaaS derives tenant from the collector token.
    tenant_id: str | None = Field(default=None, max_length=128)
    source_id: SourceId
    event_timestamp: UtcDatetime
    source_timezone: IanaTimezone


class MetricEvent(_InboundBase):
    record_type: Literal["metric"] = "metric"
    metric: Metric
    value: FiniteFloat
    unit: Unit
    category: Category
    severity: Severity = Severity.INFO

    @model_validator(mode="after")
    def _unit_matches(self) -> MetricEvent:
        check_metric_unit(self.metric, self.unit)
        return self


class LogEvent(_InboundBase):
    """AEGIS extension (ADR-13). ``message`` and ``attributes`` are sensitive and local-only."""

    record_type: Literal["log"]
    category: Category
    log_kind: Literal["auth", "app", "system"]
    message: str = Field(max_length=8192)
    attributes: dict[str, AttrValue] = Field(default_factory=dict, max_length=64)


InboundRecord = MetricEvent | LogEvent


def parse_inbound(obj: dict[str, Any]) -> InboundRecord:
    """Parse one raw record. ``record_type`` defaults to ``metric`` (team schema as-is)."""
    if obj.get("record_type", "metric") == "log":
        return LogEvent.model_validate(obj)
    return MetricEvent.model_validate(obj)
