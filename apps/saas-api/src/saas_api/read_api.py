"""Operator auth endpoints + tenant-scoped read API. Tenant comes ONLY from the session."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, text, update
from starlette.concurrency import run_in_threadpool

from . import audit
from .auth.operator import (
    Operator,
    authenticate,
    current_operator,
    issue_token,
    login_limiter,
)
from .config import get_settings
from .db import tenant_connection
from .repo import collectors, metric_summaries, security_summaries, topology_edges, users


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


def _rows(result) -> list[dict[str, Any]]:
    return [dict(r._mapping) for r in result]


def build_router() -> APIRouter:
    r = APIRouter(prefix="/api/v1", tags=["operator"])

    # ---------------- auth ----------------

    @r.post("/auth/login")
    async def login(body: LoginIn, request: Request, response: Response) -> dict[str, str]:
        s = get_settings()
        ip = request.client.host if request.client else "?"
        if not login_limiter.allow(f"{body.email.lower()}|{ip}", s.login_max_attempts_per_minute):
            raise HTTPException(429, "too many attempts")
        op = await run_in_threadpool(authenticate, body.email, body.password)
        if op is None:
            raise HTTPException(401, "invalid credentials")

        def _record() -> None:
            with tenant_connection(op.region, op.tenant_id) as conn:
                conn.execute(
                    update(users)
                    .where(users.c.id == op.user_id)
                    .values(last_login_at=datetime.now(UTC))
                )
                audit.write(conn, op.tenant_id, f"user:{op.user_id}", "login_success")

        await run_in_threadpool(_record)
        response.set_cookie(
            s.session_cookie_name,
            issue_token(op),
            max_age=s.session_ttl_minutes * 60,
            httponly=True,
            secure=s.cookie_secure,
            samesite="strict",
            path="/",
        )
        return {"tenant": op.tenant_slug, "role": op.role, "region": op.region}

    @r.post("/auth/logout", status_code=204)
    def logout(response: Response) -> Response:
        s = get_settings()
        response.delete_cookie(
            s.session_cookie_name,
            path="/",
            samesite="strict",
            secure=s.cookie_secure,
            httponly=True,
        )
        response.status_code = 204
        return response

    @r.get("/auth/me")
    def me(op: Operator = Depends(current_operator)) -> dict[str, str]:
        return {"tenant": op.tenant_slug, "role": op.role, "region": op.region}

    # ---------------- reads (tenant from session) ----------------

    @r.get("/collectors")
    def list_collectors(op: Operator = Depends(current_operator)) -> list[dict[str, Any]]:
        s = get_settings()
        now = datetime.now(UTC)
        with tenant_connection(op.region, op.tenant_id) as conn:
            rows = _rows(conn.execute(select(collectors).order_by(collectors.c.id)))
        out = []
        for c in rows:
            c.pop("token_hash", None)  # never returned
            seen = c.get("last_seen_at")
            c["connectivity"] = (
                "online"
                if seen and (now - seen) <= timedelta(seconds=s.offline_after_seconds)
                else "offline"
            )
            out.append(c)
        return out

    @r.get("/sources")
    def list_sources(op: Operator = Depends(current_operator)) -> list[dict[str, Any]]:
        with tenant_connection(op.region, op.tenant_id) as conn:
            return _rows(
                conn.execute(
                    text(
                        "SELECT DISTINCT ON (source_pid, metric)"
                        " source_pid, source_kind, metric, unit,"
                        " window_end, mean, local_health, summary_code"
                        " FROM metric_summaries ORDER BY source_pid, metric, window_end DESC"
                    )
                )
            )

    @r.get("/metrics")
    def metrics(
        op: Operator = Depends(current_operator),
        source_pid: str | None = Query(None, pattern=r"^src_[0-9a-f]{16}$"),
        metric: str | None = Query(None, pattern=r"^[a-z_]{2,32}$"),
        minutes: int = Query(15, ge=1, le=24 * 60),
        limit: int = Query(2000, ge=1, le=20000),
    ) -> list[dict[str, Any]]:
        since = datetime.now(UTC) - timedelta(minutes=minutes)
        q = select(metric_summaries).where(metric_summaries.c.window_end >= since)
        if source_pid:
            q = q.where(metric_summaries.c.source_pid == source_pid)
        if metric:
            q = q.where(metric_summaries.c.metric == metric)
        # Event-time order (not arrival order): late arrivals land in their correct place.
        q = q.order_by(metric_summaries.c.window_end, metric_summaries.c.payload_id).limit(limit)
        with tenant_connection(op.region, op.tenant_id) as conn:
            return _rows(conn.execute(q))

    @r.get("/security-events")
    def security_events(
        op: Operator = Depends(current_operator), limit: int = Query(100, ge=1, le=1000)
    ) -> list[dict[str, Any]]:
        q = select(security_summaries).order_by(security_summaries.c.window_end.desc()).limit(limit)
        with tenant_connection(op.region, op.tenant_id) as conn:
            return _rows(conn.execute(q))

    @r.get("/topology")
    def topology(op: Operator = Depends(current_operator)) -> list[dict[str, Any]]:
        with tenant_connection(op.region, op.tenant_id) as conn:
            return _rows(conn.execute(select(topology_edges)))

    @r.get("/receipts/{payload_id}")
    def receipt(payload_id: uuid.UUID, op: Operator = Depends(current_operator)) -> dict[str, Any]:
        with tenant_connection(op.region, op.tenant_id) as conn:
            for kind, table in (
                ("metric_summary", metric_summaries),
                ("security_summary", security_summaries),
                ("topology_edge", topology_edges),
            ):
                row = conn.execute(select(table).where(table.c.payload_id == payload_id)).first()
                if row is not None:
                    return {"kind": kind, **dict(row._mapping)}
        raise HTTPException(404, "not found")  # also for other tenants' IDs (no existence leak)

    return r
