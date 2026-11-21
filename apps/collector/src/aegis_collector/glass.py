"""Privacy Glass: show, for one payload, exactly what the collector saw and what left.

Columns: (1) raw records (local only) -> (2) their masked copies -> (3) the exact ledgered
outbound JSON + SHA-256 -> (4) the SHA-256 the SaaS computed from what it received.

Plus an automated leak check: every sensitive value from column 1 is searched for in the
outbound payload (and, in the leak scan, in every ledgered payload).

Local console only (loopback + local admin token). Nothing here is sent anywhere, except the
receipt lookup, which goes over the collector's existing OUTBOUND connection and returns only a
hash from the SaaS.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import httpx
import structlog

log = structlog.get_logger("collector.glass")

# Values that are part of the allow-listed vocabulary, not identifying data.
_BENIGN = {"failure", "success", "error", "ok", "true", "false", "info", "warning"}
_TOKEN = re.compile(r"[^\s=:,;\"'()\[\]{}]{6,}")
_RAW_LIMIT = 200
_SCAN_PAYLOADS = 200_000  # ~0.7 s per 20k payloads measured live; whole demo sessions fit


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sensitive_values(raw: dict[str, Any]) -> set[str]:
    """Identifying values of one raw record: names, IDs, message, attributes, secret-like tokens."""
    out: set[str] = set()
    for key in ("source_id", "tenant_id", "event_id"):
        v = raw.get(key)
        if isinstance(v, str) and len(v) >= 3:
            out.add(v)
    msg = raw.get("message")
    if isinstance(msg, str) and msg:
        out.add(msg)
        # secret-like tokens inside the message: contain a digit, '_', '@' or '.'
        out.update(t for t in _TOKEN.findall(msg) if re.search(r"[\d_@.]", t))
    attrs = raw.get("attributes")
    if isinstance(attrs, dict):
        for v in attrs.values():
            if isinstance(v, str) and len(v) >= 3:
                out.add(v)
    return {v for v in out if v.lower() not in _BENIGN}


def _mask(value: str) -> str:
    """For listing hits without re-printing a secret in full."""
    return value if len(value) <= 4 else f"{value[:2]}…{value[-2:]} ({len(value)} chars)"


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


@dataclass
class ReceiptClient:
    """Fetches the SaaS receipt (hash only) for one of THIS collector's payloads."""

    client: httpx.Client | None
    region: str
    token: str | None

    def fetch(self, payload_id: str) -> dict[str, Any]:
        if self.client is None or not self.token:
            return {"status": "disabled", "detail": "no collector token: sender disabled"}
        try:
            r = self.client.get(
                f"/api/v1/ingest/{self.region}/receipts/{payload_id}",
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=5,
            )
        except httpx.HTTPError as exc:
            return {"status": "unreachable", "detail": type(exc).__name__}
        if r.status_code == 404:
            return {"status": "not_received", "detail": "the SaaS has no record of it yet"}
        if r.status_code != 200:
            return {"status": "error", "detail": f"HTTP {r.status_code}"}
        return {"status": "ok", **r.json()}


def _pick_payload(conn, payload_id: str | None, kind: str | None):
    base = (
        "SELECT l.seq, l.payload_id, l.kind, l.payload_json, l.sha256, l.created_at,"
        " o.status, o.delivered_at, o.ack_kind FROM egress_ledger l"
        " JOIN outbox o USING (payload_id)"
    )
    if payload_id:
        return conn.execute(base + " WHERE l.payload_id = ?", (payload_id,)).fetchone()
    kinds = [kind] if kind else ["security_summary", "metric_summary"]
    for k in kinds:
        for delivered_only in (True, False):
            sql = base + " WHERE l.kind = ?"
            if delivered_only:
                sql += " AND o.status = 'delivered'"
            row = conn.execute(sql + " ORDER BY l.seq DESC LIMIT 1", (k,)).fetchone()
            if row is not None:
                return row
    return None


def _related_raw(conn, source_id: str, ws: datetime, we: datetime) -> list[Any]:
    lo = (ws - timedelta(seconds=1)).isoformat()
    hi = (we + timedelta(seconds=1)).isoformat()
    rows = conn.execute(
        "SELECT id, record_type, source_id, event_ts_utc, raw_json, masked_json, findings"
        " FROM raw_events WHERE source_id = ? AND event_ts_utc >= ? AND event_ts_utc <= ?"
        " ORDER BY event_ts_utc LIMIT ?",
        (source_id, lo, hi, _RAW_LIMIT),
    ).fetchall()
    return [r for r in rows if ws <= _parse(r["event_ts_utc"]) <= we]


def _contributes(kind: str, payload: dict[str, Any], raw: dict[str, Any]) -> bool:
    if kind == "metric_summary":
        return raw.get("record_type", "metric") == "metric" and raw.get("metric") == payload.get(
            "metric"
        )
    if kind == "security_summary":
        return raw.get("record_type") == "log" and raw.get("log_kind") == "auth"
    return False


