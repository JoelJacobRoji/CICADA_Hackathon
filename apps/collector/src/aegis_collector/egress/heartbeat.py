"""Collector heartbeat (never queued: a stale heartbeat is meaningless)."""

from __future__ import annotations

import hashlib
import sqlite3
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
import psutil
from aegis_contracts.outbound import AdapterInfo, AdapterStatus, Heartbeat

from .. import __version__

_STARTED = time.monotonic()
_PROC = psutil.Process()


def config_hash(config_dir: Path, extra: str = "") -> str:
    h = hashlib.sha256()
    for name in ("health_thresholds.yaml", "inventory.yaml"):
        p = config_dir / name
        if p.exists():
            h.update(p.read_bytes())
    h.update(extra.encode())
    return h.hexdigest()


def outbox_stats(conn: sqlite3.Connection, lock: threading.RLock) -> tuple[int, float]:
    with lock:
        n, oldest = conn.execute(
            "SELECT count(*), min(created_at) FROM outbox WHERE status IN ('pending','sending')"
        ).fetchone()
    age = 0.0
    if oldest:
        age = max(0.0, (datetime.now(UTC) - datetime.fromisoformat(oldest)).total_seconds())
    return int(n), age


def build(
    *,
    collector_id: str,
    region: str,
    cfg_hash: str,
    depth: int,
    oldest_age: float,
    adapters: dict[str, AdapterStatus],
) -> Heartbeat:
    return Heartbeat(
        collector_id=collector_id,
        sent_at_utc=datetime.now(UTC),
        collector_version=__version__,
        uptime_s=time.monotonic() - _STARTED,
        cpu_percent=_PROC.cpu_percent(None),
        memory_mb=_PROC.memory_info().rss / 1_048_576,
        outbox_depth=depth,
        oldest_pending_age_s=oldest_age,
        config_hash=cfg_hash,
        adapters=[AdapterInfo(name=k, status=v) for k, v in adapters.items()],
        region=region,
    )


def send(client: httpx.Client, token: str, hb: Heartbeat) -> int:
    r = client.post(
        f"/api/v1/heartbeat/{hb.region}",
        content=hb.model_dump_json().encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    return r.status_code
