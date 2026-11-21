"""Loaders for collector-local configuration (thresholds + inventory)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml
from aegis_contracts.outbound import Relation, SourceKind


@dataclass(frozen=True)
class NumericThreshold:
    good: float
    fair: float
    poor: float


@dataclass(frozen=True)
class SecurityThresholds:
    auth_window_seconds: float = 60
    burst_medium_failures: int = 5
    burst_high_failures: int = 20
    spray_min_users: int = 3
    spray_min_failures: int = 5
    success_after_failures_min: int = 5


@dataclass(frozen=True)
class Thresholds:
    numeric: dict[str, NumericThreshold]
    binary_poor_when_zero: frozenset[str]
    security: SecurityThresholds


@dataclass(frozen=True)
class SourceInfo:
    kind: SourceKind
    timezone: str


@dataclass(frozen=True)
class Edge:
    src: str
    dst: str
    relation: Relation


@dataclass(frozen=True)
class Inventory:
    sources: dict[str, SourceInfo] = field(default_factory=dict)
    edges: tuple[Edge, ...] = ()

    def kind_of(self, source_id: str) -> SourceKind:
        info = self.sources.get(source_id)
        if info:
            return info.kind
        prefix = source_id.split("_", 1)[0].upper()
        return {
            "NET": SourceKind.NETWORK_DEVICE,
            "APP": SourceKind.APPLICATION,
            "STO": SourceKind.STORAGE,
            "DB": SourceKind.DATABASE,
        }.get(prefix, SourceKind.SERVER)


def load_thresholds(path: Path) -> Thresholds:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    numeric = {k: NumericThreshold(**v) for k, v in data.get("numeric", {}).items()}
    for k, t in numeric.items():
        if not (t.good <= t.fair <= t.poor):
            raise ValueError(f"thresholds for {k} must satisfy good <= fair <= poor")
    binary = frozenset(k for k, v in data.get("binary", {}).items() if v.get("poor_when_zero"))
    sec = SecurityThresholds(**data.get("security", {}))
    return Thresholds(numeric=numeric, binary_poor_when_zero=binary, security=sec)


def merge_inventories(*parts: Inventory) -> Inventory:
    """Union of several inventory files (e.g. the simulated inventory + real sources)."""
    sources: dict[str, SourceInfo] = {}
    edges: list[Edge] = []
    for p in parts:
        sources.update(p.sources)
        edges.extend(e for e in p.edges if e not in edges)
    return Inventory(sources=sources, edges=tuple(edges))


def load_inventory(path: Path) -> Inventory:
    if not path.exists():
        return Inventory()
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    sources = {
        sid: SourceInfo(kind=SourceKind(v["kind"]), timezone=v.get("timezone", "UTC"))
        for sid, v in (data.get("sources") or {}).items()
    }
    edges = tuple(
        Edge(src=e["from"], dst=e["to"], relation=Relation(e["relation"]))
        for e in (data.get("edges") or [])
    )
    return Inventory(sources=sources, edges=edges)
