"""Process-wide health runtime: engine singleton, persistence writer, sweeper, startup loader.

Persistence is write-behind (never on the ingest request path, K22): transitions and current
state are queued and flushed per tenant in one transaction about once per second.
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import structlog
from sqlalchemy import insert, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from starlette.concurrency import run_in_threadpool

from ..config import REGIONS, get_settings
from ..db import identity_connection, tenant_connection
from ..repo import collectors, health_current, health_transitions
from .engine import HealthEngine, Transition
from .thresholds import load

log = structlog.get_logger("saas.health")


@lru_cache(maxsize=1)
def engine() -> HealthEngine:
    s = get_settings()
    return HealthEngine(load(str(s.thresholds_path)), offline_after_s=s.offline_after_seconds)


class Writer:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: list[Transition] = []

    def enqueue(self, transitions: list[Transition]) -> None:
        if transitions:
            with self._lock:
                self._pending.extend(transitions)

    def flush(self) -> int:
        with self._lock:
            batch, self._pending = self._pending, []
        if not batch:
            return 0
        groups: dict[tuple[str, uuid.UUID], list[Transition]] = defaultdict(list)
        for t in batch:
            groups[(t.region, t.tenant_id)].append(t)
        written = 0
        for (region, tenant), ts in groups.items():
            latest: dict[tuple[str, str], Transition] = {}
            for t in ts:
                latest[(t.entity_type, t.entity_id)] = t
            try:
                with tenant_connection(region, tenant) as c:
                    c.execute(
                        insert(health_transitions),
                        [
                            {
                                "tenant_id": tenant,
                                "entity_type": t.entity_type,
                                "entity_id": t.entity_id,
                                "from_state": t.from_state,
                                "to_state": t.to_state,
                                "at_utc": t.at_utc,
                                "event_time": t.event_time,
                                "reasons": t.reasons,
                            }
                            for t in ts
                        ],
                    )
                    for t in latest.values():
                        stmt = pg_insert(health_current).values(
                            tenant_id=tenant,
                            entity_type=t.entity_type,
                            entity_id=t.entity_id,
                            state=t.to_state,
                            reasons=t.reasons,
                            since=t.at_utc,
                            updated_at=t.at_utc,
                            last_event_time=t.event_time,
                        )
                        c.execute(
                            stmt.on_conflict_do_update(
                                index_elements=["tenant_id", "entity_type", "entity_id"],
                                set_={
                                    "state": stmt.excluded.state,
                                    "reasons": stmt.excluded.reasons,
                                    "since": stmt.excluded.since,
                                    "updated_at": stmt.excluded.updated_at,
                                    "last_event_time": stmt.excluded.last_event_time,
                                },
                            )
                        )
                written += len(ts)
            except Exception as exc:  # noqa: BLE001 - re-queue; never lose transitions silently
                log.error("health_persist_failed", error=type(exc).__name__, count=len(ts))
                with self._lock:
                    self._pending = ts + self._pending
        return written


writer = Writer()


def load_state() -> int:
    """Restore persisted health + register known collectors for every tenant in every region."""
    eng, n = engine(), 0
    for region in REGIONS:
        try:
            with identity_connection(region) as c:
                tenants = [
                    (r.tenant_id, r.slug) for r in c.execute(text("SELECT * FROM list_tenants()"))
                ]
            for tid, _slug in tenants:
                with tenant_connection(region, tid) as c:
                    for row in c.execute(select(health_current)):
                        eng.restore(tid, region, dict(row._mapping))
                        n += 1
                    for col in c.execute(select(collectors)):
                        eng.register_collector(
                            tid,
                            region,
                            col.id,
                            col.last_seen_at,
                            {
                                "outbox_depth": col.outbox_depth,
                                "oldest_pending_age_s": col.oldest_pending_age_s,
                                "adapters": col.adapters or [],
                                "collector_version": col.collector_version,
                            },
                        )
        except Exception as exc:  # noqa: BLE001 - start without history rather than not at all
            log.error("health_load_failed", region=region, error=type(exc).__name__)
    return n


async def run_background(publish) -> None:  # noqa: ANN001 - async publish(tenant_id, event)
    """Sweeper (every N s) + writer flush (every M s). Cancelled on shutdown."""
    s = get_settings()
    n = await run_in_threadpool(load_state)
    log.info("health_state_loaded", entities=n)
    last_sweep = 0.0
    loop = asyncio.get_running_loop()
    try:
        while True:
            await asyncio.sleep(s.health_persist_interval_seconds)
            if loop.time() - last_sweep >= s.health_sweep_interval_seconds:
                last_sweep = loop.time()
                transitions = await run_in_threadpool(engine().sweep)
                writer.enqueue(transitions)
                for t in transitions:
                    await publish(t.tenant_id, t.as_event())
            await run_in_threadpool(writer.flush)
    finally:
        await run_in_threadpool(writer.flush)


def now_utc() -> datetime:
    return datetime.now(UTC)


def facts_from_heartbeat(hb: Any) -> dict[str, Any]:
    return {
        "outbox_depth": hb.outbox_depth,
        "oldest_pending_age_s": hb.oldest_pending_age_s,
        "adapters": [a.model_dump(mode="json") for a in hb.adapters],
        "collector_version": hb.collector_version,
        "cpu_percent": hb.cpu_percent,
        "memory_mb": hb.memory_mb,
        "sent_at": hb.sent_at_utc,
    }


def reset() -> None:
    """Tests only: drop in-memory state and queued writes."""
    engine.cache_clear()
    with writer._lock:  # noqa: SLF001
        writer._pending.clear()  # noqa: SLF001
