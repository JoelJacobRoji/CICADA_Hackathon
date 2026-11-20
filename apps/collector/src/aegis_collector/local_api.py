"""Local console API (collector side only). Requires the local admin token.

This is the ONLY place raw records can be viewed. The SaaS has no route to any of this.
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .config import get_settings
from .egress.ledger import verify_chain
from .egress.notifications import list_local
from .security import bearer_dependency

log = structlog.get_logger("collector.local_api")


def build_router() -> APIRouter:
    require_admin = bearer_dependency(lambda: get_settings().local_admin_token, "aegis-local")
    router = APIRouter(
        prefix="/local", tags=["local-console"], dependencies=[Depends(require_admin)]
    )

    def _db(request: Request):
        return request.app.state.pipeline

    @router.get("/stats")
    def stats(request: Request) -> dict[str, Any]:
        snap = _db(request).snapshot()
        sender = getattr(request.app.state, "sender", None)
        snap["sender"] = (
            {"state": sender.state, "last_error": sender.last_error}
            if sender
            else {"state": "disabled (no AEGIS_COL_COLLECTOR_TOKEN)"}
        )
        return snap

    @router.get("/raw")
    def list_raw(
        request: Request,
        limit: int = Query(50, ge=1, le=500),
        source_id: str | None = None,
        with_findings: bool = False,
    ) -> list[dict[str, Any]]:
        p = _db(request)
        sql = (
            "SELECT id, event_id, record_type, source_id, event_ts_utc, received_at_utc, adapter,"
            " masked_json, findings FROM raw_events WHERE 1=1"
        )
        args: list[Any] = []
        if source_id:
            sql += " AND source_id = ?"
            args.append(source_id)
        if with_findings:
            sql += " AND findings != ''"
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with p.lock:
            rows = p.conn.execute(sql, args).fetchall()
        return [
            {
                "id": r["id"],
                "event_id": r["event_id"],
                "record_type": r["record_type"],
                "source_id": r["source_id"],
                "event_ts_utc": r["event_ts_utc"],
                "received_at_utc": r["received_at_utc"],
                "adapter": r["adapter"],
                "masked": json.loads(r["masked_json"]),
                "findings": [f for f in r["findings"].split(",") if f],
            }
            for r in rows
        ]

    @router.get("/raw/{raw_id}/reveal")
    def reveal_raw(request: Request, raw_id: int) -> dict[str, Any]:
        p = _db(request)
        with p.lock:
            row = p.conn.execute(
                "SELECT id, raw_json, source_id FROM raw_events WHERE id = ?", (raw_id,)
            ).fetchone()
        if row is None:
            raise HTTPException(404, "not found")
        log.info("raw_record_revealed", raw_id=raw_id)  # audit line, no content
        return {
            "id": row["id"],
            "source_id": row["source_id"],
            "source_pid": p.pseudo.pid(row["source_id"]),
            "raw": json.loads(row["raw_json"]),
        }

    @router.get("/egress")
    def list_egress(
        request: Request, limit: int = Query(50, ge=1, le=500), kind: str | None = None
    ) -> list[dict[str, Any]]:
        p = _db(request)
        sql = (
            "SELECT l.seq, l.payload_id, l.kind, l.sha256, l.created_at, o.status, o.attempts"
            " FROM egress_ledger l JOIN outbox o USING (payload_id)"
        )
        args: list[Any] = []
        if kind:
            sql += " WHERE l.kind = ?"
            args.append(kind)
        sql += " ORDER BY l.seq DESC LIMIT ?"
        args.append(limit)
        with p.lock:
            return [dict(r) for r in p.conn.execute(sql, args).fetchall()]

    @router.get("/egress/verify")
    def verify(request: Request) -> dict[str, Any]:
        p = _db(request)
        with p.lock:
            rep = verify_chain(p.conn)
        return rep.__dict__

    @router.get("/egress/{payload_id}")
    def egress_entry(request: Request, payload_id: str) -> dict[str, Any]:
        p = _db(request)
        with p.lock:
            row = p.conn.execute(
                "SELECT l.*, o.status, o.attempts, o.delivered_at, o.ack_kind"
                " FROM egress_ledger l JOIN outbox o USING (payload_id) WHERE l.payload_id = ?",
                (payload_id,),
            ).fetchone()
        if row is None:
            raise HTTPException(404, "not found")
        d = dict(row)
        d["payload"] = json.loads(d.pop("payload_json"))
        return d

    @router.get("/notifications")
    def notifications(request: Request, limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
        """Device alerts from the SaaS, re-identified with local source names."""
        p = _db(request)
        ch = getattr(request.app.state, "notifications", None)
        return {
            "channel": (
                {"webhook": bool(ch.webhook_url), "last_error": ch.last_error}
                if ch
                else {"state": "disabled (no AEGIS_COL_COLLECTOR_TOKEN)"}
            ),
            "items": list_local(p.conn, p.lock, limit),
        }

    @router.get("/pseudonyms/{source_pid}")
    def lookup(request: Request, source_pid: str) -> dict[str, str]:
        sid = _db(request).pseudo.lookup(source_pid)
        if sid is None:
            raise HTTPException(404, "not found")
        return {"source_pid": source_pid, "source_id": sid}

    return router
