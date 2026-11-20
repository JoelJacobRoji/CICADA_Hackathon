"""Live end-to-end UI test orchestration (real collector + simulator + deployed SaaS + browser).

1. Start the local collector (fresh DB) and the simulator (S5 at t+10 s).
2. Run Playwright tests tagged @live against the deployed dashboard.
3. Stop the collector; run the @offline test (collector must turn Poor without a page reload).

Credentials are read from the git-ignored apps/saas-api/.demo-operators.local and passed via env;
nothing secret is printed. Usage: uv run python scripts/e2e_live.py [--url https://...]
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"


def creds(slug: str = "acme") -> tuple[str, str]:
    last = None
    for line in (
        (ROOT / "apps/saas-api/.demo-operators.local").read_text(encoding="utf-8").splitlines()
    ):
        p = line.split("\t")
        if len(p) == 4 and p[0] == slug and p[1] == "tenant_operator":
            last = (p[2], p[3])
    if not last:
        sys.exit("no demo operator credentials found")
    return last


def wait_http(url: str, timeout: float = 60) -> None:
    end = time.time() + timeout
    while time.time() < end:
        try:
            if httpx.get(url, timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    sys.exit(f"timeout waiting for {url}")


def playwright(grep: str, env: dict[str, str]) -> int:
    npx = "npx.cmd" if os.name == "nt" else "npx"
    # Fixed argv (no shell, no user input): runs the repo's own Playwright suite.
    return subprocess.call(  # noqa: S603
        [npx, "playwright", "test", "--grep", grep], cwd=WEB, env=env
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://aegis.162-35-42-114.sslip.io")
    a = ap.parse_args()
    email, pw = creds()
    env = {**os.environ, "AEGIS_E2E_URL": a.url, "AEGIS_E2E_EMAIL": email, "AEGIS_E2E_PASSWORD": pw}
    (ROOT / "docs/judging/evidence/screenshots").mkdir(parents=True, exist_ok=True)

    db = Path(tempfile.mkdtemp()) / "collector.db"
    col = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "aegis_collector.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "9100",
        ],
        cwd=ROOT / "apps/collector",
        env={**os.environ, "AEGIS_COL_DB_PATH": str(db)},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    sim = None
    try:
        wait_http("http://127.0.0.1:9100/healthz")
        sim = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "simulator",
                "--duration",
                "400",
                "--scenario",
                "s5",
                "--scenario-at",
                "70",  # after >= 30 baseline windows, so the AIOps baseline detector can fire
            ],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(25)  # let windows flow and health settle
        rc_live = playwright("@live", env)
    finally:
        if sim:
            sim.terminate()
        col.terminate()
        col.wait(timeout=30)
    print(f"collector stopped at {time.strftime('%H:%M:%S')} - expecting Poor within 35 s")
    rc_off = playwright("@offline", env)
    verdict = {0: "PASS"}
    print(f"RESULT live={verdict.get(rc_live, 'FAIL')} offline={verdict.get(rc_off, 'FAIL')}")
    sys.exit(rc_live or rc_off)


if __name__ == "__main__":
    main()
