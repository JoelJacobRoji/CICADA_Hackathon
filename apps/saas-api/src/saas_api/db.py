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
        pool_pre_ping=True,
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


@contextmanager
def tenant_connection(region: str, tenant_id: uuid.UUID) -> Iterator[Connection]:
    """Open a transaction with ``app.tenant_id`` set LOCAL to it (cleared on commit/rollback)."""
    schema = get_settings().db_schema
    with app_engine(region).begin() as conn:
        conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(tenant_id)})
        conn.execute(text(f"SET LOCAL search_path TO {schema}"))
        yield conn


def ping(region: str) -> bool:
    try:
        with app_engine(region).connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 - readiness must never raise or leak details
        return False
