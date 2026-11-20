"""Collector-local SQLite store (WAL, synchronous=FULL).

Tables
- raw_events     : original records - LOCAL ONLY, subject to retention
- egress_ledger  : exact outbound JSON + SHA-256 + hash chain (tamper-evident)
- outbox         : delivery state per payload_id (transactional outbox)
- dead_letter    : payloads rejected by SaaS (never retried blindly)
- pseudonyms     : source_id <-> source_pid mapping - LOCAL ONLY
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 2

DDL = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL,
    record_type     TEXT NOT NULL CHECK (record_type IN ('metric', 'log')),
    source_id       TEXT NOT NULL,
    event_ts_utc    TEXT NOT NULL,
    received_at_utc TEXT NOT NULL,
    adapter         TEXT NOT NULL,
    raw_json        TEXT NOT NULL,
    masked_json     TEXT NOT NULL DEFAULT '{}',
    findings        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_raw_events_received ON raw_events (received_at_utc);
CREATE INDEX IF NOT EXISTS ix_raw_events_source_ts ON raw_events (source_id, event_ts_utc);

CREATE TABLE IF NOT EXISTS pseudonyms (
    source_id  TEXT PRIMARY KEY,
    source_pid TEXT NOT NULL UNIQUE,
    first_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS egress_ledger (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    payload_id   TEXT NOT NULL UNIQUE,
    kind         TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    sha256       TEXT NOT NULL,
    prev_hash    TEXT NOT NULL,
    chain_hash   TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
    payload_id      TEXT PRIMARY KEY REFERENCES egress_ledger (payload_id),
    status          TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'delivered', 'dead')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    delivered_at    TEXT,
    ack_kind        TEXT CHECK (ack_kind IN ('accepted', 'duplicate')),
    last_error      TEXT
);
CREATE INDEX IF NOT EXISTS ix_outbox_status_next ON outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS dead_letter (
    payload_id TEXT PRIMARY KEY,
    reason     TEXT NOT NULL,
    at_utc     TEXT NOT NULL
);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def init_db(db_path: Path) -> sqlite3.Connection:
    conn = connect(db_path)
    conn.executescript(DDL)
    # v1 -> v2: masked display copy on raw_events.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(raw_events)")}
    if "masked_json" not in cols:
        conn.execute("ALTER TABLE raw_events ADD COLUMN masked_json TEXT NOT NULL DEFAULT '{}'")
    if "findings" not in cols:
        conn.execute("ALTER TABLE raw_events ADD COLUMN findings TEXT NOT NULL DEFAULT ''")
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (str(SCHEMA_VERSION),),
    )
    conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('collector_seq', '0')")
    # Crash recovery: anything mid-send at shutdown goes back to pending (RELIABILITY.md).
    conn.execute("UPDATE outbox SET status = 'pending' WHERE status = 'sending'")
    return conn


def journal_mode(conn: sqlite3.Connection) -> str:
    return str(conn.execute("PRAGMA journal_mode").fetchone()[0])
