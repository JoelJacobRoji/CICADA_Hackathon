"""Tenant-scoped WebSocket fan-out.

The channel is derived ONLY from the authenticated session - clients cannot name a tenant.
In-process hub: correct for one API instance; multi-instance needs a shared bus (documented).
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from .auth.operator import decode_token
from .config import get_settings

log = structlog.get_logger("saas.ws")


class Hub:
    """All mutations happen on the server's event loop (no awaits inside), so no lock is needed."""

    def __init__(self) -> None:
        self._subs: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)

    async def add(self, tenant_id: uuid.UUID, ws: WebSocket) -> None:
        self._subs[tenant_id].add(ws)

    async def remove(self, tenant_id: uuid.UUID, ws: WebSocket) -> None:
        self._subs[tenant_id].discard(ws)

    def subscribers(self, tenant_id: uuid.UUID) -> int:
        return len(self._subs.get(tenant_id, ()))

    async def publish(self, tenant_id: uuid.UUID, message: dict[str, Any]) -> None:
        data = json.dumps(message, default=str)
        for ws in list(self._subs.get(tenant_id, ())):
            try:
                await ws.send_text(data)
            except Exception:  # noqa: BLE001 - drop dead sockets
                await self.remove(tenant_id, ws)


hub = Hub()


def build_router() -> APIRouter:
    router = APIRouter()

    @router.websocket("/api/v1/ws")
    async def stream(ws: WebSocket) -> None:
        s = get_settings()
        origin = ws.headers.get("origin")
        if origin is not None and origin not in s.cors_origins:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)  # cross-site WS hijacking
            return
        token = ws.cookies.get(s.session_cookie_name)
        op = decode_token(token) if token else None
        if op is None:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await ws.accept()
        await hub.add(op.tenant_id, ws)
        await ws.send_text(json.dumps({"type": "hello", "tenant": op.tenant_slug}))
        try:
            while True:
                await ws.receive_text()  # client messages are ignored (server push only)
        except WebSocketDisconnect:
            pass
        finally:
            await hub.remove(op.tenant_id, ws)

    return router
