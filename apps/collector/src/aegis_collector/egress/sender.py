"""Outbox sender: at-least-once delivery of ledgered payloads to the SaaS (idempotent server side).

- Picks pending rows oldest-first (<= batch_size), marks them 'sending', POSTs the batch whose
  items are the EXACT ledger JSON strings (byte-identical to the egress proof).
- 200 + ack: accepted/duplicate -> delivered; rejected -> dead (+ dead_letter); missing -> retry.
- Network error / 5xx / 429 -> back to pending with exponential backoff + jitter (max 30 s).
- 401/403 -> back to pending, sender pauses (AUTH_ERROR) - nothing is dropped.
"""

from __future__ import annotations

import json
import random
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
import structlog

log = structlog.get_logger("collector.sender")


def backoff_seconds(
    attempts: int, base: float = 1.0, cap: float = 30.0, jitter: float = 0.2
) -> float:
    delay = min(cap, base * (2 ** max(0, attempts - 1)))
    return max(0.1, delay * (1 + random.uniform(-jitter, jitter)))  # noqa: S311 - not crypto


@dataclass
class SendResult:
    sent: int = 0
    accepted: int = 0
    duplicate: int = 0
    rejected: int = 0
    retried: int = 0
    status: str = "idle"  # idle | ok | network_error | auth_error | server_error


class Sender:
    def __init__(
        self,
        *,
        conn: sqlite3.Connection,
        lock: threading.RLock,
        client: httpx.Client,
        region: str,
        token: str,
        batch_size: int = 500,
    ):
        self.conn = conn
        self.lock = lock
        self.client = client
        self.region = region
        self.token = token
        self.batch_size = batch_size
        self.state = "ok"
        self.paused_until: datetime | None = None
        self.last_error: str | None = None

    # ---------- DB helpers (always under lock) ----------

    def _claim(self, now: datetime) -> list[tuple[str, str, int]]:
        with self.lock:
            rows = self.conn.execute(
                "SELECT o.payload_id, l.payload_json, o.attempts FROM outbox o"
                " JOIN egress_ledger l USING (payload_id)"
                " WHERE o.status = 'pending' AND o.next_attempt_at <= ?"
                " ORDER BY l.seq LIMIT ?",
                (now.isoformat(), self.batch_size),
            ).fetchall()
            if rows:
                self.conn.executemany(
                    "UPDATE outbox SET status = 'sending' WHERE payload_id = ?",
                    [(r[0],) for r in rows],
                )
        return [(r[0], r[1], r[2]) for r in rows]

    def _release(self, ids_attempts: list[tuple[str, int]], error: str, now: datetime) -> None:
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            for pid, attempts in ids_attempts:
                nxt = now + timedelta(seconds=backoff_seconds(attempts + 1))
                self.conn.execute(
                    "UPDATE outbox SET status='pending', attempts=attempts+1, next_attempt_at=?,"
                    " last_error=? WHERE payload_id=?",
                    (nxt.isoformat(), error, pid),
                )
            self.conn.execute("COMMIT")

    def _apply_ack(
        self, claimed: list[tuple[str, str, int]], ack: dict, now: datetime
    ) -> SendResult:
        accepted = {str(x) for x in ack.get("accepted", [])}
        duplicate = {str(x) for x in ack.get("duplicate", [])}
        rejected = {str(r.get("payload_id")): r.get("reason", "?") for r in ack.get("rejected", [])}
        res = SendResult(sent=len(claimed), status="ok")
        retry: list[tuple[str, int]] = []
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            for pid, _json, attempts in claimed:
                if pid in accepted or pid in duplicate:
                    kind = "accepted" if pid in accepted else "duplicate"
                    self.conn.execute(
                        "UPDATE outbox SET status='delivered', delivered_at=?, ack_kind=?,"
                        " attempts=attempts+1, last_error=NULL WHERE payload_id=?",
                        (now.isoformat(), kind, pid),
                    )
                    res.accepted += kind == "accepted"
                    res.duplicate += kind == "duplicate"
                elif pid in rejected:
                    self.conn.execute(
                        "UPDATE outbox SET status='dead', attempts=attempts+1, last_error=?"
                        " WHERE payload_id=?",
                        (rejected[pid], pid),
                    )
                    self.conn.execute(
                        "INSERT OR REPLACE INTO dead_letter (payload_id, reason, at_utc)"
                        " VALUES (?,?,?)",
                        (pid, rejected[pid], now.isoformat()),
                    )
                    res.rejected += 1
                else:
                    retry.append((pid, attempts))
            self.conn.execute("COMMIT")
        if retry:
            self._release(retry, "missing_from_ack", now)
            res.retried = len(retry)
        return res

    # ---------- main step ----------

    def send_once(self) -> SendResult:
        now = datetime.now(UTC)
        if self.paused_until and now < self.paused_until:
            return SendResult(status=self.state)
        claimed = self._claim(now)
        if not claimed:
            return SendResult(status="idle")
        body = (
            '{"batch_id":"'
            + str(uuid.uuid4())
            + '","sent_at_utc":"'
            + now.isoformat()
            + '","items":['
            + ",".join(c[1] for c in claimed)
            + "]}"
        )
        ids_attempts = [(c[0], c[2]) for c in claimed]
        try:
            r = self.client.post(
                f"/api/v1/ingest/{self.region}",
                content=body.encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            self._release(
                ids_attempts, f"network:{type(exc).__name__}", datetime.now(UTC)
            )  # backoff from FAILURE time
            self.state, self.last_error = "network_error", type(exc).__name__
            return SendResult(sent=len(claimed), retried=len(claimed), status="network_error")

        if r.status_code in (401, 403):
            self._release(
                ids_attempts, f"auth:{r.status_code}", datetime.now(UTC)
            )  # backoff from FAILURE time
            self.state, self.last_error = "auth_error", str(r.status_code)
            self.paused_until = datetime.now(UTC) + timedelta(seconds=30)
            log.error("sender_auth_error", status=r.status_code)
            return SendResult(sent=len(claimed), retried=len(claimed), status="auth_error")
        if r.status_code != 200:
            self._release(
                ids_attempts, f"http:{r.status_code}", datetime.now(UTC)
            )  # backoff from FAILURE time
            self.state, self.last_error = "server_error", str(r.status_code)
            return SendResult(sent=len(claimed), retried=len(claimed), status="server_error")

        res = self._apply_ack(claimed, json.loads(r.text), now)
        self.state, self.last_error, self.paused_until = "ok", None, None
        return res

    def drain(self, max_batches: int = 1000) -> SendResult:
        total = SendResult(status="idle")
        for _ in range(max_batches):
            r = self.send_once()
            if r.status == "idle":
                break
            total.sent += r.sent
            total.accepted += r.accepted
            total.duplicate += r.duplicate
            total.rejected += r.rejected
            total.retried += r.retried
            total.status = r.status
            if r.status != "ok":
                break
        return total
