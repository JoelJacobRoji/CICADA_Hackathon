"""Stable, non-reversible (outside the collector) source pseudonyms."""

from __future__ import annotations

import hashlib
import hmac
import sqlite3
from datetime import UTC, datetime


def pseudonym(secret: bytes, source_id: str) -> str:
    digest = hmac.new(secret, source_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return "src_" + digest[:16]


class Pseudonymizer:
    """Computes pseudonyms and records the local mapping (for operator lookup on the collector)."""

    def __init__(self, secret: str, conn: sqlite3.Connection):
        self._secret = secret.encode("utf-8")
        self._conn = conn
        self._cache: dict[str, str] = {}

    def pid(self, source_id: str) -> str:
        cached = self._cache.get(source_id)
        if cached:
            return cached
        pid = pseudonym(self._secret, source_id)
        self._conn.execute(
            "INSERT OR IGNORE INTO pseudonyms (source_id, source_pid, first_seen) VALUES (?, ?, ?)",
            (source_id, pid, datetime.now(UTC).isoformat()),
        )
        self._cache[source_id] = pid
        return pid

    def lookup(self, source_pid: str) -> str | None:
        row = self._conn.execute(
            "SELECT source_id FROM pseudonyms WHERE source_pid = ?", (source_pid,)
        ).fetchone()
        return row[0] if row else None
