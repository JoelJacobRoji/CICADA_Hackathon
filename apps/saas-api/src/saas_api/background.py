"""Periodic work: health sweep (staleness/offline) -> AIOps (alerts, resolution) -> persistence."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import structlog
from starlette.concurrency import run_in_threadpool

from .aiops import runtime as aiops
from .config import get_settings
from .health import runtime as health

log = structlog.get_logger("saas.background")


def _aiops_tick(transitions: list) -> list[tuple[uuid.UUID, dict[str, Any]]]:
    eng = aiops.engine()
    changes = eng.observe_health(transitions) + eng.sweep()
    events = aiops.handle(changes)  # exactly one event per change, same order
    return [(ch.incident.tenant_id, ev) for ch, ev in zip(changes, events, strict=True)]


async def run(publish) -> None:  # noqa: ANN001 - async publish(tenant_id, event)
    s = get_settings()
    n = await run_in_threadpool(health.load_state)
    await run_in_threadpool(aiops.load_state)
    aiops.llm_worker.loop = asyncio.get_running_loop()
    aiops.llm_worker.publish = publish
    log.info("background_started", health_entities=n)
    loop = asyncio.get_running_loop()
    last_sweep = 0.0
    try:
        while True:
            await asyncio.sleep(s.health_persist_interval_seconds)
            if loop.time() - last_sweep >= s.health_sweep_interval_seconds:
                last_sweep = loop.time()
                transitions = await run_in_threadpool(health.engine().sweep)
                health.writer.enqueue(transitions)
                for t in transitions:
                    await publish(t.tenant_id, t.as_event())
                for tenant, ev in await run_in_threadpool(_aiops_tick, transitions):
                    await publish(tenant, ev)
            await run_in_threadpool(health.writer.flush)
            await run_in_threadpool(aiops.store.flush)
    finally:
        aiops.llm_worker.loop = None  # the worker must never schedule onto a closed loop
        aiops.llm_worker.publish = None
        await run_in_threadpool(health.writer.flush)
        await run_in_threadpool(aiops.store.flush)
