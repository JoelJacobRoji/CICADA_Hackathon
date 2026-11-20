"""Shared types, enums and validators for AEGIS contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints


class StrictModel(BaseModel):
    """Deny-by-default model: unknown fields are rejected, instances are immutable."""

    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)


def _to_utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


# Timezone-aware datetimes only (naive timestamps are rejected), normalised to UTC.
UtcDatetime = Annotated[AwareDatetime, AfterValidator(_to_utc)]


def _validate_iana(value: str) -> str:
    if value == "UTC":
        return value
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("not a valid IANA timezone name") from exc
    return value


IanaTimezone = Annotated[
    str, StringConstraints(min_length=1, max_length=64), AfterValidator(_validate_iana)
]
FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
NonNegFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]

SourcePid = Annotated[str, StringConstraints(pattern=r"^src_[0-9a-f]{16}$")]
CollectorId = Annotated[str, StringConstraints(pattern=r"^col_[a-z0-9_-]{3,48}$")]
RegionCode = Annotated[str, StringConstraints(pattern=r"^[a-z]{2}-[a-z]+$", max_length=32)]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


class Category(StrEnum):
    INFRASTRUCTURE = "infrastructure"
    NETWORK = "network"
    APPLICATION = "application"
    SECURITY = "security"


class Severity(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class HealthState(StrEnum):
    EXCELLENT = "Excellent"
    GOOD = "Good"
    FAIR = "Fair"
    POOR = "Poor"


class Metric(StrEnum):
    CPU_USAGE = "cpu_usage"
    MEMORY_USAGE = "memory_usage"
    DISK_USAGE = "disk_usage"
    SERVICE_UP = "service_up"
    ERROR_RATE = "error_rate"
    LATENCY_MS = "latency_ms"
    PACKET_LOSS = "packet_loss"
    BANDWIDTH_MBPS = "bandwidth_mbps"
    CONNECTIVITY = "connectivity"


class Unit(StrEnum):
    PERCENT = "percent"
    MS = "ms"
    MBPS = "mbps"
    BOOL = "bool"


METRIC_UNIT: dict[Metric, Unit] = {
    Metric.CPU_USAGE: Unit.PERCENT,
    Metric.MEMORY_USAGE: Unit.PERCENT,
    Metric.DISK_USAGE: Unit.PERCENT,
    Metric.SERVICE_UP: Unit.BOOL,
    Metric.ERROR_RATE: Unit.PERCENT,
    Metric.LATENCY_MS: Unit.MS,
    Metric.PACKET_LOSS: Unit.PERCENT,
    Metric.BANDWIDTH_MBPS: Unit.MBPS,
    Metric.CONNECTIVITY: Unit.BOOL,
}

METRIC_CATEGORY: dict[Metric, Category] = {
    Metric.CPU_USAGE: Category.INFRASTRUCTURE,
    Metric.MEMORY_USAGE: Category.INFRASTRUCTURE,
    Metric.DISK_USAGE: Category.INFRASTRUCTURE,
    Metric.SERVICE_UP: Category.APPLICATION,
    Metric.ERROR_RATE: Category.APPLICATION,
    Metric.LATENCY_MS: Category.NETWORK,
    Metric.PACKET_LOSS: Category.NETWORK,
    Metric.BANDWIDTH_MBPS: Category.NETWORK,
    Metric.CONNECTIVITY: Category.NETWORK,
}


def check_metric_unit(metric: Metric, unit: Unit) -> None:
    expected = METRIC_UNIT[metric]
    if unit != expected:
        raise ValueError(f"unit '{unit}' does not match metric '{metric}' (expected '{expected}')")
