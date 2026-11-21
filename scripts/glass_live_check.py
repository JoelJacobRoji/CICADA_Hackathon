"""Live Privacy Glass check: real collector (apps/collector/.env -> deployed SaaS), scratch DB.

1. Start the collector on 127.0.0.1:9100 with a temporary database.
2. Run the simulator with S1 (secret log) and S3 (failed logins).
3. Ask /local/glass for the latest security, metric and topology payloads; require a SaaS receipt
   whose SHA-256 equals the collector's ledger entry, and 0 sensitive values in the outbound bytes.
4. Run the leak scan over every ledgered payload.

Writes counts and hashes only (no raw records) to docs/judging/evidence/phase8_glass_live.json.
Nothing secret is printed. Usage: uv run python scripts/glass_live_check.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
COL = ROOT / "apps" / "collector"
OUT = ROOT / "docs" / "judging" / "evidence" / "phase8_glass_live.json"
BASE = "http://127.0.0.1:9100"


def env_value(key: str) -> str:
    for line in (COL / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"{key} missing in apps/collector/.env")


def main() -> int:
    admin = {"Authorization": "Bearer " + env_value("AEGIS_COL_LOCAL_ADMIN_TOKEN")}
    tmp = Path(tempfile.mkdtemp(prefix="aegis_glass_"))
    env = {**os.environ, "AEGIS_COL_DB_PATH": str(tmp / "collector.db")}
    py = sys.executable
    col = subprocess.Popen(  # noqa: S603
        [py, "-m", "uvicorn", "aegis_collector.main:app", "--host", "127.0.0.1", "--port", "9100"],
        cwd=COL,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    result: dict = {"run_at_utc": datetime.now(UTC).isoformat(), "data": "SYNTHETIC (simulator)"}
    try:
        for _ in range(40):
            try:
                httpx.get(BASE + "/healthz", timeout=2).raise_for_status()
                break
            except httpx.HTTPError:
                time.sleep(1)
        else:
            raise SystemExit("collector did not start")
        sim = subprocess.run(  # noqa: S603
            [py, "-m", "simulator", "--rate", "40", "--duration", "60"]
            + ["--scenario", "s1@5", "--scenario", "s3@10"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=180,
        )
        result["simulator_tail"] = sim.stdout.strip().splitlines()[-1:]
        time.sleep(15)  # let the sender drain the last windows

        views = {}
        for kind in ("security_summary", "metric_summary", "topology_edge"):
            v = None
            for _ in range(10):
                r = httpx.get(
                    f"{BASE}/local/glass", params={"kind": kind}, headers=admin, timeout=30
                )
                if r.status_code == 200:
                    v = r.json()
                    if v["receipt"]["status"] == "ok":
                        break
                time.sleep(3)
            if v is None:
                views[kind] = {"error": "no payload"}
                continue
            views[kind] = {
                "payload_id": v["payload_id"],
                "outbox_status": v["outbox"]["status"],
                "raw_records_shown": v["raw_records_total"],
                "raw_records_in_payload": sum(1 for x in v["raw_records"] if x["contributed"]),
                "sensitive_values_checked": v["leak_check"]["sensitive_values_checked"],
                "sensitive_values_in_outbound": v["leak_check"]["found_in_outbound"],
                "ledger_hash_ok": v["outbound"]["ledger_hash_ok"],
                "collector_sha256": v["outbound"]["ledger_sha256"],
                "receipt_status": v["receipt"]["status"],
                "saas_sha256": v["receipt"].get("payload_sha256"),
                "saas_received_at": v["receipt"].get("received_at"),
                "hash_match": v["hash_match"],
            }
        scan = httpx.get(f"{BASE}/local/glass/leakscan", headers=admin, timeout=60).json()
        result["views"] = views
        result["leak_scan"] = {
            k: scan[k]
            for k in (
                "records_with_findings",
                "sensitive_values_checked",
                "payloads_scanned",
                "payloads_total",
                "found",
            )
        }
        result["leak_scan"]["example_findings"] = (
            scan["examples"][0]["findings"] if scan["examples"] else []
        )
        ok = (
            all(
                x.get("hash_match") and x.get("sensitive_values_in_outbound") == 0
                for x in views.values()
            )
            and scan["found"] == 0
            and scan["records_with_findings"] > 0
        )
        result["passed"] = ok
    finally:
        col.terminate()
        try:
            col.wait(20)
        except subprocess.TimeoutExpired:
            col.kill()
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
