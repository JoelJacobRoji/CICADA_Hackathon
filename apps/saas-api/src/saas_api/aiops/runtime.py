"""AIOps runtime: engine, write-behind store, device notifications, LLM worker, startup load.

Device notifications: pseudonymous only. The collector re-identifies sources locally.
LLM: background worker; per-incident debounce; region policy (eu-west never sent); every prompt
canary-scanned and stored exactly; every response grounding-checked, else deterministic fallback.
"""

from __future__ import annotations

import asyncio
import queue
import threading
import time
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..config import REGIONS, get_settings
from ..db import identity_connection, tenant_connection
from ..health import runtime as health
from ..llm import client as llm_client
from ..llm.grounding import check as grounding_check
from ..llm.prompt import build_prompt, canary_findings
from ..repo import (
    alerts_t,
    incidents_t,
    llm_explanations_t,
    metric_summaries,
    notifications_t,
    topology_edges,
)
from .config import load as load_cfg
from .engine import AiopsEngine, Change, Incident

log = structlog.get_logger("saas.aiops")


@lru_cache(maxsize=1)
def engine() -> AiopsEngine:
    return AiopsEngine(load_cfg(str(get_settings().aiops_path)), health.engine().classify)


def cfg():
    return load_cfg(str(get_settings().aiops_path))


# ------------------------------------------------------------------ notifications (pseudonymous)


def notification_payload(inc: Incident) -> dict[str, Any]:
    x = inc.explanation
    return {
        "incident_id": str(inc.id),
        "version": inc.version,
        "status": inc.status,
        "priority": inc.priority,
        "title": inc.title,
        "opened_at": inc.opened_at.isoformat(),
        "probable_cause": x.get("probable_cause"),
        "evidence_strength": (x.get("evidence_strength") or {}).get("level"),
        "signals": [
            {
                "entity": t["entity"],
                "metric": t["metric"],
                "code": t["code"],
                "severity": t["severity"],
                "observed": (t.get("evidence") or {}).get("observed"),
                "unit": (t.get("evidence") or {}).get("unit"),
            }
            for t in x.get("trigger_signals", [])
        ],
        "recommendations": [
            {"title": r["title"], "steps": r["steps"], "rationale": r["rationale"]}
            for r in x.get("recommendations", [])
        ],
        "uncertainty": x.get("uncertainty", []),
        "dashboard_path": f"/incidents/{inc.id}",
    }


def _collectors_of(change: Change) -> set[str]:
    return {a.collector_id for a in change.alerts if a.collector_id}


# ------------------------------------------------------------------ write-behind store


