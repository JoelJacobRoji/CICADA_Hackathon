"""APP_WEB_DEMO: a small, REAL web application for the diversified-data demo (loopback only).

Every API request runs a real query against the local PostgreSQL container (DB_AEGIS_PG) using
a read-only role. Errors are never faked: a 5xx happens only when the database really fails
(down, timeout). The collector's web reader polls /metrics.

  GET /api/orders   light query (counts active sessions)
  GET /api/report   heavier aggregate over pg_stat_database (statement_timeout 250 ms)
  GET /metrics      {"requests_total", "errors_total", "latency_p95_ms"} (last 30 s)

Usage: uv run python scripts/demo_webapp.py   (DSN from AEGIS_DEMO_WEB_PG_DSN or
       AEGIS_COL_POSTGRES_AGENT_DSN in apps/collector/.env; nothing is printed from it)
"""

from __future__ import annotations

import os
import statistics
import threading
import time
from collections import deque
from pathlib import Path

import psycopg
import uvicorn
from fastapi import FastAPI, Response

ROOT = Path(__file__).resolve().parents[1]


def _dsn() -> str:
    v = os.environ.get("AEGIS_DEMO_WEB_PG_DSN") or os.environ.get("AEGIS_COL_POSTGRES_AGENT_DSN")
    if not v:
        env = ROOT / "apps" / "collector" / ".env"
        for line in env.read_text(encoding="utf-8").splitlines() if env.exists() else []:
            if line.startswith("AEGIS_COL_POSTGRES_AGENT_DSN="):
                v = line.split("=", 1)[1].strip()
    if not v:
        raise SystemExit("no DSN: run scripts/setup_real_sources.py first")
    return v


DSN = _dsn()
app = FastAPI(title="AEGIS demo web app (real)", docs_url=None, redoc_url=None)
_lock = threading.Lock()
_requests = 0
_errors = 0
_lat: deque[tuple[float, float]] = deque()  # (monotonic time, latency ms)


def _record(ms: float, error: bool) -> None:
    global _requests, _errors
    now = time.monotonic()
    with _lock:
        _requests += 1
        _errors += int(error)
        _lat.append((now, ms))
        while _lat and now - _lat[0][0] > 30:
            _lat.popleft()


def _run(sql: str, timeout_ms: int) -> Response:
    t0 = time.perf_counter()
    try:
        with psycopg.connect(DSN, connect_timeout=2) as conn:
            conn.execute(f"SET statement_timeout = {int(timeout_ms)}")
            conn.execute(sql).fetchone()
        ok = True
    except psycopg.Error:
        ok = False
    ms = (time.perf_counter() - t0) * 1000
    _record(ms, error=not ok)
    return Response(
        '{"ok":true}' if ok else '{"ok":false}',
        status_code=200 if ok else 503,
        media_type="application/json",
    )


@app.get("/api/orders")
def orders() -> Response:
    return _run("SELECT count(*) FROM pg_stat_activity", 1000)


@app.get("/api/report")
def report() -> Response:
    return _run(
        "SELECT sum(xact_commit), sum(blks_hit), sum(blks_read), sum(tup_returned) "
        "FROM pg_stat_database, generate_series(1, 2000)",
        250,
    )


@app.get("/metrics")
def metrics() -> dict:
    with _lock:
        lats = [ms for _, ms in _lat]
        p95 = (
            statistics.quantiles(lats, n=20)[18]
            if len(lats) >= 20
            else (max(lats) if lats else None)
        )
        return {
            "requests_total": _requests,
            "errors_total": _errors,
            "latency_p95_ms": round(p95, 2) if p95 is not None else None,
        }


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("AEGIS_DEMO_WEB_PORT", "9300")),
        log_level="warning",
    )
