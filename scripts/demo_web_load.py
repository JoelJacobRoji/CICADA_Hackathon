"""Real traffic for APP_WEB_DEMO: a small load generator (httpx, no extra tools).

Rate follows a slow wave (busy/quiet) so baselines see natural variation. --surge SECONDS@AT
adds a genuine traffic surge (e.g. 60@300 = 60 s of 6x load starting at t+300 s).

Usage: uv run python scripts/demo_web_load.py [--rps 8] [--minutes 30] [--surge 60@300]
"""

from __future__ import annotations

import argparse
import math
import random
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

BASE = "http://127.0.0.1:9300"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rps", type=float, default=8.0, help="average requests per second")
    ap.add_argument("--minutes", type=float, default=30.0)
    ap.add_argument("--surge", default="", help="DURATION@START seconds, e.g. 60@300")
    a = ap.parse_args()
    surge = tuple(float(x) for x in a.surge.split("@")) if a.surge else None
    client = httpx.Client(timeout=5)
    rng = random.Random(42)  # noqa: S311 - traffic shaping, not security
    t0 = time.monotonic()
    sent = 0
    with ThreadPoolExecutor(max_workers=16) as pool:
        while (el := time.monotonic() - t0) < a.minutes * 60:
            rate = a.rps * (1 + 0.35 * math.sin(el / 90))
            if surge and surge[1] <= el < surge[1] + surge[0]:
                rate *= 6
            path = "/api/report" if rng.random() < 0.2 else "/api/orders"
            pool.submit(lambda p=path: client.get(BASE + p))
            sent += 1
            if sent % 200 == 0:
                print(f"[REAL TRAFFIC] t+{el:5.0f}s sent={sent}", flush=True)
            time.sleep(rng.expovariate(rate))


if __name__ == "__main__":
    main()
