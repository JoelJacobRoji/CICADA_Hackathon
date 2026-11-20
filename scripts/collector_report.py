"""Collector evidence report from a collector SQLite DB (read-only).

Reports: volumes, local processing latency (raw event -> payload durably queued), ledger chain
status, and a leak check of the egress tables for the S1 fake secrets.

Usage: uv run python scripts/collector_report.py <path/to/collector.db> [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from aegis_collector.egress.ledger import verify_chain  # noqa: E402

from simulator.scenarios import FAKE_SECRETS  # noqa: E402


def pct(vals: list[float], p: float) -> float:
    s = sorted(vals)
    return s[max(0, math.ceil(p / 100 * len(s)) - 1)] if s else float("nan")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("db", type=Path)
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()
    conn = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)

    raw = conn.execute("SELECT count(*) FROM raw_events").fetchone()[0]
    span = conn.execute(
        "SELECT min(received_at_utc), max(received_at_utc) FROM raw_events"
    ).fetchone()
    kinds = dict(conn.execute("SELECT kind, count(*) FROM egress_ledger GROUP BY kind").fetchall())
    outbox = dict(conn.execute("SELECT status, count(*) FROM outbox GROUP BY status").fetchall())

    lat = []
    for payload_json, created in conn.execute(
        "SELECT payload_json, created_at FROM egress_ledger WHERE kind = 'metric_summary'"
    ):
        p = json.loads(payload_json)
        first = datetime.fromisoformat(p["first_event_ts_utc"].replace("Z", "+00:00"))
        lat.append((datetime.fromisoformat(created) - first).total_seconds())

    egress_text = "".join(r[0] for r in conn.execute("SELECT payload_json FROM egress_ledger"))
    leaks = {k: (v in egress_text) for k, v in FAKE_SECRETS.items()}
    q = "SELECT count(*) FROM raw_events WHERE raw_json LIKE ?"
    raw_text_has = {k: conn.execute(q, (f"%{v}%",)).fetchone()[0] for k, v in FAKE_SECRETS.items()}
    chain = verify_chain(conn)
    seqs = sorted(
        int(r[0])
        for r in conn.execute(
            "SELECT json_extract(payload_json,'$.collector_seq') FROM egress_ledger "
            "WHERE kind != 'topology_edge'"
        )
    )
    gaps = sum(1 for x, y in zip(seqs, seqs[1:], strict=False) if y != x + 1)

    if span[0] and span[1]:
        dur = (datetime.fromisoformat(span[1]) - datetime.fromisoformat(span[0])).total_seconds()
    else:
        dur = 0.0
    rep = {
        "raw_events_stored": raw,
        "ingest_span_seconds": round(dur, 1),
        "avg_ingest_rate_per_s": round(raw / dur, 1) if dur else None,
        "egress_payloads_by_kind": kinds,
        "outbox_by_status": outbox,
        "local_latency_first_event_to_queued_s": {
            "n": len(lat),
            "p50": round(pct(lat, 50), 3),
            "p95": round(pct(lat, 95), 3),
            "max": round(max(lat), 3) if lat else None,
            "note": "includes the 2 s window + 1 s grace by design",
        },
        "ledger_chain": chain.__dict__,
        "collector_seq_gaps": gaps,
        "s1_secrets_in_raw_store_rows": raw_text_has,
        "s1_secrets_in_egress": leaks,
    }
    print(json.dumps(rep, indent=2))
    if a.json:
        a.json.write_text(json.dumps(rep, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
