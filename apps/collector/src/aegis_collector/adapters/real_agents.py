"""Diversified REAL sources: storage (disk I/O), database (PostgreSQL stats), web application.

Every reader returns inbound metric records (same contract as any other source), so the data goes
through the normal local pipeline: aggregation, local health, pseudonymisation, egress canary and
ledger. Only numbers leave the collector: no SQL text, no URLs, no hostnames, no file names.

Rates are computed from counter deltas between two samples; the first sample only primes the
counters (no invented values).
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
import psutil

STORAGE_ID = "STO_LAPTOP_DISK"
DATABASE_ID = "DB_AEGIS_PG"
WEB_ID = "APP_WEB_DEMO"


def _ev(source_id: str, metric: str, value: float, unit: str, category: str) -> dict[str, Any]:
    return {
        "event_id": f"RAG_{uuid.uuid4().hex[:16]}",
        "source_id": source_id,
        "event_timestamp": datetime.now(UTC).isoformat(),
        "source_timezone": "UTC",
        "metric": metric,
        "value": round(float(value), 3),
        "unit": unit,
        "category": category,
    }


class StorageAgent:
    """System disk of this machine: usage %, IOPS and average I/O latency."""

    def __init__(self, mount: str = "/") -> None:
        self.mount = mount
        self._last: tuple[float, int, int] | None = None  # (monotonic, ops, busy_ms)

    def sample(self) -> list[dict[str, Any]]:
        out = [
            _ev(
                STORAGE_ID,
                "disk_usage",
                psutil.disk_usage(self.mount).percent,
                "percent",
                "infrastructure",
            )
        ]
        io = psutil.disk_io_counters()
        if io is None:  # no disk counters on this platform: report usage only
            return out
        now = time.monotonic()
        ops = io.read_count + io.write_count
        busy = io.read_time + io.write_time  # ms spent on completed reads + writes
        if self._last is not None:
            dt = now - self._last[0]
            d_ops = ops - self._last[1]
            d_busy = busy - self._last[2]
            if dt > 0 and d_ops >= 0:
                out.append(_ev(STORAGE_ID, "disk_iops", d_ops / dt, "ops", "infrastructure"))
                if d_ops > 0 and d_busy >= 0:
                    out.append(
                        _ev(STORAGE_ID, "disk_latency_ms", d_busy / d_ops, "ms", "infrastructure")
                    )
        self._last = (now, ops, busy)
        return out


PG_SQL = (
    "SELECT sum(numbackends), sum(xact_commit), sum(xact_rollback), sum(blks_hit), "
    "sum(blks_read) FROM pg_stat_database"
)


class PostgresAgent:
    """PostgreSQL via a read-only monitoring role: connections, TPS, cache hit %, rollback %."""

    def __init__(self, dsn: str, connect=None) -> None:  # noqa: ANN001 - injectable for tests
        self.dsn = dsn
        self._connect = connect
        self._last: tuple[float, int, int, int, int] | None = None  # t, commit, rollback, hit, read

    def _query(self) -> tuple[float, ...]:
        if self._connect is None:
            import psycopg

            self._connect = lambda: psycopg.connect(self.dsn, connect_timeout=3)
        with self._connect() as conn:
            row = conn.execute(PG_SQL).fetchone()
        return tuple(float(x or 0) for x in row)

    def sample(self) -> list[dict[str, Any]]:
        try:
            backends, commit, rollback, hit, read = self._query()
        except Exception:  # noqa: BLE001 - an unreachable database is a real, reportable state
            self._last = None
            return [_ev(DATABASE_ID, "service_up", 0, "bool", "application")]
        now = time.monotonic()
        out = [
            _ev(DATABASE_ID, "service_up", 1, "bool", "application"),
            _ev(DATABASE_ID, "db_connections", backends, "count", "application"),
        ]
        if self._last is not None:
            dt = now - self._last[0]
            d_commit, d_rb = commit - self._last[1], rollback - self._last[2]
            d_hit, d_read = hit - self._last[3], read - self._last[4]
            if dt > 0 and d_commit >= 0 and d_rb >= 0:
                xacts = d_commit + d_rb
                out.append(_ev(DATABASE_ID, "db_tps", xacts / dt, "rps", "application"))
                if xacts > 0:
                    out.append(
                        _ev(
                            DATABASE_ID,
                            "error_rate",
                            100.0 * d_rb / xacts,
                            "percent",
                            "application",
                        )
                    )
            if d_hit >= 0 and d_read >= 0 and (d_hit + d_read) > 0:
                out.append(
                    _ev(
                        DATABASE_ID,
                        "cache_hit_ratio",
                        100.0 * d_hit / (d_hit + d_read),
                        "percent",
                        "application",
                    )
                )
        self._last = (now, int(commit), int(rollback), int(hit), int(read))
        return out


class WebAgent:
    """A local web application's metrics endpoint (cumulative counters + recent p95 latency)."""

    def __init__(self, url: str, client: httpx.Client | None = None) -> None:
        self.url = url
        self.client = client or httpx.Client(timeout=3)
        self._last: tuple[float, int, int] | None = None  # t, requests, errors

    def sample(self) -> list[dict[str, Any]]:
        try:
            r = self.client.get(self.url)
            r.raise_for_status()
            m = r.json()
        except Exception:  # noqa: BLE001 - down is a real state, not an error to hide
            self._last = None
            return [_ev(WEB_ID, "service_up", 0, "bool", "application")]
        now = time.monotonic()
        req, err = int(m["requests_total"]), int(m["errors_total"])
        out = [_ev(WEB_ID, "service_up", 1, "bool", "application")]
        if m.get("latency_p95_ms") is not None:
            out.append(_ev(WEB_ID, "latency_ms", float(m["latency_p95_ms"]), "ms", "application"))
        if self._last is not None:
            dt = now - self._last[0]
            d_req, d_err = req - self._last[1], err - self._last[2]
            if dt > 0 and d_req >= 0 and d_err >= 0:
                out.append(_ev(WEB_ID, "request_rate", d_req / dt, "rps", "application"))
                if d_req > 0:
                    out.append(
                        _ev(WEB_ID, "error_rate", 100.0 * d_err / d_req, "percent", "application")
                    )
        self._last = (now, req, err)
        return out
