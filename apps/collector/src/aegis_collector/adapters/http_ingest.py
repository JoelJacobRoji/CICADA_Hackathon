"""HTTP ingest adapter: POST /api/v1/telemetry (local sources -> collector).

Accepts one JSON record or a JSON array. Size- and count-limited. Never logs bodies.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool

from ..config import get_settings
from ..security import bearer_dependency


def build_router() -> APIRouter:
    router = APIRouter(tags=["ingest"])
    require_ingest = bearer_dependency(lambda: get_settings().ingest_token, "aegis-ingest")

    @router.post(
        "/api/v1/telemetry",
        status_code=status.HTTP_202_ACCEPTED,
        dependencies=[Depends(require_ingest)],
    )
    async def ingest(request: Request) -> dict[str, int]:
        settings = get_settings()
        declared = request.headers.get("content-length")
        if declared and int(declared) > settings.ingest_max_bytes:
            raise HTTPException(413, "payload too large")
        body = bytearray()
        async for chunk in request.stream():
            body += chunk
            if len(body) > settings.ingest_max_bytes:
                raise HTTPException(413, "payload too large")
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid JSON") from exc
        records = data if isinstance(data, list) else [data]
        if len(records) > settings.ingest_max_records:
            raise HTTPException(413, "too many records")
        adapter = request.headers.get("x-aegis-adapter", "http_ingest")
        if adapter not in {"http_ingest", "simulator", "jsonl_replay"}:
            adapter = "http_ingest"
        pipeline = request.app.state.pipeline
        accepted, rejected = await run_in_threadpool(pipeline.process, adapter, records)
        return {"accepted": accepted, "rejected": rejected}

    return router
