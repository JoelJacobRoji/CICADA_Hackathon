"""Tenant-scoped health read API. Tenant comes ONLY from the operator session."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from .auth.operator import Operator, current_operator
from .config import get_settings
from .db import tenant_connection
from .health import runtime as health
from .health.engine import ORDER, RANK
from .health.thresholds import load
from .repo import health_transitions


def _transitions(op: Operator, etype: str | None, eid: str | None, limit: int) -> list[dict]:
    q = select(health_transitions).order_by(health_transitions.c.at_utc.desc()).limit(limit)
    if etype:
        q = q.where(health_transitions.c.entity_type == etype)
    if eid:
        q = q.where(health_transitions.c.entity_id == eid)
    with tenant_connection(op.region, op.tenant_id) as c:
        rows = [dict(r._mapping) for r in c.execute(q)]
    for r in rows:
        r.pop("tenant_id", None)
    return rows


def build_router() -> APIRouter:
    r = APIRouter(prefix="/api/v1", tags=["health"])

    @r.get("/health/summary")
    def summary(op: Operator = Depends(current_operator)) -> dict[str, Any]:
        eng = health.engine()
        items = eng.snapshot(op.tenant_id)
        tenant = next((i for i in items if i["entity_type"] == "tenant"), None)
        counts: dict[str, dict[str, int]] = {
            t: {s: 0 for s in ORDER} for t in ("source", "collector")
        }
        for i in items:
            if i["entity_type"] in counts:
                counts[i["entity_type"]][i["state"]] += 1
        worst = sorted(
            (i for i in items if i["entity_type"] != "tenant" and i["state"] != "Excellent"),
            key=lambda i: (-RANK[i["state"]], i["entity_type"], i["entity_id"]),
        )[:10]
        return {"tenant": tenant, "counts": counts, "worst": worst}

    @r.get("/health/entities")
    def entities(
        op: Operator = Depends(current_operator),
        type: str | None = Query(None, pattern="^(source|collector|tenant)$"),  # noqa: A002
    ) -> list[dict[str, Any]]:
        items = health.engine().snapshot(op.tenant_id, type)
        return sorted(items, key=lambda i: (-RANK[i["state"]], i["entity_type"], i["entity_id"]))

    @r.get("/health/transitions")
    def transitions(
        op: Operator = Depends(current_operator), limit: int = Query(50, ge=1, le=500)
    ) -> list[dict[str, Any]]:
        health.writer.flush()  # make the newest transitions visible immediately
        return _transitions(op, None, None, limit)

    @r.get("/health/{etype}/{eid}")
    def entity(
        etype: str,
        eid: str,
        op: Operator = Depends(current_operator),
        limit: int = Query(100, ge=1, le=500),
    ) -> dict[str, Any]:
        if etype not in ("source", "collector", "tenant"):
            raise HTTPException(404, "not found")
        view = health.engine().get(op.tenant_id, etype, eid)
        if view is None:
            raise HTTPException(404, "not found")  # also for other tenants' entities
        health.writer.flush()
        return {**view, "history": _transitions(op, etype, eid, limit)}

    @r.get("/settings/thresholds")
    def thresholds(op: Operator = Depends(current_operator)) -> dict[str, Any]:
        s = get_settings()
        return {"source": "config/health_thresholds.yaml", **load(str(s.thresholds_path)).raw}

    return r