def assemble(pipeline, receipts: ReceiptClient, payload_id: str | None, kind: str | None):
    """Build the four-column view for one payload. Returns None if there is no payload."""
    with pipeline.lock:
        row = _pick_payload(pipeline.conn, payload_id, kind)
        if row is None:
            return None
        payload = json.loads(row["payload_json"])
        records: list[dict[str, Any]] = []
        source_id = None
        if row["kind"] == "topology_edge":
            note = "Derived from the local inventory file (no raw records involved)."
        else:
            note = None
            source_id = pipeline.pseudo.lookup(payload.get("source_pid", ""))
            if source_id:
                ws, we = _parse(payload["window_start_utc"]), _parse(payload["window_end_utc"])
                for r in _related_raw(pipeline.conn, source_id, ws, we):
                    raw = json.loads(r["raw_json"])
                    records.append(
                        {
                            "id": r["id"],
                            "record_type": r["record_type"],
                            "event_ts_utc": r["event_ts_utc"],
                            "contributed": _contributes(row["kind"], payload, raw),
                            "raw": raw,
                            "masked": json.loads(r["masked_json"]),
                            "findings": [f for f in r["findings"].split(",") if f],
                        }
                    )
    # Contributing records first, then other local records from the same source and window.
    records.sort(key=lambda x: (not x["contributed"], x["event_ts_utc"]))

    payload_json = row["payload_json"]
    values: set[str] = set()
    for rec in records:
        values |= sensitive_values(rec["raw"])
    hits = sorted(v for v in values if v in payload_json)

    recomputed = _sha(payload_json)
    receipt = receipts.fetch(row["payload_id"])
    saas_sha = receipt.get("payload_sha256")
    log.info(  # audit line: counts only, no content
        "glass_viewed", payload_id=row["payload_id"], raw_records=len(records)
    )
    return {
        "payload_id": row["payload_id"],
        "kind": row["kind"],
        "ledger_seq": row["seq"],
        "created_at": row["created_at"],
        "outbox": {
            "status": row["status"],
            "delivered_at": row["delivered_at"],
            "ack_kind": row["ack_kind"],
        },
        "local_source_name": source_id,
        "note": note,
        "raw_records": records,
        "raw_records_total": len(records),
        "outbound": {
            "json": payload_json,
            "payload": payload,
            "bytes": len(payload_json.encode("utf-8")),
            "ledger_sha256": row["sha256"],
            "recomputed_sha256": recomputed,
            "ledger_hash_ok": recomputed == row["sha256"],
        },
        "receipt": receipt,
        "hash_match": saas_sha is not None and saas_sha == row["sha256"],
        "leak_check": {
            "sensitive_values_checked": len(values),
            "found_in_outbound": len(hits),
            "hits": [_mask(v) for v in hits],
        },
    }


def leak_scan(pipeline, limit: int = 200) -> dict[str, Any]:
    """Search ledgered payloads for every sensitive value of the local records with findings."""
    with pipeline.lock:
        recs = pipeline.conn.execute(
            "SELECT id, source_id, event_ts_utc, raw_json, masked_json, findings FROM raw_events"
            " WHERE findings != '' ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        payloads = pipeline.conn.execute(
            "SELECT payload_id, payload_json FROM egress_ledger ORDER BY seq DESC LIMIT ?",
            (_SCAN_PAYLOADS,),
        ).fetchall()
        total_payloads = pipeline.conn.execute("SELECT count(*) FROM egress_ledger").fetchone()[0]
    values: set[str] = set()
    for r in recs:
        values |= sensitive_values(json.loads(r["raw_json"]))
    corpus = "\n".join(p["payload_json"] for p in payloads)
    hits = sorted(v for v in values if v in corpus)
    hit_ids: list[str] = []
    if hits:
        hit_ids = [p["payload_id"] for p in payloads if any(v in p["payload_json"] for v in hits)]
    log.info("glass_leak_scan", records=len(recs), payloads=len(payloads), hits=len(hits))
    return {
        "records_with_findings": len(recs),
        "sensitive_values_checked": len(values),
        "payloads_scanned": len(payloads),
        "payloads_total": total_payloads,
        "found": len(hits),
        "hits": [_mask(v) for v in hits],
        "hit_payload_ids": hit_ids[:20],
        "examples": [
            {
                "id": r["id"],
                "source_id": r["source_id"],
                "event_ts_utc": r["event_ts_utc"],
                "findings": [f for f in r["findings"].split(",") if f],
                "raw": json.loads(r["raw_json"]),
                "masked": json.loads(r["masked_json"]),
            }
            # richest first: the record with the most secret findings is the clearest example
            for r in sorted(recs, key=lambda r: -len([f for f in r["findings"].split(",") if f]))[
                :3
            ]
        ],
    }
