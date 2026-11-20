"""AEGIS dev simulator CLI (SIMULATED DATA).

Examples
  uv run python -m simulator --duration 60                       # 100 ev/s baseline
  uv run python -m simulator --scenario s1 --scenario-at 5
  uv run python -m simulator --scenario s5 --scenario-at 90 --duration 240
  uv run python -m simulator --burst 30:60:500 --duration 120   # 500 ev/s from t=30 for 60 s
  uv run python -m simulator --write-jsonl out.jsonl --duration 30 --scenario s3
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from .generator import Generator
from .scenarios import SCENARIOS

ROOT = Path(__file__).resolve().parents[1]


def _ingest_token() -> str:
    tok = os.environ.get("AEGIS_COL_INGEST_TOKEN")
    if tok:
        return tok
    env = ROOT / "apps" / "collector" / ".env"
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("AEGIS_COL_INGEST_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("AEGIS_COL_INGEST_TOKEN not found (run scripts/gen-secrets.py)")


def _parse_burst(spec: str) -> tuple[float, float, float]:
    start, dur, rate = (float(x) for x in spec.split(":"))
    return start, dur, rate


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="AEGIS dev telemetry simulator (SIMULATED)")
    ap.add_argument("--url", default="http://127.0.0.1:9100")
    ap.add_argument("--rate", type=float, default=100.0, help="metric events per second")
    ap.add_argument("--duration", type=float, default=60.0, help="seconds")
    ap.add_argument(
        "--scenario",
        action="append",
        default=[],
        help=f"one of {sorted(SCENARIOS)}, optionally NAME@SECONDS (own start time)",
    )
    ap.add_argument("--scenario-at", type=float, default=5.0, help="seconds after start")
    ap.add_argument("--burst", action="append", default=[], help="start:duration:rate")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--write-jsonl", type=Path, help="write records to file instead of POSTing")
    args = ap.parse_args(argv)

    gen = Generator(seed=args.seed)
    start = datetime.now(UTC)
    for spec in args.scenario:
        name, _, at = spec.partition("@")
        if name not in SCENARIOS:
            ap.error(f"unknown scenario {name!r}; choose from {sorted(SCENARIOS)}")
        t = float(at) if at else args.scenario_at
        sc = SCENARIOS[name]()
        gen.add_scenario(sc, start + timedelta(seconds=t))
        print(f"[SIMULATED] scenario {name} at t+{t:.0f}s: {sc.description}")
    bursts = [_parse_burst(b) for b in args.burst]

    if args.write_jsonl:
        n = 0
        with args.write_jsonl.open("w", encoding="utf-8") as fh:
            for batch in gen.run_offline(start, args.duration, args.rate):
                for r in batch:
                    fh.write(json.dumps(r) + "\n")
                    n += 1
        print(f"[SIMULATED] wrote {n} records to {args.write_jsonl}")
        return

    headers = {"Authorization": f"Bearer {_ingest_token()}", "X-Aegis-Adapter": "simulator"}
    tick, carry, sent, errors = 0.1, 0.0, 0, 0
    t_start = last = time.monotonic()
    next_report = 10.0
    with httpx.Client(base_url=args.url, headers=headers, timeout=10) as client:
        while (elapsed := time.monotonic() - t_start) < args.duration:
            rate = args.rate
            for b_start, b_dur, b_rate in bursts:
                if b_start <= elapsed < b_start + b_dur:
                    rate = b_rate
            # Meter by real elapsed time so the achieved rate matches the requested rate.
            now_m = time.monotonic()
            carry += rate * (now_m - last)
            last = now_m
            n = int(carry)
            carry -= n
            now = datetime.now(UTC)
            batch = gen.due_scheduled(now) + gen.metrics(n, now)
            if batch:
                try:
                    r = client.post("/api/v1/telemetry", json=batch)
                    r.raise_for_status()
                    sent += len(batch)
                except httpx.HTTPError:
                    errors += 1
            if elapsed >= next_report:
                print(f"[SIMULATED] t+{elapsed:5.1f}s sent={sent} errors={errors}")
                next_report += 10.0
            time.sleep(tick)
    total = time.monotonic() - t_start
    print(
        f"[SIMULATED] done: sent={sent} records in {total:.1f}s "
        f"({sent / total:.1f}/s avg), http_errors={errors}"
    )


if __name__ == "__main__":
    main()
