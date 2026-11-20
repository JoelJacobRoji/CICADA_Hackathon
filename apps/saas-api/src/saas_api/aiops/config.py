"""Load config/aiops.yaml."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class AiopsConfig:
    history_windows: int
    min_history: int
    z_threshold: float
    persist_windows: int
    adapt_after_windows: int
    alert_direction: dict[str, str]
    mad_floor: dict[str, float]
    trend_windows: int
    trend_metrics: frozenset[str]
    trend_min_relative_rise: float
    trend_min_absolute_rise: dict[str, float]
    trend_persist_windows: int
    resolve_after_s: float
    threshold_persist_windows: int
    source_span_s: float
    topo_span_s: float
    topo_max_hops: int
    site_span_s: float
    site_min_alerts: int
    p1_min_score: float
    p2_min_score: float
    llm: dict[str, Any]


def parse(d: dict[str, Any]) -> AiopsConfig:
    b, t, a, c, p = d["baseline"], d["trend"], d["alerts"], d["correlation"], d["priority"]
    return AiopsConfig(
        history_windows=int(b["history_windows"]),
        min_history=int(b["min_history"]),
        z_threshold=float(b["z_threshold"]),
        persist_windows=int(b["persist_windows"]),
        adapt_after_windows=int(b.get("adapt_after_windows", b["history_windows"])),
        alert_direction={
            k: str(v) for k, v in (b.get("alert_direction") or {"default": "both"}).items()
        },
        mad_floor={k: float(v) for k, v in b["mad_floor"].items()},
        trend_windows=int(t["windows"]),
        trend_metrics=frozenset(t["metrics"]),
        trend_min_relative_rise=float(t["min_relative_rise"]),
        trend_min_absolute_rise={k: float(v) for k, v in t["min_absolute_rise"].items()},
        trend_persist_windows=int(t["persist_windows"]),
        resolve_after_s=float(a["resolve_after_seconds"]),
        threshold_persist_windows=int(a["threshold_persist_windows"]),
        source_span_s=float(c["source_span_seconds"]),
        topo_span_s=float(c["topology_span_seconds"]),
        topo_max_hops=int(c["topology_max_hops"]),
        site_span_s=float(c["site_span_seconds"]),
        site_min_alerts=int(c["site_min_alerts"]),
        p1_min_score=float(p["p1_min_score"]),
        p2_min_score=float(p["p2_min_score"]),
        llm=dict(d.get("llm") or {}),
    )


@lru_cache(maxsize=4)
def load(path: str) -> AiopsConfig:
    return parse(yaml.safe_load(Path(path).read_text(encoding="utf-8")))
