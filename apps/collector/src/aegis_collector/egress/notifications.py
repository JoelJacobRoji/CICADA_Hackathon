"""Device alerts: pull incident notifications from the SaaS, re-identify locally, deliver locally.

Flow (outbound-only, like every other collector connection - the SaaS never connects in):
  1. GET  /api/v1/notifications/{region}   (collector token)  -> pseudonymous notifications
  2. store the SaaS payload unchanged + a re-identified local copy in SQLite (durable)
  3. POST /api/v1/notifications/{region}/ack                  (only after the local commit)
  4. deliver the re-identified copy to the local webhook (loopback/private only), with retries

Re-identification uses the local pseudonym table, so real source names exist ONLY on this machine.
Notifications are informational: nothing here executes any action.
"""

from __future__ import annotations

import ipaddress
import json
import re
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx
import structlog

log = structlog.get_logger("collector.notifications")

DDL = """
CREATE TABLE IF NOT EXISTS notifications (
    id               TEXT PRIMARY KEY,
    kind             TEXT NOT NULL,
    incident_id      TEXT NOT NULL,
    incident_version INTEGER NOT NULL,
    created_at       TEXT NOT NULL,
    received_at      TEXT NOT NULL,
    saas_payload     TEXT NOT NULL,
    local_payload    TEXT NOT NULL,
    webhook_status   TEXT NOT NULL CHECK (webhook_status IN
                     ('pending', 'delivered', 'failed', 'disabled')),
    webhook_attempts INTEGER NOT NULL DEFAULT 0,
    webhook_next_at  TEXT,
    webhook_at       TEXT,
    webhook_error    TEXT
);
CREATE INDEX IF NOT EXISTS ix_notifications_webhook ON notifications (webhook_status);
"""

FULL_PID = re.compile(r"src_[0-9a-f]{16}")
SHORT_PID = re.compile(r"src_([0-9a-f]{6})…")
MAX_WEBHOOK_ATTEMPTS = 8


