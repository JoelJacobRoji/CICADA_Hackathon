"""Egress ledger + transactional outbox.

For every outbound payload, in ONE SQLite transaction:
  1. serialise the allow-listed model to its exact JSON (this is what will be sent),
  2. canary-scan it (fail closed),
  3. append it to the hash-chained egress ledger (sha256 + chain_hash),
  4. insert the outbox row (status=pending).
"""

from __future__ import annotations

import hashlib
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime

import structlog

from .builder import Builder
from .canary import EgressBlocked, SecretFingerprints, assert_clean

GENESIS = "0" * 64
log = structlog.get_logger("collector.egress")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chain_hash(prev: str, payload_sha: str) -> str:
    return sha256_hex(prev + payload_sha)


@dataclass
class EmitResult:
    queued: int = 0
    duplicates: int = 0
    blocked: int = 0


class Egress:
    def __init__(self, conn: sqlite3.Connection, fingerprints: SecretFingerprints | None = None):
        self.conn = conn
        self.fingerprints = fingerprints
        self._seq = int(
            conn.execute("SELECT value FROM meta WHERE key = 'collector_seq'").fetchone()[0]
        )
        row = conn.execute(
            "SELECT chain_hash FROM egress_ledger ORDER BY seq DESC LIMIT 1"
        ).fetchone()
        self._last_chain = row[0] if row else GENESIS

    def emit(self, builders: list[Builder]) -> EmitResult:
        res = EmitResult()
        if not builders:
            return res
        seq, last_chain = self._seq, self._last_chain
        now = datetime.now(UTC).isoformat()
        c = self.conn
        c.execute("BEGIN IMMEDIATE")
        try:
            for build in builders:
                model = build(seq + 1)
                payload_json = model.model_dump_json()
                try:
                    assert_clean(payload_json, self.fingerprints)
                except EgressBlocked as exc:
                    res.blocked += 1
                    # Pattern names only - never the payload.
                    log.warning("egress_blocked", kind=model.kind, findings=exc.findings)
                    continue
                exists = c.execute(
                    "SELECT 1 FROM egress_ledger WHERE payload_id = ?", (str(model.payload_id),)
                ).fetchone()
                if exists:
                    res.duplicates += 1
                    continue
                sha = sha256_hex(payload_json)
                ch = chain_hash(last_chain, sha)
                c.execute(
                    "INSERT INTO egress_ledger (payload_id, kind, payload_json, sha256, prev_hash,"
                    " chain_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (str(model.payload_id), model.kind, payload_json, sha, last_chain, ch, now),
                )
                c.execute(
                    "INSERT INTO outbox (payload_id, status, next_attempt_at, created_at)"
                    " VALUES (?, 'pending', ?, ?)",
                    (str(model.payload_id), now, now),
                )
                if model.kind != "topology_edge":
                    seq += 1
                last_chain = ch
                res.queued += 1
            c.execute("UPDATE meta SET value = ? WHERE key = 'collector_seq'", (str(seq),))
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
        self._seq, self._last_chain = seq, last_chain
        return res


@dataclass(frozen=True)
class ChainReport:
    ok: bool
    entries: int
    first_bad_seq: int | None
    reason: str | None


def verify_chain(conn: sqlite3.Connection) -> ChainReport:
    prev = GENESIS
    n = 0
    for seq, payload_json, sha, prev_hash, ch in conn.execute(
        "SELECT seq, payload_json, sha256, prev_hash, chain_hash FROM egress_ledger ORDER BY seq"
    ):
        n += 1
        if sha256_hex(payload_json) != sha:
            return ChainReport(False, n, seq, "payload hash mismatch (payload altered)")
        if prev_hash != prev:
            return ChainReport(False, n, seq, "prev_hash mismatch (entry removed or reordered)")
        if chain_hash(prev, sha) != ch:
            return ChainReport(False, n, seq, "chain hash mismatch")
        prev = ch
    return ChainReport(True, n, None, None)
