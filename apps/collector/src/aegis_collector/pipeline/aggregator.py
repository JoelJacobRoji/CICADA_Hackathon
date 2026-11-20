"""Tumbling-window aggregation per (source_id, metric).

Late events (arriving after their window was flushed) are aggregated into a separate
"late partial" window for the same time range, with its own deterministic stream key, so they
are never silently dropped and never collide with the already-queued payload.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from aegis_contracts.common import Category, Metric, Severity, Unit


@dataclass
class _Acc:
    source_id: str
    metric: Metric
    unit: Unit
    category: Category
    source_timezone: str
    window_start: datetime
    late_index: int = 0
    values: list[float] = field(default_factory=list)
    first_event_ts: datetime | None = None
    last_event_ts: datetime | None = None
    last_value: float = 0.0
    max_input_severity: Severity = Severity.INFO

    def add(self, value: float, ts: datetime, severity: Severity) -> None:
        self.values.append(value)
        if self.first_event_ts is None or ts < self.first_event_ts:
            self.first_event_ts = ts
        if self.last_event_ts is None or ts >= self.last_event_ts:
            self.last_event_ts = ts
            self.last_value = value
        if _SEV_ORDER[severity] > _SEV_ORDER[self.max_input_severity]:
            self.max_input_severity = severity


_SEV_ORDER = {s: i for i, s in enumerate(Severity)}


@dataclass(frozen=True)
class WindowResult:
    source_id: str
    metric: Metric
    unit: Unit
    category: Category
    source_timezone: str
    window_start: datetime
    window_end: datetime
    stream_key: str  # metric name, or "<metric>#late<n>" for late partials
    count: int
    min: float
    max: float
    mean: float
    p95: float
    last: float
    first_event_ts: datetime
    max_input_severity: Severity


def p95(values: list[float]) -> float:
    s = sorted(values)
    return s[max(0, math.ceil(0.95 * len(s)) - 1)]


class WindowAggregator:
    def __init__(self, window_seconds: float = 2.0, grace_seconds: float = 1.0):
        self.window = window_seconds
        self.grace = grace_seconds
        self._open: dict[tuple[str, str, datetime, int], _Acc] = {}
        # (source, metric, window_start) -> number of times flushed (bounded by pruning)
        self._flushed: dict[tuple[str, str, datetime], int] = {}
        self.late_events = 0

    def window_start(self, ts: datetime) -> datetime:
        epoch = ts.timestamp()
        return datetime.fromtimestamp(math.floor(epoch / self.window) * self.window, tz=UTC)

    def add(
        self,
        *,
        source_id: str,
        metric: Metric,
        unit: Unit,
        category: Category,
        source_timezone: str,
        value: float,
        ts: datetime,
        severity: Severity = Severity.INFO,
    ) -> None:
        ws = self.window_start(ts)
        base = (source_id, metric.value, ws)
        late_index = self._flushed.get(base, 0)
        if late_index:
            self.late_events += 1
        key = (*base, late_index)
        acc = self._open.get(key)
        if acc is None:
            acc = _Acc(source_id, metric, unit, category, source_timezone, ws, late_index)
            self._open[key] = acc
        acc.add(value, ts, severity)

    def flush(self, now: datetime, force: bool = False) -> list[WindowResult]:
        """Return windows whose end + grace has passed (or all, if force)."""
        due_before = now - timedelta(seconds=self.window + self.grace)
        out: list[WindowResult] = []
        for key in sorted(self._open, key=lambda k: (k[2], k[0], k[1], k[3])):
            acc = self._open[key]
            if not force and acc.window_start > due_before:
                continue
            del self._open[key]
            base = key[:3]
            self._flushed[base] = self._flushed.get(base, 0) + 1
            vals = acc.values
            stream = acc.metric.value + (f"#late{acc.late_index}" if acc.late_index else "")
            out.append(
                WindowResult(
                    source_id=acc.source_id,
                    metric=acc.metric,
                    unit=acc.unit,
                    category=acc.category,
                    source_timezone=acc.source_timezone,
                    window_start=acc.window_start,
                    window_end=acc.window_start + timedelta(seconds=self.window),
                    stream_key=stream,
                    count=len(vals),
                    min=min(vals),
                    max=max(vals),
                    mean=sum(vals) / len(vals),
                    p95=p95(vals),
                    last=acc.last_value,
                    first_event_ts=acc.first_event_ts or acc.window_start,
                    max_input_severity=acc.max_input_severity,
                )
            )
        self._prune(now)
        return out

    def _prune(self, now: datetime) -> None:
        # Remember flushed windows for 1 hour so late events are still recognised as late.
        cutoff = now - timedelta(hours=1)
        if len(self._flushed) > 50_000:
            self._flushed = {k: v for k, v in self._flushed.items() if k[2] >= cutoff}

    @property
    def open_windows(self) -> int:
        return len(self._open)
