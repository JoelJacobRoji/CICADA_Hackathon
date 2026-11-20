"""Metadata-only ingest. There is deliberately NO endpoint that accepts raw records.

POST /api/v1/ingest/{region}    IngestBatch  -> IngestAck
POST /api/v1/heartbeat/{region} Heartbeat    -> 204
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Any

import structlog
from aegis_contracts.common import StrictModel, UtcDatetime
from aegis_contracts.outbound import (
    MAX_BATCH_ITEMS,
    Heartbeat,
    IngestAck,
    OutboundItem,
    Rejection,
    RejectReason,
)
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import Field, TypeAdapter, ValidationError
from sqlalchemy import insert, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from starlette.concurrency import run_in_threadpool

from .auth.collector import CollectorCtx, require_collector
from .config import get_settings
from .db import tenant_connection
from .repo import KIND_TABLE, collectors, heartbeats, ingest_receipts
from .ws import hub

log = structlog.get_logger("saas.ingest")
_item = TypeAdapter(OutboundItem)


class _Envelope(StrictModel):
    batch_id: uuid.UUID
    sent_at_utc: UtcDatetime
    items: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_BATCH_ITEMS)


def _plain(d: dict[str, Any]) -> dict[str, Any]:
    return {k: (v.value if isinstance(v, Enum) else v) for k, v in d.items()}


def _row(model: Any, tenant_id: uuid.UUID, sha: str, now: datetime, late_after: float) -> dict:
    d = _plain(model.model_dump(mode="python"))
    kind = d.pop("kind")
    d.pop("schema_version", None)
    d.update(tenant_id=tenant_id, payload_sha256=sha, received_at=now)
    if kind == "topology_edge":
        return d
    d["window_start"] = d.pop("window_start_utc")
    d["window_end"] = d.pop("window_end_utc")
    d["late"] = (now - d["window_end"]) > timedelta(seconds=late_after)
    if kind == "metric_summary":
        d["first_event_ts"] = d.pop("first_event_ts_utc")
        if d.get("anomaly") is not None:
            d["anomaly"] = _plain(d["anomaly"])
    return d


async def _read_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(413, "payload too large")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > limit:
            raise HTTPException(413, "payload too large")
    return bytes(body)


def _store(ctx: CollectorCtx, env: _Envelope, body_sha: str) -> tuple[IngestAck, list[dict]]:
    s = get_settings()
    now = datetime.now(UTC)
    rejected: list[Rejection] = []
    rows: dict[str, list[dict]] = {k: [] for k in KIND_TABLE}
    seen: set[uuid.UUID] = set()
    for raw in env.items:
        try:
            model = _item.validate_python(raw)
        except ValidationError:
            pid = raw.get("payload_id") if isinstance(raw, dict) else None
            try:
                pid_u = uuid.UUID(str(pid)) if pid else None
            except ValueError:
                pid_u = None
            rejected.append(Rejection(payload_id=pid_u, reason=RejectReason.SCHEMA_INVALID))
            continue
        if model.collector_id != ctx.collector_id:
            rejected.append(
                Rejection(payload_id=model.payload_id, reason=RejectReason.COLLECTOR_MISMATCH)
            )
            continue
        if model.payload_id in seen:
            continue  # duplicate within the same batch; the first copy decides
        seen.add(model.payload_id)
        # Canonical re-serialisation: identical to the collector's egress-ledger JSON.
        sha = hashlib.sha256(model.model_dump_json().encode("utf-8")).hexdigest()
        rows[model.kind].append(_row(model, ctx.tenant_id, sha, now, s.late_after_seconds))

    accepted: list[uuid.UUID] = []
    published: list[dict] = []
    with tenant_connection(ctx.region, ctx.tenant_id) as conn:
        for kind, kind_rows in rows.items():
            if not kind_rows:
                continue
            table = KIND_TABLE[kind]
            stmt = (
                pg_insert(table)
                .values(kind_rows)
                .on_conflict_do_nothing(index_elements=["tenant_id", "payload_id"])
                .returning(table.c.payload_id)
            )
            new_ids = {r[0] for r in conn.execute(stmt)}
            accepted.extend(new_ids)
            if kind != "topology_edge":
                published.extend(
                    {"type": kind, **r} for r in kind_rows if r["payload_id"] in new_ids
                )
        all_ids = [r["payload_id"] for rs in rows.values() for r in rs]
        duplicate = [p for p in all_ids if p not in set(accepted)]
        conn.execute(
            insert(ingest_receipts).values(
                tenant_id=ctx.tenant_id,
                collector_id=ctx.collector_id,
                batch_id=env.batch_id,
                body_sha256=body_sha,
                accepted=len(accepted),
                duplicate=len(duplicate),
                rejected=len(rejected),
            )
        )
    ack = IngestAck(
        batch_id=env.batch_id, accepted=accepted, duplicate=duplicate, rejected=rejected
    )
    return ack, published


def _event(r: dict) -> dict:
    keep = (
        "type",
        "payload_id",
        "source_pid",
        "source_kind",
        "metric",
        "unit",
        "window_start",
        "window_end",
        "mean",
        "max",
        "last",
        "local_health",
        "summary_code",
        "severity",
        "first_event_ts",
        "received_at",
        "late",
        "failure_count",
        "risk_level",
    )
    return {k: r[k] for k in keep if k in r}


def build_router() -> APIRouter:
    router = APIRouter(tags=["ingest"])

    @router.post("/api/v1/ingest/{region}", response_model=IngestAck)
    async def ingest(request: Request, ctx: CollectorCtx = Depends(require_collector)) -> IngestAck:
        body = await _read_body(request, get_settings().ingest_max_bytes)
        try:
            env = _Envelope.model_validate_json(body)
        except ValidationError as exc:
            raise HTTPException(422, "invalid batch envelope") from exc
        body_sha = hashlib.sha256(body).hexdigest()
        ack, published = await run_in_threadpool(_store, ctx, env, body_sha)
        log.info(
            "ingest_batch",
            collector_id=ctx.collector_id,
            region=ctx.region,
            accepted=len(ack.accepted),
            duplicate=len(ack.duplicate),
            rejected=len(ack.rejected),
        )
        if hub.subscribers(ctx.tenant_id):
            for r in published:
                await hub.publish(ctx.tenant_id, _event(r))
        return ack

    @router.post("/api/v1/heartbeat/{region}", status_code=204)
    async def heartbeat(
        request: Request, ctx: CollectorCtx = Depends(require_collector)
    ) -> Response:
        body = await _read_body(request, 65_536)
        try:
            hb = Heartbeat.model_validate_json(body)
        except ValidationError as exc:
            raise HTTPException(422, "invalid heartbeat") from exc
        if hb.collector_id != ctx.collector_id or hb.region != ctx.region:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "collector/region mismatch")

        def _save() -> None:
            now = datetime.now(UTC)
            with tenant_connection(ctx.region, ctx.tenant_id) as conn:
                conn.execute(
                    update(collectors)
                    .where(collectors.c.id == ctx.collector_id)
                    .values(
                        last_seen_at=now,
                        last_heartbeat_sent=hb.sent_at_utc,
                        collector_version=hb.collector_version,
                        uptime_s=hb.uptime_s,
                        cpu_percent=hb.cpu_percent,
                        memory_mb=hb.memory_mb,
                        outbox_depth=hb.outbox_depth,
                        oldest_pending_age_s=hb.oldest_pending_age_s,
                        config_hash=hb.config_hash,
                        adapters=json.loads(
                            json.dumps([a.model_dump(mode="json") for a in hb.adapters])
                        ),
                    )
                )
                conn.execute(
                    pg_insert(heartbeats)
                    .values(
                        tenant_id=ctx.tenant_id,
                        collector_id=ctx.collector_id,
                        sent_at=hb.sent_at_utc,
                        received_at=now,
                        outbox_depth=hb.outbox_depth,
                        oldest_pending_age_s=hb.oldest_pending_age_s,
                        cpu_percent=hb.cpu_percent,
                        memory_mb=hb.memory_mb,
                    )
                    .on_conflict_do_nothing()
                )

        await run_in_threadpool(_save)
        if hub.subscribers(ctx.tenant_id):
            await hub.publish(
                ctx.tenant_id,
                {
                    "type": "heartbeat",
                    "collector_id": ctx.collector_id,
                    "outbox_depth": hb.outbox_depth,
                    "sent_at": hb.sent_at_utc.isoformat(),
                },
            )
        return Response(status_code=204)

    return router