def validate_webhook_url(url: str) -> str:
    """Only http(s) to a literal loopback/private IP or 'localhost' (no DNS: no rebinding)."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("webhook must be an http(s) URL")
    host = parts.hostname
    if host == "localhost":
        return url
    try:
        ip = ipaddress.ip_address(host)
    except ValueError as exc:
        raise ValueError("webhook host must be localhost or a literal IP address") from exc
    if not (ip.is_loopback or ip.is_private) or ip.is_link_local or ip.is_multicast:
        raise ValueError("webhook must point to a loopback or private-network address")
    return url


def init(conn: sqlite3.Connection, lock: threading.RLock) -> None:
    with lock:
        conn.executescript(DDL)


class Reidentifier:
    """src_ pseudonyms -> local source names, via the local pseudonym table."""

    def __init__(self, conn: sqlite3.Connection, lock: threading.RLock) -> None:
        self.conn, self.lock = conn, lock

    def _full(self, pid: str) -> str | None:
        with self.lock:
            r = self.conn.execute(
                "SELECT source_id FROM pseudonyms WHERE source_pid = ?", (pid,)
            ).fetchone()
        return r[0] if r else None

    def _short(self, prefix6: str) -> str | None:
        with self.lock:
            rows = self.conn.execute(
                "SELECT source_id FROM pseudonyms WHERE source_pid LIKE ? LIMIT 2",
                (f"src_{prefix6}%",),
            ).fetchall()
        return rows[0][0] if len(rows) == 1 else None  # ambiguous prefix: leave pseudonymous

    def text(self, s: str) -> str:
        s = FULL_PID.sub(lambda m: self._full(m.group()) or m.group(), s)
        return SHORT_PID.sub(lambda m: self._short(m.group(1)) or m.group(), s)

    def obj(self, o: Any) -> Any:
        if isinstance(o, str):
            return self.text(o)
        if isinstance(o, list):
            return [self.obj(x) for x in o]
        if isinstance(o, dict):
            return {k: self.obj(v) for k, v in o.items()}
        return o


class NotificationChannel:
    def __init__(
        self,
        *,
        conn: sqlite3.Connection,
        lock: threading.RLock,
        client: httpx.Client,
        region: str,
        token: str,
        collector_id: str,
        webhook_url: str | None,
        webhook_client: httpx.Client | None = None,
    ) -> None:
        self.conn, self.lock, self.client = conn, lock, client
        self.region, self.token, self.collector_id = region, token, collector_id
        self.webhook_url = validate_webhook_url(webhook_url) if webhook_url else None
        self.webhook_client = webhook_client or httpx.Client(timeout=5)
        self.reid = Reidentifier(conn, lock)
        self.last_error: str | None = None
        self.closed = False  # set (under lock) before the DB closes at shutdown
        init(conn, lock)

    # ------------------------------------------------------------------ pull + store + ack

    def poll(self) -> int:
        h = {"Authorization": f"Bearer {self.token}"}
        try:
            r = self.client.get(f"/api/v1/notifications/{self.region}", headers=h)
        except httpx.HTTPError as exc:
            self.last_error = type(exc).__name__
            return 0
        if r.status_code != 200:
            self.last_error = f"HTTP {r.status_code}"
            return 0
        items = r.json()
        if not items:
            self.last_error = None
            return 0
        now = datetime.now(UTC).isoformat()
        status = "pending" if self.webhook_url else "disabled"
        with self.lock:
            if self.closed:
                return 0  # shutting down: not acked, so the SaaS re-delivers next start
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                for n in items:
                    local = self.local_view(n)
                    self.conn.execute(
                        "INSERT OR IGNORE INTO notifications (id, kind, incident_id, "
                        "incident_version, created_at, received_at, saas_payload, local_payload, "
                        "webhook_status, webhook_next_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (
                            str(n["id"]),
                            n["kind"],
                            str(n["incident_id"]),
                            n["incident_version"],
                            str(n["created_at"]),
                            now,
                            json.dumps(n["payload"]),
                            json.dumps(local),
                            status,
                            now,
                        ),
                    )
                self.conn.execute("COMMIT")
            except BaseException:
                self.conn.execute("ROLLBACK")
                raise
        try:  # ack only after the local commit: a crash before this just re-delivers (dedup by id)
            self.client.post(
                f"/api/v1/notifications/{self.region}/ack",
                headers=h,
                json={"ids": [str(n["id"]) for n in items]},
            )
        except httpx.HTTPError as exc:
            self.last_error = f"ack: {type(exc).__name__}"
        log.info(
            "notifications_received", count=len(items), kinds=sorted({n["kind"] for n in items})
        )
        return len(items)

    def local_view(self, n: dict[str, Any]) -> dict[str, Any]:
        """What the device/operator sees locally: re-identified, plus delivery metadata."""
        return {
            "aegis_notification": {
                "id": str(n["id"]),
                "kind": n["kind"],
                "collector_id": self.collector_id,
                "incident_id": str(n["incident_id"]),
                "version": n["incident_version"],
                "created_at": str(n["created_at"]),
                "note": "Re-identified on the collector; the SaaS only holds pseudonymous IDs.",
            },
            **self.reid.obj(n["payload"]),
        }

    # ------------------------------------------------------------------ local webhook

    def deliver(self) -> int:
        if not self.webhook_url:
            return 0
        now = datetime.now(UTC)
        with self.lock:
            if self.closed:
                return 0
            rows = self.conn.execute(
                "SELECT id, local_payload, webhook_attempts FROM notifications "
                "WHERE webhook_status = 'pending' AND webhook_next_at <= ? "
                "ORDER BY received_at LIMIT 20",
                (now.isoformat(),),
            ).fetchall()
        sent = 0
        for nid, payload, attempts in rows:
            err = None
            try:
                r = self.webhook_client.post(
                    self.webhook_url,
                    content=payload.encode(),
                    headers={"Content-Type": "application/json", "X-AEGIS-Notification-Id": nid},
                )
                if not 200 <= r.status_code < 300:
                    err = f"HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                err = type(exc).__name__
            attempts += 1
            with self.lock:
                if self.closed:
                    return sent
                if err is None:
                    sent += 1
                    self.conn.execute(
                        "UPDATE notifications SET webhook_status='delivered', webhook_at=?, "
                        "webhook_attempts=?, webhook_error=NULL WHERE id=?",
                        (datetime.now(UTC).isoformat(), attempts, nid),
                    )
                else:
                    final = attempts >= MAX_WEBHOOK_ATTEMPTS
                    nxt = now + timedelta(seconds=min(60, 2**attempts))
                    self.conn.execute(
                        "UPDATE notifications SET webhook_status=?, webhook_attempts=?, "
                        "webhook_next_at=?, webhook_error=? WHERE id=?",
                        ("failed" if final else "pending", attempts, nxt.isoformat(), err, nid),
                    )
        return sent

    def tick(self) -> None:
        self.poll()
        self.deliver()

    def close(self) -> None:
        with self.lock:
            self.closed = True
        self.webhook_client.close()


def list_local(conn: sqlite3.Connection, lock: threading.RLock, limit: int) -> list[dict]:
    with lock:
        try:
            rows = conn.execute(
                "SELECT id, kind, incident_id, incident_version, created_at, received_at, "
                "local_payload, webhook_status, webhook_attempts, webhook_at, webhook_error "
                "FROM notifications ORDER BY received_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        except sqlite3.OperationalError:
            return []  # channel never initialised (no SaaS token configured)
    out = []
    for r in rows:
        d = dict(r)
        d["payload"] = json.loads(d.pop("local_payload"))
        out.append(d)
    return out
