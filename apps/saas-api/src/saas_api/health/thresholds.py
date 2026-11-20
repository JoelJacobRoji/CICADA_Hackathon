"""Load config/health_thresholds.yaml (shared with the collector; single source of truth)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class Numeric:
    good: float
    fair: float
    poor: float


@dataclass(frozen=True)
class Thresholds:
    numeric: dict[str, Numeric]
    binary_poor_when_zero: frozenset[str]
    stale_fair_after_s: float
    stale_poor_after_s: float
    raw: dict[str, Any]


def parse(data: dict[str, Any]) -> Thresholds:
    numeric = {k: Numeric(**v) for k, v in (data.get("numeric") or {}).items()}
    for k, t in numeric.items():
        if not (t.good <= t.fair <= t.poor):
            raise ValueError(f"thresholds for {k} must satisfy good <= fair <= poor")
    binary = frozenset(k for k, v in (data.get("binary") or {}).items() if v.get("poor_when_zero"))
    st = data.get("staleness") or {}
    return Thresholds(
        numeric=numeric,
        binary_poor_when_zero=binary,
        stale_fair_after_s=float(st.get("fair_after_seconds", 10)),
        stale_poor_after_s=float(st.get("poor_after_seconds", 30)),
        raw=data,
    )


@lru_cache(maxsize=4)
def load(path: str) -> Thresholds:
    return parse(yaml.safe_load(Path(path).read_text(encoding="utf-8")))
