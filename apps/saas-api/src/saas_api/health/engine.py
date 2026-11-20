"""Four-state health engine (pure logic, injectable clock, thread-safe).

Entities: source (by pseudonymous source_pid), collector, tenant (roll-up).

Source health
- Each metric's latest window is classified with the configured thresholds (mean for numeric,
  any zero for binary). The candidate source state is the WORST metric state; every metric that
  is not Excellent becomes a reason {code, metric, observed, threshold, unit, window_end}.
- Hysteresis on the base state, stepped once per new event-time window:
  * degrade when the worse candidate holds for 2 consecutive windows; critical conditions
    (binary down, connectivity lost) degrade immediately;
  * recover one level at a time after 5 consecutive better windows.
- Overlays (applied on top of the base state, worst wins):
  * staleness (server receive time): > stale_fair_after_s -> Fair STALE_DATA,
    > stale_poor_after_s -> Poor NO_DATA; cleared as soon as data arrives again;
  * security findings: risk high -> Poor, medium -> Fair, for SECURITY_HOLD_S.
- Late/out-of-order windows (window_end <= last seen for that metric) never change state.

Collector health (no hysteresis): heartbeat age > offline -> Poor; > late -> Fair; oldest pending
> 30 s -> Fair; adapter auth_error/error -> Fair; degraded -> Good; outbox >= 100 -> Good.

Every change of an entity's effective state produces a Transition with UTC time + reasons.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from .thresholds import Thresholds

EXCELLENT, GOOD, FAIR, POOR = "Excellent", "Good", "Fair", "Poor"
ORDER = (EXCELLENT, GOOD, FAIR, POOR)
RANK = {s: i for i, s in enumerate(ORDER)}

DEGRADE_WINDOWS = 2
RECOVER_WINDOWS = 5
SECURITY_HOLD_S = 300.0
METRIC_FRESH_S = 30.0  # metric tracks older than this (event time) no longer drive the candidate
HEARTBEAT_LATE_S = 20.0
BACKLOG_DELAY_S = 30.0
BACKLOG_DEPTH = 100


def worst(*states: str | None) -> str:
    present = [s for s in states if s]
    return max(present, key=RANK.__getitem__) if present else EXCELLENT


@dataclass
class MetricTrack:
    state: str
    observed: float
    threshold: float | None
    unit: str
    window_end: datetime
    critical: bool


@dataclass
class Transition:
    tenant_id: uuid.UUID
    region: str
    entity_type: str
    entity_id: str
    from_state: str | None
    to_state: str
    at_utc: datetime
    event_time: datetime | None
    reasons: list[dict[str, Any]]

    def as_event(self) -> dict[str, Any]:
        return {
            "type": "health_transition",
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "from_state": self.from_state,
            "to_state": self.to_state,
            "at_utc": self.at_utc,
            "event_time": self.event_time,
            "reasons": self.reasons,
        }


@dataclass
class Entity:
    tenant_id: uuid.UUID
    region: str
    type: str
    id: str
    state: str | None = None  # effective state (None until first evaluation)
    base: str = EXCELLENT
    reasons: list[dict[str, Any]] = field(default_factory=list)
    since: datetime | None = None
    updated_at: datetime | None = None
    last_event_time: datetime | None = None
    last_received: datetime | None = None
    worse_streak: int = 0
    better_streak: int = 0
    last_eval_window: datetime | None = None
    metrics: dict[str, MetricTrack] = field(default_factory=dict)
    base_reasons: list[dict[str, Any]] = field(default_factory=list)
    security: tuple[str, dict[str, Any], datetime] | None = None
    meta: dict[str, Any] = field(default_factory=dict)  # source_kind / collector heartbeat facts

    def view(self) -> dict[str, Any]:
        return {
            "entity_type": self.type,
            "entity_id": self.id,
            "state": self.state,
            "reasons": self.reasons,
            "since": self.since.isoformat() if self.since else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_event_time": self.last_event_time.isoformat() if self.last_event_time else None,
            "last_received": self.last_received.isoformat() if self.last_received else None,
            "meta": self.meta,
            "factors": [
                {
                    "metric": m,
                    "state": t.state,
                    "observed": t.observed,
                    "threshold": t.threshold,
                    "unit": t.unit,
                    "window_end": t.window_end.isoformat(),
                }
                for m, t in sorted(self.metrics.items())
            ],
        }


class HealthEngine:
    def __init__(
        self,
        thresholds: Thresholds,
        clock: Callable[[], datetime] | None = None,
        offline_after_s: float = 30.0,
    ):
        self.t = thresholds
        self.clock = clock or (lambda: datetime.now(UTC))
        self.offline_after_s = offline_after_s
        self.entities: dict[tuple[uuid.UUID, str, str], Entity] = {}
        self.lock = threading.RLock()

    # ------------------------------------------------------------------ helpers

    def _entity(self, tenant: uuid.UUID, region: str, etype: str, eid: str) -> Entity:
        key = (tenant, etype, eid)
        e = self.entities.get(key)
        if e is None:
            e = Entity(tenant, region, etype, eid)
            self.entities[key] = e
        return e

    def classify(
        self, metric: str, mean: float, minimum: float, unit: str, window_end: datetime
    ) -> MetricTrack:
        if metric in self.t.binary_poor_when_zero:
            down = minimum <= 0
            return MetricTrack(POOR if down else EXCELLENT, minimum, 0.0, unit, window_end, down)
        th = self.t.numeric.get(metric)
        if th is None:
            return MetricTrack(EXCELLENT, mean, None, unit, window_end, False)
        if mean > th.poor:
            return MetricTrack(POOR, mean, th.poor, unit, window_end, False)
        if mean > th.fair:
            return MetricTrack(FAIR, mean, th.fair, unit, window_end, False)
        if mean > th.good:
            return MetricTrack(GOOD, mean, th.good, unit, window_end, False)
        return MetricTrack(EXCELLENT, mean, th.good, unit, window_end, False)

    def _commit(
        self, e: Entity, new_state: str, reasons: list[dict[str, Any]], event_time: datetime | None
    ) -> Transition | None:
        now = self.clock()
        e.reasons = reasons
        e.updated_at = now
        if event_time and (e.last_event_time is None or event_time > e.last_event_time):
            e.last_event_time = event_time
        if new_state == e.state:
            return None
        prev = e.state
        e.state, e.since = new_state, now
        return Transition(
            e.tenant_id, e.region, e.type, e.id, prev, new_state, now, event_time, reasons
        )

    def _effective(self, e: Entity) -> tuple[str, list[dict[str, Any]]]:
        now = self.clock()
        reasons = list(e.base_reasons)
        state = e.base
        if e.last_received is not None:
            age = (now - e.last_received).total_seconds()
            if age > self.t.stale_poor_after_s:
                state = worst(state, POOR)
                reasons.append(
                    {
                        "code": "NO_DATA",
                        "seconds_since_data": round(age, 1),
                        "threshold_s": self.t.stale_poor_after_s,
                    }
                )
            elif age > self.t.stale_fair_after_s:
                state = worst(state, FAIR)
                reasons.append(
                    {
                        "code": "STALE_DATA",
                        "seconds_since_data": round(age, 1),
                        "threshold_s": self.t.stale_fair_after_s,
                    }
                )
        if e.security is not None:
            sec_state, sec_reason, expires = e.security
            if now < expires:
                state = worst(state, sec_state)
                reasons.append(sec_reason)
            else:
                e.security = None
        return state, reasons

    # ------------------------------------------------------------------ sources

    def _candidate(self, e: Entity) -> tuple[str, list[dict[str, Any]], bool]:
        latest = max((t.window_end for t in e.metrics.values()), default=None)
        state, reasons, critical = EXCELLENT, [], False
        for metric, t in sorted(e.metrics.items()):
            if latest and (latest - t.window_end).total_seconds() > METRIC_FRESH_S:
                continue
            if t.state != EXCELLENT:
                state = worst(state, t.state)
                critical = critical or t.critical
                reasons.append(
                    {
                        "code": f"{metric.upper()}_{t.state.upper()}",
                        "metric": metric,
                        "observed": round(t.observed, 3),
                        "threshold": t.threshold,
                        "unit": t.unit,
                        "window_end": t.window_end.isoformat(),
                        **({"critical": True} if t.critical else {}),
                    }
                )
        return state, reasons, critical

    def _step(self, e: Entity) -> None:
        cand, reasons, critical = self._candidate(e)
        cur = e.base
        if RANK[cand] > RANK[cur]:
            e.better_streak = 0
            e.worse_streak += 1
            if critical or e.worse_streak >= DEGRADE_WINDOWS:
                e.base, e.worse_streak = cand, 0
                e.base_reasons = reasons
            else:
                # State is held; the factors that would degrade it are shown, plus the marker.
                e.base_reasons = [
                    *reasons,
                    {
                        "code": "PENDING_DEGRADE",
                        "candidate": cand,
                        "windows": f"{e.worse_streak}/{DEGRADE_WINDOWS}",
                    },
                ]
        elif RANK[cand] < RANK[cur]:
            e.worse_streak = 0
            e.better_streak += 1
            if e.better_streak >= RECOVER_WINDOWS:
                e.base = ORDER[RANK[cur] - 1]
                e.better_streak = 0
            e.base_reasons = reasons + (
                []
                if e.base == cand
                else [
                    {
                        "code": "RECOVERING",
                        "candidate": cand,
                        "windows": f"{e.better_streak}/{RECOVER_WINDOWS}",
                    }
                ]
            )
        else:
            e.worse_streak = e.better_streak = 0
            e.base_reasons = reasons

    def observe_metrics(
        self, tenant: uuid.UUID, region: str, rows: Iterable[dict[str, Any]]
    ) -> list[Transition]:
        """rows: accepted metric_summary rows (dicts as stored)."""
        out: list[Transition] = []
        now = self.clock()
        by_source: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            by_source.setdefault(r["source_pid"], []).append(r)
        with self.lock:
            for pid, rs in by_source.items():
                e = self._entity(tenant, region, "source", pid)
                e.last_received = now
                e.meta["source_kind"] = rs[0].get("source_kind")
                rs.sort(key=lambda r: r["window_end"])
                windows = sorted({r["window_end"] for r in rs})
                for w in windows:
                    advanced = False
                    for r in (x for x in rs if x["window_end"] == w):
                        tr = e.metrics.get(r["metric"])
                        if tr is not None and r["window_end"] <= tr.window_end:
                            continue  # late / out-of-order: history only, never changes state
                        e.metrics[r["metric"]] = self.classify(
                            r["metric"], r["mean"], r["min"], r["unit"], r["window_end"]
                        )
                        advanced = True
                    if advanced and (e.last_eval_window is None or w > e.last_eval_window):
                        e.last_eval_window = w
                        self._step(e)
                state, reasons = self._effective(e)
                t = self._commit(e, state, reasons, max(windows))
                if t:
                    out.append(t)
            out += self._rollup(tenant, region)
        return out

    def observe_security(
        self, tenant: uuid.UUID, region: str, rows: Iterable[dict[str, Any]]
    ) -> list[Transition]:
        out: list[Transition] = []
        now = self.clock()
        with self.lock:
            for r in rows:
                risk = r["risk_level"]
                if risk not in ("medium", "high"):
                    continue
                e = self._entity(tenant, region, "source", r["source_pid"])
                sec_state = POOR if risk == "high" else FAIR
                reason = {
                    "code": f"SECURITY_{r['summary_code']}",
                    "risk_level": risk,
                    "failure_count": r["failure_count"],
                    "distinct_user_count": r["distinct_user_count"],
                    "window_end": r["window_end"].isoformat(),
                    **({"critical": True} if risk == "high" else {}),
                }
                if e.security is None or RANK[sec_state] >= RANK[e.security[0]]:
                    e.security = (sec_state, reason, now + timedelta(seconds=SECURITY_HOLD_S))
                if e.last_received is None:
                    e.last_received = now
                state, reasons = self._effective(e)
                t = self._commit(e, state, reasons, r["window_end"])
                if t:
                    out.append(t)
            out += self._rollup(tenant, region)
        return out

    # ------------------------------------------------------------------ collectors

    def _collector_state(self, e: Entity) -> tuple[str, list[dict[str, Any]]]:
        now = self.clock()
        m = e.meta
        if e.last_received is None:
            return POOR, [{"code": "NEVER_SEEN"}]
        age = (now - e.last_received).total_seconds()
        if age > self.offline_after_s:
            return POOR, [
                {
                    "code": "HEARTBEAT_MISSING",
                    "seconds_since_heartbeat": round(age, 1),
                    "threshold_s": self.offline_after_s,
                    "critical": True,
                }
            ]
        state, reasons = EXCELLENT, []
        if age > HEARTBEAT_LATE_S:
            state = worst(state, FAIR)
            reasons.append(
                {
                    "code": "HEARTBEAT_LATE",
                    "seconds_since_heartbeat": round(age, 1),
                    "threshold_s": HEARTBEAT_LATE_S,
                }
            )
        if (m.get("oldest_pending_age_s") or 0) > BACKLOG_DELAY_S:
            state = worst(state, FAIR)
            reasons.append(
                {
                    "code": "BACKLOG_DELAYED",
                    "oldest_pending_age_s": round(m["oldest_pending_age_s"], 1),
                    "threshold_s": BACKLOG_DELAY_S,
                }
            )
        if (m.get("outbox_depth") or 0) >= BACKLOG_DEPTH:
            state = worst(state, GOOD)
            reasons.append(
                {"code": "BACKLOG", "outbox_depth": m["outbox_depth"], "threshold": BACKLOG_DEPTH}
            )
        for a in m.get("adapters") or []:
            st = a.get("status")
            if st in ("auth_error", "error"):
                state = worst(state, FAIR)
                reasons.append({"code": f"ADAPTER_{st.upper()}", "adapter": a.get("name")})
            elif st == "degraded":
                state = worst(state, GOOD)
                reasons.append({"code": "ADAPTER_DEGRADED", "adapter": a.get("name")})
        return state, reasons

    def observe_heartbeat(
        self, tenant: uuid.UUID, region: str, collector_id: str, facts: dict[str, Any]
    ) -> list[Transition]:
        with self.lock:
            e = self._entity(tenant, region, "collector", collector_id)
            e.last_received = self.clock()
            e.meta.update(facts)
            state, reasons = self._collector_state(e)
            out = [t] if (t := self._commit(e, state, reasons, facts.get("sent_at"))) else []
            return out + self._rollup(tenant, region)

    def register_collector(
        self,
        tenant: uuid.UUID,
        region: str,
        collector_id: str,
        last_seen: datetime | None,
        facts: dict[str, Any],
    ) -> None:
        """Startup load: so a collector that never heartbeats again is still detected offline."""
        with self.lock:
            e = self._entity(tenant, region, "collector", collector_id)
            if e.last_received is None:
                e.last_received = last_seen
            e.meta.update(facts)

    def restore(self, tenant: uuid.UUID, region: str, row: dict[str, Any]) -> None:
        """Startup load of persisted current state (counters restart; state is preserved)."""
        with self.lock:
            e = self._entity(tenant, region, row["entity_type"], row["entity_id"])
            e.state = row["state"]
            e.base = row["state"] if row["entity_type"] == "source" else EXCELLENT
            e.reasons = row.get("reasons") or []
            e.base_reasons = [
                r for r in e.reasons if r.get("code") not in ("STALE_DATA", "NO_DATA")
            ]
            e.since = row.get("since")
            e.updated_at = row.get("updated_at")
            e.last_event_time = row.get("last_event_time")
            if row["entity_type"] == "source" and e.last_received is None:
                e.last_received = row.get("updated_at")

    # ------------------------------------------------------------------ periodic

    def sweep(self) -> list[Transition]:
        """Staleness, offline collectors, expiring security holds. Run every few seconds."""
        out: list[Transition] = []
        with self.lock:
            tenants: dict[uuid.UUID, str] = {}
            for e in list(self.entities.values()):
                if e.type == "source":
                    state, reasons = self._effective(e)
                elif e.type == "collector":
                    state, reasons = self._collector_state(e)
                else:
                    continue
                t = self._commit(e, state, reasons, None) if state != e.state else None
                if t:
                    out.append(t)
                tenants[e.tenant_id] = e.region
            for tenant, region in tenants.items():
                out += self._rollup(tenant, region)
        return out

    def _rollup(self, tenant: uuid.UUID, region: str) -> list[Transition]:
        members = [
            e
            for (t, typ, _), e in self.entities.items()
            if t == tenant and typ in ("source", "collector") and e.state
        ]
        if not members:
            return []
        counts = {s: 0 for s in ORDER}
        for e in members:
            counts[e.state] += 1
        state = worst(*(e.state for e in members))
        offenders = sorted(
            (e for e in members if e.state != EXCELLENT),
            key=lambda e: (-RANK[e.state], e.type, e.id),
        )[:5]
        reasons = [{"code": "WORST_OF_MEMBERS", "counts": counts}] + [
            {"code": "MEMBER", "entity_type": e.type, "entity_id": e.id, "state": e.state}
            for e in offenders
        ]
        te = self._entity(tenant, region, "tenant", "tenant")
        t = self._commit(te, state, reasons, None)
        return [t] if t else []

    # ------------------------------------------------------------------ reads

    def snapshot(self, tenant: uuid.UUID, etype: str | None = None) -> list[dict[str, Any]]:
        with self.lock:
            return [
                e.view()
                for (t, typ, _), e in self.entities.items()
                if t == tenant and (etype is None or typ == etype) and e.state
            ]

    def get(self, tenant: uuid.UUID, etype: str, eid: str) -> dict[str, Any] | None:
        with self.lock:
            e = self.entities.get((tenant, etype, eid))
            return e.view() if e and e.state else None