class Store:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._incidents: dict[uuid.UUID, Incident] = {}
        self._alerts: dict[uuid.UUID, Any] = {}
        self._notifications: list[dict[str, Any]] = []
        self._llm: list[dict[str, Any]] = []

    def enqueue(self, changes: list[Change]) -> None:
        now = datetime.now(UTC)
        with self._lock:
            for ch in changes:
                self._incidents[ch.incident.id] = ch.incident
                for a in ch.alerts:
                    self._alerts[a.id] = a
                for col in _collectors_of(ch):
                    self._notifications.append(
                        {
                            "tenant_id": ch.incident.tenant_id,
                            "region": ch.incident.region,
                            "id": uuid.uuid4(),
                            "collector_id": col,
                            "incident_id": ch.incident.id,
                            "incident_version": ch.incident.version,
                            "kind": "incident",
                            "created_at": now,
                            "payload": notification_payload(ch.incident),
                        }
                    )

    def enqueue_llm(self, row: dict[str, Any], notify: list[dict[str, Any]]) -> None:
        with self._lock:
            self._llm.append(row)
            self._notifications.extend(notify)

    def flush(self) -> int:
        with self._lock:
            incs, self._incidents = self._incidents, {}
            alerts, self._alerts = self._alerts, {}
            notes, self._notifications = self._notifications, []
            llm, self._llm = self._llm, []
        if not (incs or alerts or notes or llm):
            return 0
        groups: dict[tuple[str, uuid.UUID], dict[str, list]] = defaultdict(
            lambda: {"i": [], "a": [], "n": [], "l": []}
        )
        for i in incs.values():
            groups[(i.region, i.tenant_id)]["i"].append(i)
        for a in alerts.values():
            groups[(a.region, a.tenant_id)]["a"].append(a)
        for n in notes:
            groups[(n["region"], n["tenant_id"])]["n"].append(n)
        for r in llm:
            groups[(r["region"], r["tenant_id"])]["l"].append(r)
        n_written = 0
        for (region, tenant), g in groups.items():
            try:
                with tenant_connection(region, tenant) as c:
                    for i in g["i"]:
                        vals = dict(
                            tenant_id=tenant,
                            id=i.id,
                            status=i.status,
                            priority=i.priority,
                            score=i.score,
                            title=i.title,
                            root_entity=i.root_entity,
                            opened_at=i.opened_at,
                            updated_at=i.updated_at,
                            resolved_at=i.resolved_at,
                            acked_at=i.acked_at,
                            acked_by=i.acked_by,
                            version=i.version,
                            explanation=i.explanation,
                        )
                        st = pg_insert(incidents_t).values(**vals)
                        c.execute(
                            st.on_conflict_do_update(
                                index_elements=["tenant_id", "id"],
                                set_={
                                    k: st.excluded[k] for k in vals if k not in ("tenant_id", "id")
                                },
                            )
                        )
                    for a in g["a"]:
                        vals = dict(
                            tenant_id=tenant,
                            id=a.id,
                            incident_id=a.incident_id,
                            entity_type=a.entity_type,
                            entity_id=a.entity_id,
                            collector_id=a.collector_id,
                            metric=a.metric,
                            family=a.family,
                            code=a.code,
                            severity=a.severity,
                            category=a.category,
                            status=a.status,
                            onset=a.onset,
                            first_seen=a.first_seen,
                            last_seen=a.last_seen,
                            resolved_at=a.resolved_at,
                            occurrences=a.occurrences,
                            dedup_hits=a.dedup_hits,
                            evidence=a.evidence,
                        )
                        st = pg_insert(alerts_t).values(**vals)
                        c.execute(
                            st.on_conflict_do_update(
                                index_elements=["tenant_id", "id"],
                                set_={
                                    k: st.excluded[k] for k in vals if k not in ("tenant_id", "id")
                                },
                            )
                        )
                    for n in g["n"]:
                        c.execute(
                            pg_insert(notifications_t)
                            .values(**{k: v for k, v in n.items() if k != "region"})
                            .on_conflict_do_nothing()
                        )
                    for r in g["l"]:
                        c.execute(
                            pg_insert(llm_explanations_t)
                            .values(**{k: v for k, v in r.items() if k != "region"})
                            .on_conflict_do_nothing()
                        )
                n_written += sum(len(v) for v in g.values())
            except Exception as exc:  # noqa: BLE001 - re-queue: never silently lose incidents
                log.error("aiops_persist_failed", error=type(exc).__name__)
                with self._lock:
                    for i in g["i"]:
                        self._incidents.setdefault(i.id, i)
                    for a in g["a"]:
                        self._alerts.setdefault(a.id, a)
                    self._notifications = g["n"] + self._notifications
                    self._llm = g["l"] + self._llm
        return n_written


store = Store()


# ------------------------------------------------------------------ LLM worker


class LlmWorker:
    """Single background thread. Latest version per incident wins (debounce)."""

    def __init__(self) -> None:
        self.q: queue.Queue[uuid.UUID] = queue.Queue()
        self.pending: dict[uuid.UUID, Incident] = {}
        self.lock = threading.Lock()
        self.thread: threading.Thread | None = None
        self.last_call = 0.0
        self.loop: asyncio.AbstractEventLoop | None = None
        self.publish = None
        self.http = None  # injectable httpx client (tests)

    def submit(self, inc: Incident) -> None:
        with self.lock:
            fresh = inc.id not in self.pending
            self.pending[inc.id] = inc
        if fresh:
            self.q.put(inc.id)
        self._ensure_thread()

    def _ensure_thread(self) -> None:
        if self.thread is None or not self.thread.is_alive():
            self.thread = threading.Thread(target=self._run, name="aegis-llm", daemon=True)
            self.thread.start()

    def _run(self) -> None:
        while True:
            iid = self.q.get()
            with self.lock:
                inc = self.pending.pop(iid, None)
            if inc is not None:
                try:
                    self.process(inc)
                except Exception as exc:  # noqa: BLE001 - worker must survive
                    log.error("llm_worker_failed", error=type(exc).__name__)

    def process(self, inc: Incident) -> dict[str, Any]:
        c = cfg().llm
        s = get_settings()
        now = datetime.now(UTC)
        prompt = build_prompt(inc.explanation)
        row: dict[str, Any] = {
            "tenant_id": inc.tenant_id,
            "region": inc.region,
            "incident_id": inc.id,
            "incident_version": inc.version,
            "created_at": now,
            "provider": "gemini",
            "model": None,
            "prompt": {"system": prompt["system"], "user": prompt["user"]},
            "response": None,
            "grounding": {},
            "latency_ms": None,
        }
        if not c.get("enabled", False) or s.gemini_api_key is None:
            row["status"] = "disabled"
            row["grounding"] = {"note": "LLM disabled or no API key configured"}
        elif inc.region not in c.get("regions_enabled", []):
            row["status"] = "disabled_by_policy"
            row["grounding"] = {
                "note": f"region {inc.region} not enabled for external LLM "
                "(data residency); deterministic explanation only"
            }
            row["prompt"] = {"not_sent": True}
        elif found := canary_findings(prompt["user"]):
            row["status"] = "blocked_by_canary"
            row["grounding"] = {"canary": found}
            row["prompt"] = {"not_sent": True, "reason": "canary match", "patterns": found}
        else:
            wait = float(c.get("min_seconds_between_calls", 4)) - (
                time.monotonic() - self.last_call
            )
            if wait > 0:
                time.sleep(wait)
            self.last_call = time.monotonic()
            res = llm_client.explain(s.gemini_api_key.get_secret_value(), c, prompt, self.http)
            row.update(model=res.model, latency_ms=res.latency_ms)
            if res.status != "ok":
                row["status"] = "error"
                row["grounding"] = {"error": res.error}
            else:
                g = grounding_check(res.response, prompt["evidence"])
                row["response"] = res.response
                row["grounding"] = g
                row["status"] = "ok" if g["ok"] else "rejected_ungrounded"
        notify = []
        if row["status"] == "ok":
            for col in {a.collector_id for a in engine()._alerts_of(inc) if a.collector_id}:  # noqa: SLF001
                notify.append(
                    {
                        "tenant_id": inc.tenant_id,
                        "region": inc.region,
                        "id": uuid.uuid4(),
                        "collector_id": col,
                        "incident_id": inc.id,
                        "incident_version": inc.version,
                        "kind": "ai_explanation",
                        "created_at": now,
                        "payload": {
                            "incident_id": str(inc.id),
                            "version": inc.version,
                            "model": row["model"],
                            "grounded": True,
                            **row["response"],
                        },
                    }
                )
        store.enqueue_llm(row, notify)
        log.info(
            "llm_explanation",
            incident=str(inc.id),
            status=row["status"],
            model=row["model"],
            latency_ms=row["latency_ms"],
        )
        loop, publish = self.loop, self.publish
        if loop is not None and publish is not None and loop.is_running():
            event = {
                "type": "incident_ai",
                "incident_id": str(inc.id),
                "version": inc.version,
                "status": row["status"],
            }
            coro = publish(inc.tenant_id, event)
            try:
                asyncio.run_coroutine_threadsafe(coro, loop)
            except RuntimeError:  # loop closed between the check and the call
                coro.close()
        return row


