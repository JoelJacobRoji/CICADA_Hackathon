"""Collector pipeline: normalise -> store raw (local) -> route -> aggregate/detect -> egress.

Thread-safety: every call that touches SQLite or pipeline state holds ``self.lock``.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from aegis_contracts.inbound import LogEvent, MetricEvent, parse_inbound
from pydantic import ValidationError

from ..egress.builder import Builder, metric_summary, security_summary, topology_edge
from ..egress.canary import SecretFingerprints
from ..egress.ledger import Egress
from .aggregator import WindowAggregator
from .auth_detector import AuthDetector
from .health_local import classify
from .localconfig import Inventory, Thresholds
from .pseudonym import Pseudonymizer
from .scrubber import scrub_record

log = structlog.get_logger("collector.pipeline")


class Pipeline:
    def __init__(
        self,
        *,
        conn: sqlite3.Connection,
        collector_id: str,
        pseudonym_secret: str,
        thresholds: Thresholds,
        inventory: Inventory,
        window_seconds: float = 2.0,
        grace_seconds: float = 1.0,
    ):
        self.conn = conn
        self.collector_id = collector_id
        self.thresholds = thresholds
        self.inventory = inventory
        self.lock = threading.RLock()
        self.pseudo = Pseudonymizer(pseudonym_secret, conn)
        self.agg = WindowAggregator(window_seconds, grace_seconds)
        self.auth = AuthDetector(thresholds.security)
        self.fingerprints = SecretFingerprints()
        self.egress = Egress(conn, self.fingerprints)
        self.stats: Counter[str] = Counter()
        self.closed = False

    # ---------------- ingest ----------------

    def process(self, adapter: str, records: list[Any]) -> tuple[int, int]:
        """Validate, persist raw (local) and route records. Returns (accepted, rejected)."""
        now = datetime.now(UTC).isoformat()
        rows: list[tuple[Any, ...]] = []
        parsed: list[MetricEvent | LogEvent] = []
        rejected = 0
        secrets: set[str] = set()
        for obj in records:
            if not isinstance(obj, dict):
                rejected += 1
                continue
            try:
                rec = parse_inbound(obj)
            except ValidationError:
                rejected += 1
                continue
            masked, findings = scrub_record(obj, secrets)
            rows.append(
                (
                    rec.event_id,
                    rec.record_type,
                    rec.source_id,
                    rec.event_timestamp.isoformat(),
                    now,
                    adapter,
                    json.dumps(obj, ensure_ascii=False, default=str),
                    masked,
                    ",".join(findings),
                )
            )
            parsed.append(rec)

        with self.lock:
            if self.closed:
                raise RuntimeError("collector is shutting down")
            self.fingerprints.add_many(secrets)  # hashes only, in memory
            if rows:
                c = self.conn
                c.execute("BEGIN IMMEDIATE")
                try:
                    c.executemany(
                        "INSERT INTO raw_events (event_id, record_type, source_id, event_ts_utc,"
                        " received_at_utc, adapter, raw_json, masked_json, findings)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        rows,
                    )
                    c.execute("COMMIT")
                except Exception:
                    c.execute("ROLLBACK")
                    raise
            security_builders: list[Builder] = []
            for rec in parsed:
                if isinstance(rec, MetricEvent):
                    self.agg.add(
                        source_id=rec.source_id,
                        metric=rec.metric,
                        unit=rec.unit,
                        category=rec.category,
                        source_timezone=rec.source_timezone,
                        value=rec.value,
                        ts=rec.event_timestamp,
                        severity=rec.severity,
                    )
                else:
                    for f in self.auth.observe(rec):
                        self.stats["security_findings"] += 1
                        pid = self.pseudo.pid(f.source_id)
                        security_builders.append(security_summary(self.collector_id, pid, f))
            if security_builders:
                self._emit(security_builders)
            self.stats["accepted"] += len(parsed)
            self.stats["rejected"] += rejected
            self.stats[f"adapter:{adapter}"] += len(parsed)
        if rejected:
            log.info("records_rejected", adapter=adapter, count=rejected)  # counts only
        return len(parsed), rejected

    # ---------------- windows ----------------

    def flush(self, now: datetime | None = None, force: bool = False) -> int:
        with self.lock:
            if self.closed:
                return 0
            results = self.agg.flush(now or datetime.now(UTC), force=force)
            builders: list[Builder] = []
            for w in results:
                pid = self.pseudo.pid(w.source_id)
                kind = self.inventory.kind_of(w.source_id)
                builders.append(
                    metric_summary(self.collector_id, pid, kind, w, classify(w, self.thresholds))
                )
            self.stats["windows_flushed"] += len(results)
            self.stats["late_events"] = self.agg.late_events
            return self._emit(builders)

    def emit_topology(self) -> int:
        with self.lock:
            builders = [
                topology_edge(self.collector_id, self.pseudo.pid(e.src), self.pseudo.pid(e.dst), e)
                for e in self.inventory.edges
            ]
            return self._emit(builders)

    def _emit(self, builders: list[Builder]) -> int:
        res = self.egress.emit(builders)
        self.stats["payloads_queued"] += res.queued
        self.stats["egress_blocked"] += res.blocked
        self.stats["egress_duplicates"] += res.duplicates
        return res.queued

    # ---------------- housekeeping ----------------

    def purge_raw(self, retention_hours: int, now: datetime | None = None) -> int:
        cutoff = ((now or datetime.now(UTC)) - timedelta(hours=retention_hours)).isoformat()
        with self.lock:
            cur = self.conn.execute("DELETE FROM raw_events WHERE received_at_utc < ?", (cutoff,))
            n = cur.rowcount
        self.stats["raw_purged"] += n
        return n

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            outbox = dict(
                self.conn.execute("SELECT status, count(*) FROM outbox GROUP BY status").fetchall()
            )
            raw = self.conn.execute("SELECT count(*) FROM raw_events").fetchone()[0]
            return {
                **dict(self.stats),
                "open_windows": self.agg.open_windows,
                "raw_events_stored": raw,
                "outbox": outbox,
            }
