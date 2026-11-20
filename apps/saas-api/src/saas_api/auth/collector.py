"""Collector authentication: bearer token -> SHA-256 -> identity, resolved in ONE region only."""

from __future__ import annotations

import hashlib
import secrets
import threading
import time
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


AUTH_CACHE_TTL_S = 30.0  # revocation takes effect within this window (documented, K22)
_cache: dict[tuple[str, str], tuple[CollectorCtx, float]] = {}
_cache_lock = threading.Lock()


def clear_auth_cache() -> None:
    with _cache_lock:
        _cache.clear()


def resolve_collector(region: str, token: str) -> CollectorCtx | None:
    """Positive results are cached for AUTH_CACHE_TTL_S, keyed by (region, token SHA-256).
    Failures are never cached, so a newly registered collector works immediately."""
    key = (region, hash_token(token))
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[1] > now:
            return hit[0]
    with identity_connection(region) as conn:
        row = conn.execute(text("SELECT * FROM authenticate_collector(:h)"), {"h": key[1]}).first()
    if row is None or row.status != "active" or row.region != region:
        with _cache_lock:
            _cache.pop(key, None)
        return None
    ctx = CollectorCtx(row.collector_id, row.tenant_id, row.region)
    with _cache_lock:
        if len(_cache) > 10_000:
            _cache.clear()
        _cache[key] = (ctx, now + AUTH_CACHE_TTL_S)
    return ctx


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
