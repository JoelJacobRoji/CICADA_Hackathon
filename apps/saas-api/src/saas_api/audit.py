"""Append-only audit trail (tenant-scoped). Never store payloads, tokens or passwords here."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import insert
from sqlalchemy.engine import Connection

from .repo import audit_log


def write(
    conn: Connection,
    tenant_id: uuid.UUID,
    actor: str,
    action: str,
    target: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        insert(audit_log).values(
            tenant_id=tenant_id, actor=actor, action=action, target=target, detail=detail or {}
        )
    )
