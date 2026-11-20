"""Collector authentication: bearer token -> SHA-256 -> identity, resolved in ONE region only."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass

from fastapi import Header, HTTPException, Path, status
from sqlalchemy import text

from ..config import REGIONS
from ..db import identity_connection


@dataclass(frozen=True)
class CollectorCtx:
    collector_id: str
    tenant_id: uuid.UUID
    region: str


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)  # 256 bits


def _unauthorized() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "unauthorized",
        headers={"WWW-Authenticate": 'Bearer realm="aegis-ingest"'},
    )


def resolve_collector(region: str, token: str) -> CollectorCtx | None:
    with identity_connection(region) as conn:
        row = conn.execute(
            text("SELECT * FROM authenticate_collector(:h)"), {"h": hash_token(token)}
        ).first()
    if row is None or row.status != "active" or row.region != region:
        return None
    return CollectorCtx(row.collector_id, row.tenant_id, row.region)


def require_collector(
    region: str = Path(..., pattern=r"^[a-z]{2}-[a-z]+$"),
    authorization: str | None = Header(default=None),
) -> CollectorCtx:
    """Dependency. Unknown region -> 404. Missing/invalid/revoked token -> 401.

    A collector registered in another region is simply unknown here (its identity, like its
    data, lives only in its own region's database) -> 401.
    """
    if region not in REGIONS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown region")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized()
    token = authorization[7:].strip()
    if len(token) < 32:
        raise _unauthorized()
    ctx = resolve_collector(region, token)
    if ctx is None:
        raise _unauthorized()
    return ctx
