"""AIOps engine: signals -> alerts (deduplicated) -> incidents (correlated) -> explanation.

Deterministic and explainable by construction. Every incident carries the rule and evidence
that formed it. Correlation is NEVER by time alone: a shared source (C-SRC), a reported dependency
path (C-TOPO), or several network alerts from one collector (C-SITE) is required.
"""

from __future__ import annotations

import threading
import uuid
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .baseline import Baselines, Score
from .config import AiopsConfig

SEV_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
SEV_WEIGHT = {"low": 1, "medium": 4, "high": 8, "critical": 8}
NETWORK_METRICS = {"latency_ms", "packet_loss", "bandwidth_mbps", "connectivity"}


def short(pid: str) -> str:
    return f"src_{pid[4:10]}…" if pid.startswith("src_") else pid


# ---------------------------------------------------------------------------- data model


@dataclass
class Alert:
    id: uuid.UUID
    tenant_id: uuid.UUID
    region: str
    entity_type: str  # source | collector
    entity_id: str
    collector_id: str | None
    metric: str  # metric name, "security", "heartbeat" or "data"
    family: str  # THRESHOLD | BASELINE | TREND | SECURITY | OFFLINE | NO_DATA
    code: str
    severity: str
    category: str
    onset: datetime  # EVENT time of the first triggering window (ordering)
    first_seen: datetime  # server time
    last_seen: datetime
    last_true: datetime  # last time the condition held (for resolution)
    occurrences: int = 1
    dedup_hits: int = 0
    status: str = "open"
    evidence: dict[str, Any] = field(default_factory=dict)
    incident_id: uuid.UUID | None = None
    resolved_at: datetime | None = None

    def view(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "collector_id": self.collector_id,
            "metric": self.metric,
            "family": self.family,
            "code": self.code,
            "severity": self.severity,
            "category": self.category,
            "onset": self.onset.isoformat(),
            "first_seen": self.first_seen.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "occurrences": self.occurrences,
            "dedup_hits": self.dedup_hits,
            "status": self.status,
            "evidence": self.evidence,
            "incident_id": str(self.incident_id) if self.incident_id else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


@dataclass
class Incident:
    id: uuid.UUID
    tenant_id: uuid.UUID
    region: str
    opened_at: datetime
    updated_at: datetime
    status: str = "open"  # open | resolved
    alert_ids: list[uuid.UUID] = field(default_factory=list)
    correlation: list[dict[str, Any]] = field(default_factory=list)
    version: int = 1
    priority: str = "P3"
    score: float = 0.0
    title: str = ""
    root_entity: str | None = None
    explanation: dict[str, Any] = field(default_factory=dict)
    resolved_at: datetime | None = None
    acked_at: datetime | None = None
    acked_by: str | None = None


@dataclass
class Change:
    """Emitted when an incident is created or changes (drives persistence, WS, notifications)."""

    kind: str  # opened | updated | resolved
    incident: Incident
    alerts: list[Alert]


# ---------------------------------------------------------------------------- topology


class Topology:
    """Reported dependency edges (pseudonymous). from -> to means `from` depends on `to`."""

    def __init__(self) -> None:
        self.edges: set[tuple[str, str, str]] = set()
        self.up: dict[str, set[str]] = {}  # node -> nodes it depends on (upstream)
        self.adj: dict[str, set[str]] = {}  # undirected

    def add(self, src: str, dst: str, relation: str) -> None:
        if (src, dst, relation) in self.edges:
            return
        self.edges.add((src, dst, relation))
        self.up.setdefault(src, set()).add(dst)
        self.adj.setdefault(src, set()).add(dst)
        self.adj.setdefault(dst, set()).add(src)

    def known(self, n: str) -> bool:
        return n in self.adj

    def path(self, a: str, b: str, max_hops: int) -> list[str] | None:
        """Shortest undirected path a..b within max_hops (BFS), or None."""
        if a == b:
            return [a]
        frontier: deque[list[str]] = deque([[a]])
        seen = {a}
        while frontier:
            p = frontier.popleft()
            if len(p) - 1 >= max_hops:
                continue
            for nxt in self.adj.get(p[-1], ()):
                if nxt in seen:
                    continue
                if nxt == b:
                    return [*p, nxt]
                seen.add(nxt)
                frontier.append([*p, nxt])
        return None

    def is_upstream_of(self, up: str, down: str, max_hops: int) -> bool:
        """True if `down` (transitively) depends on `up` within max_hops."""
        frontier, seen = [down], {down}
        for _ in range(max_hops):
            nxt = []
            for n in frontier:
                for u in self.up.get(n, ()):
                    if u == up:
                        return True
                    if u not in seen:
                        seen.add(u)
                        nxt.append(u)
            frontier = nxt
        return False


# ---------------------------------------------------------------------------- engine


class AiopsEngine:
    def __init__(
        self,
        cfg: AiopsConfig,
        classify: Callable[[str, float, float, str, datetime], Any],
        clock: Callable[[], datetime] | None = None,
    ):
        self.cfg = cfg
        self.classify = classify  # health engine's threshold classifier (single source of truth)
        self.clock = clock or (lambda: datetime.now(UTC))
        self.baselines = Baselines(cfg)
        self.topology: dict[uuid.UUID, Topology] = {}
        self.alerts: dict[uuid.UUID, Alert] = {}
        self.open_alert_by_key: dict[tuple, uuid.UUID] = {}
        self.incidents: dict[uuid.UUID, Incident] = {}
        self.kinds: dict[tuple[uuid.UUID, str], str] = {}
        self.threshold_streak: dict[tuple, int] = {}
        self.transients: dict[uuid.UUID, int] = {}
        self.raw_alert_count: dict[uuid.UUID, int] = {}
        self.lock = threading.RLock()

    # ------------------------------------------------------------------ inputs

    def topo(self, tenant: uuid.UUID) -> Topology:
        return self.topology.setdefault(tenant, Topology())

    def observe_edges(self, tenant: uuid.UUID, edges: Iterable[dict[str, Any]]) -> None:
        with self.lock:
            t = self.topo(tenant)
            for e in edges:
                t.add(e["from_pid"], e["to_pid"], e["relation"])

    def observe_metrics(
        self, tenant: uuid.UUID, region: str, rows: Iterable[dict[str, Any]]
    ) -> list[Change]:
        changes: list[Change] = []
        with self.lock:
            for r in sorted(rows, key=lambda r: r["window_end"]):
                pid, metric = r["source_pid"], r["metric"]
                self.kinds[(tenant, pid)] = r.get("source_kind") or "server"
                value = r["min"] if r["unit"] == "bool" else r["mean"]
                key = (tenant, pid, metric)
                score = self.baselines.update(key, metric, r["window_end"], value)
                if score is None:
                    continue  # late window: stored as history only
                ctx = dict(tenant=tenant, region=region, pid=pid, metric=metric, row=r)
                changes += self._threshold(score, **ctx)
                changes += self._baseline(score, **ctx)
                changes += self._trend(score, **ctx)
        return changes

    def observe_security(
        self, tenant: uuid.UUID, region: str, rows: Iterable[dict[str, Any]]
    ) -> list[Change]:
        changes: list[Change] = []
        with self.lock:
            for r in rows:
                if r["risk_level"] not in ("medium", "high"):
                    continue
                self.kinds.setdefault((tenant, r["source_pid"]), "server")
                ev = {
                    "summary_code": r["summary_code"],
                    "risk_level": r["risk_level"],
                    "failure_count": r["failure_count"],
                    "distinct_user_count": r["distinct_user_count"],
                    "distinct_src_count": r["distinct_src_count"],
                    "window_end": r["window_end"].isoformat(),
                    "detection": "local_security_rule",
                    "payload_ids": [str(r["payload_id"])],
                }
                changes += self._raise(
                    tenant,
                    region,
                    "source",
                    r["source_pid"],
                    r.get("collector_id"),
                    "security",
                    "SECURITY",
                    f"SECURITY_{r['summary_code']}",
                    "high" if r["risk_level"] == "high" else "medium",
                    "security",
                    ev,
                    onset=r["window_end"],
                )
        return changes

    def observe_health(self, transitions: Iterable[Any]) -> list[Change]:
        """Collector offline and missing source data, from health-engine transitions."""
        changes: list[Change] = []
        with self.lock:
            # Collectors first: a source's NO_DATA can then join its collector's outage incident.
            for t in sorted(transitions, key=lambda t: t.entity_type != "collector"):
                codes = {r.get("code") for r in t.reasons}
                if (
                    t.entity_type == "collector"
                    and t.to_state == "Poor"
                    and "HEARTBEAT_MISSING" in codes
                ):
                    ev = next(r for r in t.reasons if r.get("code") == "HEARTBEAT_MISSING")
                    changes += self._raise(
                        t.tenant_id,
                        t.region,
                        "collector",
                        t.entity_id,
                        t.entity_id,
                        "heartbeat",
                        "OFFLINE",
                        "COLLECTOR_OFFLINE",
                        "high",
                        "fleet",
                        {**ev, "detection": "heartbeat_age"},
                        onset=t.at_utc,
                    )
                if t.entity_type == "source" and "NO_DATA" in codes:
                    ev = next(r for r in t.reasons if r.get("code") == "NO_DATA")
                    changes += self._raise(
                        t.tenant_id,
                        t.region,
                        "source",
                        t.entity_id,
                        None,
                        "data",
                        "NO_DATA",
                        "SOURCE_NO_DATA",
                        "medium",
                        "data",
                        {**ev, "detection": "staleness"},
                        onset=t.at_utc,
                    )
        return changes

    # ------------------------------------------------------------------ detectors

    def _evidence_base(self, s: Score, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "observed": round(s.value, 3),
            "unit": row["unit"],
            "window_end": row["window_end"].isoformat(),
            "payload_ids": [str(row["payload_id"])] if row.get("payload_id") else [],
        }

    def _threshold(self, s: Score, tenant, region, pid, metric, row) -> list[Change]:
        t = self.classify(metric, row["mean"], row["min"], row["unit"], row["window_end"])
        key = (tenant, pid, metric)
        bad = t.state in ("Fair", "Poor")
        self.threshold_streak[key] = self.threshold_streak.get(key, 0) + 1 if bad else 0
        need = 1 if t.critical else self.cfg.threshold_persist_windows
        if not bad or self.threshold_streak[key] < need:
            return []
        sev = "critical" if t.critical else ("high" if t.state == "Poor" else "medium")
        ev = {
            **self._evidence_base(s, row),
            "threshold": t.threshold,
            "state": t.state,
            "windows": self.threshold_streak[key],
            "detection": "static_threshold",
        }
        return self._raise(
            tenant,
            region,
            "source",
            pid,
            row.get("collector_id"),
            metric,
            "THRESHOLD",
            f"{metric.upper()}_{t.state.upper()}",
            sev,
            row.get("category") or "infrastructure",
            ev,
            onset=row["window_end"],
        )

    def _baseline(self, s: Score, tenant, region, pid, metric, row) -> list[Change]:
        if row["unit"] == "bool" or s.learning or not s.anomalous:
            return []
        if s.consecutive < self.cfg.persist_windows:
            self.transients[tenant] = self.transients.get(tenant, 0) + 1  # never alerted
            return []
        ev = {
            **self._evidence_base(s, row),
            "detection": "robust_z",
            "baseline_median": round(s.median, 3),
            "baseline_mad": round(s.mad, 3),
            "mad_used": round(s.mad_used, 3),
            "z": round(s.z, 2),
            "z_threshold": self.cfg.z_threshold,
            "history_n": s.history_n,
            "windows": s.consecutive,
            "direction": s.direction,
            "deviation_pct": round(100 * (s.value - s.median) / s.median, 1) if s.median else None,
        }
        sev = "high" if abs(s.z) >= 8 else "medium"
        return self._raise(
            tenant,
            region,
            "source",
            pid,
            row.get("collector_id"),
            metric,
            "BASELINE",
            "BASELINE_DEVIATION",
            sev,
            row.get("category") or "infrastructure",
            ev,
            onset=row["window_end"],
        )

    def _trend(self, s: Score, tenant, region, pid, metric, row) -> list[Change]:
        if not s.rising or s.rising_consecutive < self.cfg.trend_persist_windows:
            return []
        ev = {
            **self._evidence_base(s, row),
            "detection": "trend_slope",
            "rise_over_span": round(s.trend_rise, 3),
            "span_windows": self.cfg.trend_windows,
            "baseline_median": round(s.median, 3) if s.median is not None else None,
            "windows": s.rising_consecutive,
        }
        return self._raise(
            tenant,
            region,
            "source",
            pid,
            row.get("collector_id"),
            metric,
            "TREND",
            f"{metric.upper()}_RISING",
            "low",
            row.get("category") or "network",
            ev,
            onset=row["window_end"],
        )

    # ------------------------------------------------------------------ alerts -> incidents

    def _raise(
        self,
        tenant,
        region,
        etype,
        eid,
        collector_id,
        metric,
        family,
        code,
        severity,
        category,
        evidence,
        onset=None,
    ) -> list[Change]:
        now = self.clock()
        key = (tenant, etype, eid, metric, family)
        aid = self.open_alert_by_key.get(key)
        if aid is not None:  # C-DUP: same condition still open -> update, don't create
            a = self.alerts[aid]
            a.last_seen = a.last_true = now
            a.occurrences += 1
            a.dedup_hits += 1
            escalated = SEV_RANK[severity] > SEV_RANK[a.severity] or code != a.code
            if SEV_RANK[severity] >= SEV_RANK[a.severity]:
                a.severity, a.code = severity, code
            a.evidence = evidence
            inc = self.incidents.get(a.incident_id) if a.incident_id else None
            if inc is None:
                return []
            prev = (inc.priority, inc.title)
            self._recompute(inc)
            if escalated or prev != (inc.priority, inc.title):
                inc.version += 1
                return [Change("updated", inc, self._alerts_of(inc))]
            return []
        a = Alert(
            uuid.uuid4(),
            tenant,
            region,
            etype,
            eid,
            collector_id,
            metric,
            family,
            code,
            severity,
            category,
            onset or now,
            now,
            now,
            now,
            evidence=evidence,
        )
        self.alerts[a.id] = a
        self.open_alert_by_key[key] = a.id
        self.raw_alert_count[tenant] = self.raw_alert_count.get(tenant, 0) + 1
        inc, rule = self._correlate(a)
        if inc is None:
            inc = Incident(uuid.uuid4(), tenant, region, now, now)
            inc.correlation.append(
                {
                    "rule": "NEW",
                    "alert_id": str(a.id),
                    "detail": "no matching open incident by source, dependency or site",
                }
            )
            kind = "opened"
            self.incidents[inc.id] = inc
        else:
            inc.correlation.append(rule)
            inc.version += 1
            kind = "updated"
        inc.alert_ids.append(a.id)
        a.incident_id = inc.id
        inc.updated_at = now
        self._recompute(inc)
        return [Change(kind, inc, self._alerts_of(inc))]

    def _open_incidents(self, tenant) -> list[Incident]:
        return [i for i in self.incidents.values() if i.tenant_id == tenant and i.status == "open"]

    def _alerts_of(self, inc: Incident) -> list[Alert]:
        return [self.alerts[x] for x in inc.alert_ids]

    def _correlate(self, a: Alert) -> tuple[Incident | None, dict[str, Any]]:
        now, cfg = self.clock(), self.cfg
        incs = sorted(self._open_incidents(a.tenant_id), key=lambda i: i.opened_at)
        # C-COLLECTOR: sources that stop reporting while their collector is offline are symptoms
        # of that outage, not of a network/application problem.
        if a.family == "NO_DATA":
            for inc in incs:
                offline = any(self.alerts[x].family == "OFFLINE" for x in inc.alert_ids)
                if offline and (now - inc.updated_at).total_seconds() <= 60:
                    return inc, {
                        "rule": "C-COLLECTOR",
                        "alert_id": str(a.id),
                        "detail": f"{short(a.entity_id)} stopped reporting while its collector "
                        "was offline",
                    }
        # C-SRC: same entity, recent activity
        for inc in incs:
            if (now - inc.updated_at).total_seconds() > cfg.source_span_s:
                continue
            if any(self.alerts[x].entity_id == a.entity_id for x in inc.alert_ids):
                return inc, {
                    "rule": "C-SRC",
                    "alert_id": str(a.id),
                    "entity": a.entity_id,
                    "detail": f"same source {short(a.entity_id)}",
                }
        # C-TOPO: dependency-connected sources (missing data is not a degradation signal)
        if a.entity_type == "source" and a.family != "NO_DATA":
            t = self.topo(a.tenant_id)
            for inc in incs:
                if (now - inc.updated_at).total_seconds() > cfg.topo_span_s:
                    continue
                for x in inc.alert_ids:
                    other = self.alerts[x]
                    if other.entity_type != "source":
                        continue
                    p = t.path(a.entity_id, other.entity_id, cfg.topo_max_hops)
                    if p:
                        return inc, {
                            "rule": "C-TOPO",
                            "alert_id": str(a.id),
                            "path": p,
                            "hops": len(p) - 1,
                            "detail": " -> ".join(short(n) for n in p),
                        }
        # C-SITE: >= N network alerts from the same collector within the span
        if a.collector_id and a.metric in NETWORK_METRICS:
            for inc in incs:
                net = [
                    self.alerts[x]
                    for x in inc.alert_ids
                    if self.alerts[x].collector_id == a.collector_id
                    and self.alerts[x].metric in NETWORK_METRICS
                    and (now - self.alerts[x].last_seen).total_seconds() <= cfg.site_span_s
                ]
                if len(net) + 1 >= cfg.site_min_alerts:
                    return inc, {
                        "rule": "C-SITE",
                        "alert_id": str(a.id),
                        "collector": a.collector_id,
                        "detail": f"{len(net) + 1} network alerts from {a.collector_id}",
                    }
        return None, {}

    # ------------------------------------------------------------------ analysis

    def _recompute(self, inc: Incident) -> None:
        from .explain import build_explanation  # local import: explain uses engine types

        alerts = self._alerts_of(inc)
        root, basis, status = self._root_cause(inc, alerts)
        inc.root_entity = root
        inc.score, comps = self._priority(inc, alerts)
        inc.priority = (
            "P1"
            if inc.score >= self.cfg.p1_min_score
            else "P2"
            if inc.score >= self.cfg.p2_min_score
            else "P3"
        )
        inc.title = self._title(inc, alerts)
        inc.explanation = build_explanation(self, inc, alerts, root, basis, status, comps)

    def _root_cause(self, inc: Incident, alerts: list[Alert]) -> tuple[str | None, str, str]:
        t = self.topo(inc.tenant_id)
        srcs: dict[str, datetime] = {}
        # Missing data never decides the cause while real degradation signals exist.
        basis = [a for a in alerts if a.family != "NO_DATA"] or alerts
        for a in basis:
            if a.entity_type == "source":
                srcs[a.entity_id] = min(srcs.get(a.entity_id, a.onset), a.onset)
        if not srcs:
            ents = sorted({a.entity_id for a in alerts})
            return (
                ents[0] if len(ents) == 1 else None,
                "collector-level incident",
                "determined" if len(ents) == 1 else "undetermined",
            )
        if len(srcs) == 1:
            pid = next(iter(srcs))
            return pid, "single affected source", "determined"
        hops = self.cfg.topo_max_hops
        tops = [x for x in srcs if not any(y != x and t.is_upstream_of(y, x, hops) for y in srcs)]
        related = any(t.path(x, y, hops) for x in srcs for y in srcs if x < y)
        if not related:
            return None, "affected sources have no reported dependency relation", "undetermined"
        tops.sort(key=lambda x: srcs[x])
        if len(tops) > 1 and abs((srcs[tops[1]] - srcs[tops[0]]).total_seconds()) < 2:
            return (
                None,
                f"{len(tops)} upstream candidates with near-simultaneous onset",
                "undetermined",
            )
        root = tops[0]
        deps = [x for x in srcs if x != root and t.is_upstream_of(root, x, hops)]
        lead = ""
        if deps:
            first_dep = min(srcs[d] for d in deps)
            lead_s = (first_dep - srcs[root]).total_seconds()
            lead = f"; its first alert preceded dependents' by {lead_s:.0f} s"
        return (
            root,
            (
                f"{short(root)} is upstream of {len(deps)} affected source(s) via reported "
                f"dependencies{lead}"
            ),
            "determined",
        )

    def _priority(self, inc: Incident, alerts: list[Alert]) -> tuple[float, dict[str, float]]:
        max_sev = max(alerts, key=lambda a: SEV_RANK[a.severity]).severity
        comps = {
            "severity_weight": SEV_WEIGHT[max_sev],
            "affected_entities_x2": 2 * len({a.entity_id for a in alerts}),
            "persistence_minutes": round(
                min(10.0, (max(a.last_seen for a in alerts) - inc.opened_at).total_seconds() / 60),
                1,
            ),
            "security_flag_x3": 3 if any(a.family == "SECURITY" for a in alerts) else 0,
            "recurrence": min(5, sum(1 for a in alerts if a.dedup_hits > 0)),
        }
        return round(sum(comps.values()), 1), comps

    def _title(self, inc: Incident, alerts: list[Alert]) -> str:
        ents = {a.entity_id for a in alerts}
        kind = lambda e: self.kinds.get((inc.tenant_id, e), "source").replace("_", " ")  # noqa: E731
        if any(a.family == "SECURITY" for a in alerts):
            e = next(a.entity_id for a in alerts if a.family == "SECURITY")
            return f"Repeated failed logins on {kind(e)} {short(e)}"
        if any(a.family == "OFFLINE" for a in alerts):
            return f"Collector {next(a.entity_id for a in alerts if a.family == 'OFFLINE')} offline"
        if inc.root_entity and len(ents) > 1:
            return (
                f"{kind(inc.root_entity).capitalize()} {short(inc.root_entity)} degraded, "
                f"affecting {len(ents) - 1} dependent source(s)"
            )
        e = next(iter(ents))
        fam = {a.family for a in alerts}
        what = (
            "Baseline deviation"
            if fam == {"BASELINE"}
            else "Rising trend"
            if fam == {"TREND"}
            else "Degradation"
        )
        metrics = ", ".join(sorted({a.metric for a in alerts}))
        if len(ents) > 1:
            return f"{what} on {len(ents)} sources ({metrics})"
        return f"{what} on {kind(e)} {short(e)} ({metrics})"

    # ------------------------------------------------------------------ housekeeping

    def sweep(self) -> list[Change]:
        """Resolve alerts whose condition has been clear long enough; resolve empty incidents."""
        now, out = self.clock(), []
        with self.lock:
            touched: set[uuid.UUID] = set()
            for a in self.alerts.values():
                if (
                    a.status == "open"
                    and (now - a.last_true).total_seconds() > self.cfg.resolve_after_s
                ):
                    a.status, a.resolved_at = "resolved", now
                    self.open_alert_by_key.pop(
                        (a.tenant_id, a.entity_type, a.entity_id, a.metric, a.family), None
                    )
                    if a.incident_id:
                        touched.add(a.incident_id)
            for iid in touched:
                inc = self.incidents[iid]
                alerts = self._alerts_of(inc)
                if inc.status == "open" and all(a.status == "resolved" for a in alerts):
                    inc.status, inc.resolved_at, inc.updated_at = "resolved", now, now
                    inc.version += 1
                    self._recompute(inc)
                    out.append(Change("resolved", inc, alerts))
        return out

    def acknowledge(self, tenant: uuid.UUID, iid: uuid.UUID, actor: str) -> Incident | None:
        with self.lock:
            inc = self.incidents.get(iid)
            if inc is None or inc.tenant_id != tenant:
                return None
            if inc.acked_at is None:
                inc.acked_at, inc.acked_by = self.clock(), actor
            return inc

    def noise(self, tenant: uuid.UUID) -> dict[str, Any]:
        with self.lock:
            incs = [i for i in self.incidents.values() if i.tenant_id == tenant]
            raw = self.raw_alert_count.get(tenant, 0)
            dedup = sum(a.dedup_hits for a in self.alerts.values() if a.tenant_id == tenant)
            return {
                "raw_alert_signals": raw + dedup,
                "alerts": raw,
                "incidents": len(incs),
                "ratio": round((raw + dedup) / len(incs), 1) if incs else None,
                "transients_suppressed": self.transients.get(tenant, 0),
            }
