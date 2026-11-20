"""Incidents (operators) + device-notification pull channel (collectors). Tenant-scoped."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select, update
from starlette.concurrency import run_in_threadpool

from . import audit
from .aiops import runtime as aiops
from .auth.collector import CollectorCtx, require_collector
from .auth.operator import Operator, current_operator, require_role
from .db import tenant_connection
from .repo import alerts_t, incidents_t, llm_explanations_t, notifications_t


def _rows(result) -> list[dict[str, Any]]:
    out = []
    for r in result:
        d = dict(r._mapping)
        d.pop("tenant_id", None)
        out.append(d)
    return out


_operator = require_role("tenant_operator")


class AckIn(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


def build_router() -> APIRouter:
    r = APIRouter(tags=["incidents"])

    # ------------------------------------------------------------------ operators

    @r.get("/api/v1/incidents")
    def list_incidents(
        op: Operator = Depends(current_operator),
        status: str = Query("all", pattern="^(open|resolved|all)$"),
        limit: int = Query(100, ge=1, le=500),
    ) -> list[dict[str, Any]]:
        aiops.store.flush()
        q = select(
            incidents_t.c.id,
            incidents_t.c.status,
            incidents_t.c.priority,
            incidents_t.c.score,
            incidents_t.c.title,
            incidents_t.c.root_entity,
            incidents_t.c.opened_at,
            incidents_t.c.updated_at,
            incidents_t.c.resolved_at,
            incidents_t.c.acked_at,
            incidents_t.c.version,
            incidents_t.c.explanation,
        )
        if status != "all":
            q = q.where(incidents_t.c.status == status)
        q = q.order_by(
            incidents_t.c.status.desc(), incidents_t.c.priority, incidents_t.c.updated_at.desc()
        ).limit(limit)
        with tenant_connection(op.region, op.tenant_id) as c:
            rows = _rows(c.execute(q))
        for row in rows:
            x = row.pop("explanation") or {}
            row["alert_count"] = len(x.get("trigger_signals", []))
            row["evidence_strength"] = (x.get("evidence_strength") or {}).get("level")
            row["affected_entities"] = x.get("affected_entities", [])
        return rows

    @r.get("/api/v1/incidents/{iid}")
    def get_incident(iid: uuid.UUID, op: Operator = Depends(current_operator)) -> dict[str, Any]:
        aiops.store.flush()
        with tenant_connection(op.region, op.tenant_id) as c:
            inc = c.execute(select(incidents_t).where(incidents_t.c.id == iid)).first()
            if inc is None:
                raise HTTPException(404, "not found")  # also for other tenants (no existence leak)
            alerts = _rows(
                c.execute(
                    select(alerts_t).where(alerts_t.c.incident_id == iid).order_by(alerts_t.c.onset)
                )
            )
            llm = c.execute(
                select(llm_explanations_t)
                .where(llm_explanations_t.c.incident_id == iid)
                .order_by(llm_explanations_t.c.incident_version.desc())
                .limit(1)
            ).first()
            notes = _rows(
                c.execute(
                    select(
                        notifications_t.c.collector_id,
                        notifications_t.c.kind,
                        notifications_t.c.incident_version,
                        notifications_t.c.created_at,
                        notifications_t.c.delivered_at,
                        notifications_t.c.acked_at,
                    )
                    .where(notifications_t.c.incident_id == iid)
                    .order_by(notifications_t.c.created_at)
                )
            )
        d = dict(inc._mapping)
        d.pop("tenant_id", None)
        if llm is not None:
            l_ = dict(llm._mapping)
            l_.pop("tenant_id", None)
            d["ai"] = l_
        else:
            d["ai"] = None
        d["alerts"] = alerts
        d["notifications"] = notes
        return d

    @r.post("/api/v1/incidents/{iid}/ack")
    def ack_incident(iid: uuid.UUID, op: Operator = Depends(_operator)) -> dict[str, Any]:
        aiops.store.flush()
        actor = f"user:{op.user_id}"
        now = datetime.now(UTC)
        aiops.engine().acknowledge(op.tenant_id, iid, actor)
        with tenant_connection(op.region, op.tenant_id) as c:
            res = c.execute(
                update(incidents_t)
                .where(and_(incidents_t.c.id == iid, incidents_t.c.acked_at.is_(None)))
                .values(acked_at=now, acked_by=actor)
            )
            exists = c.execute(select(incidents_t.c.id).where(incidents_t.c.id == iid)).first()
            if exists is None:
                raise HTTPException(404, "not found")
            if res.rowcount:
                audit.write(c, op.tenant_id, actor, "incident_acknowledged", str(iid))
        return {"incident_id": str(iid), "acknowledged": True}

    @r.get("/api/v1/aiops/summary")
    def summary(op: Operator = Depends(current_operator)) -> dict[str, Any]:
        aiops.store.flush()
        with tenant_connection(op.region, op.tenant_id) as c:
            counts = dict(
                c.execute(
                    select(incidents_t.c.priority, func.count())
                    .where(incidents_t.c.status == "open")
                    .group_by(incidents_t.c.priority)
                ).all()
            )
            total = c.execute(select(func.count()).select_from(incidents_t)).scalar_one()
            alerts = c.execute(
                select(
                    func.count(), func.coalesce(func.sum(alerts_t.c.occurrences), 0)
                ).select_from(alerts_t)
            ).one()
        return {
            "open_by_priority": {p: counts.get(p, 0) for p in ("P1", "P2", "P3")},
            "incidents_total": total,
            "alerts_total": alerts[0],
            "alert_signals_total": int(alerts[1]),
            "noise_reduction_ratio": round(int(alerts[1]) / total, 1) if total else None,
            "definition": "alert signals (incl. deduplicated repeats) per incident",
        }

    @r.get("/api/v1/notifications/stats")
    def notification_stats(op: Operator = Depends(current_operator)) -> list[dict[str, Any]]:
        aiops.store.flush()
        n = notifications_t.c
        with tenant_connection(op.region, op.tenant_id) as c:
            return _rows(
                c.execute(
                    select(
                        n.collector_id,
                        func.count().label("total"),
                        func.count(n.delivered_at).label("delivered"),
                        func.count(n.acked_at).label("acked"),
                    ).group_by(n.collector_id)
                )
            )

    # ------------------------------------------------------------------ collectors (pull)

    @r.get("/api/v1/notifications/{region}")
    async def pull(ctx: CollectorCtx = Depends(require_collector)) -> list[dict[str, Any]]:
        def _pull() -> list[dict[str, Any]]:
            aiops.store.flush()
            n = notifications_t.c
            now = datetime.now(UTC)
            with tenant_connection(ctx.region, ctx.tenant_id) as c:
                rows = _rows(
                    c.execute(
                        select(
                            n.id, n.kind, n.incident_id, n.incident_version, n.created_at, n.payload
                        )
                        .where(and_(n.collector_id == ctx.collector_id, n.acked_at.is_(None)))
                        .order_by(n.created_at)
                        .limit(100)
                    )
                )
                if rows:
                    c.execute(
                        update(notifications_t)
                        .where(and_(n.id.in_([x["id"] for x in rows]), n.delivered_at.is_(None)))
                        .values(delivered_at=now)
                    )
            return rows

        return await run_in_threadpool(_pull)

    @r.post("/api/v1/notifications/{region}/ack")
    async def ack_notifications(
        body: AckIn, ctx: CollectorCtx = Depends(require_collector)
    ) -> dict[str, int]:
        def _ack() -> int:
            n = notifications_t.c
            with tenant_connection(ctx.region, ctx.tenant_id) as c:
                res = c.execute(
                    update(notifications_t)
                    .where(
                        and_(
                            n.collector_id == ctx.collector_id,
                            n.id.in_(body.ids),
                            n.acked_at.is_(None),
                        )
                    )
                    .values(acked_at=datetime.now(UTC))
                )
                return res.rowcount

        return {"acked": await run_in_threadpool(_ack)}

    return r
