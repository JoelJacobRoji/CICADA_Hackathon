"""JSONL replay adapter: POSTs records from a .jsonl file to the collector at a fixed rate.

Usage:
  uv run python -m aegis_collector.adapters.jsonl_replay FILE [--rate 100] [--shift-to-now]
        [--loop] [--url http://127.0.0.1:9100]
The ingest token is read from AEGIS_COL_INGEST_TOKEN (env or apps/collector/.env).
"""

from __future__ import annotations

import argparse
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from ..config import get_settings


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def shift(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shift all event_timestamps so the earliest becomes 'now' (preserves spacing/order)."""
    ts = [datetime.fromisoformat(r["event_timestamp"].replace("Z", "+00:00")) for r in records]
    if not ts:
        return records
    delta = datetime.now(UTC) - min(ts)
    return [
        {**r, "event_timestamp": (t + delta).isoformat()} for r, t in zip(records, ts, strict=True)
    ]


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Replay JSONL telemetry into the AEGIS collector")
    ap.add_argument("file", type=Path)
    ap.add_argument("--rate", type=float, default=100.0, help="records per second")
    ap.add_argument("--batch", type=int, default=50)
    ap.add_argument("--shift-to-now", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--url", default="http://127.0.0.1:9100")
    args = ap.parse_args(argv)

    token = get_settings().ingest_token.get_secret_value()
    headers = {"Authorization": f"Bearer {token}", "X-Aegis-Adapter": "jsonl_replay"}
    sent = 0
    with httpx.Client(base_url=args.url, headers=headers, timeout=10) as client:
        while True:
            records = list(read_jsonl(args.file))
            if args.shift_to_now:
                records = shift(records)
            for i in range(0, len(records), args.batch):
                chunk = records[i : i + args.batch]
                t0 = time.perf_counter()
                r = client.post("/api/v1/telemetry", json=chunk)
                r.raise_for_status()
                sent += len(chunk)
                time.sleep(max(0.0, len(chunk) / args.rate - (time.perf_counter() - t0)))
            print(f"replayed {sent} records")
            if not args.loop:
                break


if __name__ == "__main__":
    main()