llm_worker = LlmWorker()


# ------------------------------------------------------------------ glue


def handle(changes: list[Change]) -> list[dict[str, Any]]:
    """Persist + notify + LLM for engine changes; returns WS events to publish."""
    if not changes:
        return []
    store.enqueue(changes)
    events, seen = [], set()
    for ch in changes:
        inc = ch.incident
        if ch.kind in ("opened", "updated") and (inc.id, inc.version) not in seen:
            seen.add((inc.id, inc.version))
            llm_worker.submit(inc)
        events.append(
            {
                "type": "incident",
                "kind": ch.kind,
                "incident_id": str(inc.id),
                "version": inc.version,
                "priority": inc.priority,
                "title": inc.title,
                "status": inc.status,
            }
        )
    return events


def load_state() -> None:
    """Topology + warm baselines (last 5 min) for every tenant (open incidents restart fresh)."""
    eng = engine()
    since = datetime.now(UTC) - timedelta(minutes=5)
    for region in REGIONS:
        try:
            with identity_connection(region) as c:
                tenants = [r.tenant_id for r in c.execute(text("SELECT * FROM list_tenants()"))]
            for tid in tenants:
                with tenant_connection(region, tid) as c:
                    eng.observe_edges(
                        tid, [dict(r._mapping) for r in c.execute(select(topology_edges))]
                    )
                    rows = c.execute(
                        select(
                            metric_summaries.c.source_pid,
                            metric_summaries.c.metric,
                            metric_summaries.c.unit,
                            metric_summaries.c.mean,
                            metric_summaries.c.min,
                            metric_summaries.c.window_end,
                        )
                        .where(metric_summaries.c.window_end >= since)
                        .order_by(metric_summaries.c.window_end)
                    ).all()
                series: dict[tuple, list] = defaultdict(list)
                for r in rows:
                    series[(tid, r.source_pid, r.metric)].append(
                        (r.min if r.unit == "bool" else r.mean, r.window_end)
                    )
                for key, vals in series.items():
                    eng.baselines.seed(key, [v for v, _ in vals], vals[-1][1])
        except Exception as exc:  # noqa: BLE001 - start without warm state rather than not at all
            log.error("aiops_load_failed", region=region, error=type(exc).__name__)


def reset() -> None:
    """Tests only."""
    engine.cache_clear()
    with store._lock:  # noqa: SLF001
        store._incidents.clear()  # noqa: SLF001
        store._alerts.clear()  # noqa: SLF001
        store._notifications.clear()  # noqa: SLF001
        store._llm.clear()  # noqa: SLF001
    with llm_worker.lock:
        llm_worker.pending.clear()
