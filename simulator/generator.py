"""Deterministic (seeded) telemetry generator with scenario effects."""

from __future__ import annotations

import random
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "config" / "inventory.yaml"

# metric, unit, category, baseline mean, noise sd
SERIES_BY_KIND: dict[str, list[tuple[str, str, str, float, float]]] = {
    "server": [
        ("cpu_usage", "percent", "infrastructure", 35.0, 4.0),
        ("memory_usage", "percent", "infrastructure", 55.0, 2.0),
        ("disk_usage", "percent", "infrastructure", 62.0, 0.3),
    ],
    "network_device": [
        ("latency_ms", "ms", "network", 20.0, 3.0),
        ("packet_loss", "percent", "network", 0.1, 0.08),
        ("bandwidth_mbps", "mbps", "network", 300.0, 35.0),
        ("connectivity", "bool", "network", 1.0, 0.0),
    ],
    "application": [
        ("service_up", "bool", "application", 1.0, 0.0),
        ("error_rate", "percent", "application", 0.5, 0.25),
        ("latency_ms", "ms", "network", 80.0, 8.0),
    ],
}


@dataclass(frozen=True)
class Series:
    source_id: str
    timezone: str
    metric: str
    unit: str
    category: str
    mean: float
    sd: float


# An effect transforms (baseline_value, seconds_since_scenario_start) -> value while active.
EffectFn = Callable[[float, float], float]


@dataclass
class Effect:
    source_id: str
    metric: str
    start: float  # seconds after scenario start
    duration: float
    fn: EffectFn

    def active(self, t: float) -> bool:
        return self.start <= t < self.start + self.duration


@dataclass
class Scheduled:
    at: float  # seconds after scenario start
    make: Callable[[datetime], dict[str, Any]]


@dataclass
class Scenario:
    name: str
    description: str
    effects: list[Effect] = field(default_factory=list)
    scheduled: list[Scheduled] = field(default_factory=list)


def load_series(path: Path = INVENTORY) -> list[Series]:
    inv = yaml.safe_load(path.read_text(encoding="utf-8"))
    out: list[Series] = []
    for sid, info in inv["sources"].items():
        for metric, unit, cat, mean, sd in SERIES_BY_KIND[info["kind"]]:
            out.append(Series(sid, info.get("timezone", "UTC"), metric, unit, cat, mean, sd))
    return out


def _clamp(metric: str, unit: str, v: float) -> float:
    if unit == "bool":
        return 1.0 if v >= 0.5 else 0.0
    if unit == "percent":
        return min(100.0, max(0.0, v))
    return max(0.0, v)


def metric_record(s: Series, value: float, ts: datetime) -> dict[str, Any]:
    return {
        "event_id": f"SIM_{uuid.uuid4().hex[:20]}",
        "tenant_id": "TENANT_01",
        "source_id": s.source_id,
        "event_timestamp": ts.isoformat(),
        "source_timezone": s.timezone,
        "metric": s.metric,
        "value": round(_clamp(s.metric, s.unit, value), 3),
        "unit": s.unit,
        "category": s.category,
        "severity": "info",
        "simulated": True,
    }


class Generator:
    def __init__(self, seed: int = 7, series: list[Series] | None = None):
        self.rng = random.Random(seed)  # noqa: S311 - simulation, not crypto
        self.series = series or load_series()
        self._i = 0
        self.scenarios: list[tuple[datetime, Scenario]] = []
        self._fired: set[tuple[int, int]] = set()

    def add_scenario(self, scenario: Scenario, start: datetime) -> None:
        self.scenarios.append((start, scenario))

    def _value(self, s: Series, ts: datetime) -> float:
        v = self.rng.gauss(s.mean, s.sd) if s.sd > 0 else s.mean
        for start, sc in self.scenarios:
            t = (ts - start).total_seconds()
            for e in sc.effects:
                if e.source_id == s.source_id and e.metric == s.metric and e.active(t):
                    v = e.fn(v, t - e.start)
        return v

    def metrics(self, n: int, ts: datetime) -> list[dict[str, Any]]:
        out = []
        for _ in range(n):
            s = self.series[self._i % len(self.series)]
            self._i += 1
            out.append(metric_record(s, self._value(s, ts), ts))
        return out

    def due_scheduled(self, ts: datetime) -> list[dict[str, Any]]:
        out = []
        for si, (start, sc) in enumerate(self.scenarios):
            for ji, job in enumerate(sc.scheduled):
                key = (si, ji)
                if key not in self._fired and ts >= start + timedelta(seconds=job.at):
                    self._fired.add(key)
                    out.append(job.make(start + timedelta(seconds=job.at)))
        return out

    def run_offline(
        self, start: datetime, seconds: float, rate: float, tick: float = 0.1
    ) -> Iterator[list[dict[str, Any]]]:
        """Yield batches on a simulated clock (no sleeping) - for tests and JSONL export."""
        carry = 0.0
        steps = int(seconds / tick)
        for k in range(steps):
            ts = start + timedelta(seconds=k * tick)
            carry += rate * tick
            n = int(carry)
            carry -= n
            yield self.due_scheduled(ts) + self.metrics(n, ts)
