"""Per-region database engines and tenant-scoped sessions (RLS)."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import Connection

from .config import REGIONS, get_settings


def _normalise(url: str) -> str:
    # Force the psycopg 3 driver regardless of how the URL was written (Supabase gives postgresql://).
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    return url


def build_engine(url: str) -> Engine:
    return create_engine(
        _normalise(url),
        # No pre-ping: it costs a full round trip per checkout (242 ms VPS->Mumbai, K22).
        # Recycle instead, so pooler-side idle closes are avoided rather than probed.
        pool_pre_ping=False,
        pool_recycle=120,
        pool_size=5,
        max_overflow=5,
        # Safe behind Supabase/PgBouncer poolers (no server-side prepared statements).
        connect_args={"prepare_threshold": None, "connect_timeout": 10},
    )


@lru_cache(maxsize=len(REGIONS))
def app_engine(region: str) -> Engine:
    if region not in REGIONS:
        raise ValueError(f"unknown region {region!r}")
    return build_engine(get_settings().app_url(region))


@lru_cache(maxsize=len(REGIONS))
def owner_engine(region: str) -> Engine:
    """Owner role - admin CLI / migrations ONLY. Never used by request handlers."""
    if region not in REGIONS:
        raise ValueError(f"unknown region {region!r}")
    return build_engine(get_settings().owner_url(region))


_SET_CTX = text("SELECT set_config('app.tenant_id', :t, true), set_config('search_path', :s, true)")


@contextmanager
def tenant_connection(region: str, tenant_id: uuid.UUID) -> Iterator[Connection]:
    """Transaction with ``app.tenant_id`` + search_path set LOCAL (one round trip).

    Both settings are transaction-local, so a pooled connection never leaks tenant context.
    """
    with app_engine(region).begin() as conn:
        conn.execute(_SET_CTX, {"t": str(tenant_id), "s": get_settings().db_schema})
        yield conn


@contextmanager
def autocommit_connection(region: str) -> Iterator[Connection]:
    """App-role connection in autocommit mode: no BEGIN/COMMIT round trips. Use ONLY for single
    statements that set their own tenant context (e.g. aegis.ingest_batch)."""
    with app_engine(region).connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        yield conn


@contextmanager
def identity_connection(region: str) -> Iterator[Connection]:
    """App-role transaction WITHOUT tenant context (RLS shows nothing) - used only to call the
    SECURITY DEFINER identity functions."""
    with app_engine(region).begin() as conn:
        conn.execute(_SET_CTX, {"t": "", "s": get_settings().db_schema})
        yield conn


@contextmanager
def owner_connection(region: str) -> Iterator[Connection]:
    with owner_engine(region).begin() as conn:
        conn.execute(_SET_CTX, {"t": "", "s": get_settings().db_schema})
        yield conn


def ping(region: str) -> bool:
    try:
        with app_engine(region).connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 - readiness must never raise or leak details
        return False
