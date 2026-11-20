"""Verify a live collector -> SaaS run (read-only). Prints no secrets.

Checks: every ledgered payload stored exactly once; SaaS sha256 == collector ledger sha256;
S1 fake secrets / raw identifiers absent from all SaaS tables; operator API is tenant-scoped;
delivery latency (ledger created_at -> SaaS received_at).

Usage: uv run python scripts/verify_e2e.py <collector.db> [--saas http://127.0.0.1:9001] [--json out]
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import httpx
from saas_api.db import owner_connection
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from simulator.scenarios import FAKE_SECRETS  # noqa: E402

TABLES = ("metric_summaries", "security_summaries", "topology_edges")
ALL = (*TABLES, "ingest_receipts", "heartbeats", "audit_log", "collectors", "users")


def pct(v: list[float], p: float) -> float:
    s = sorted(v)
    return s[max(0, math.ceil(p / 100 * len(s)) - 1)] if s else float("nan")


def creds(slug: str) -> tuple[str, str]:
    for line in (
        (ROOT / "apps/saas-api/.demo-operators.local").read_text(encoding="utf-8").splitlines()
    ):
        parts = line.split("\t")
        if len(parts) == 4 and parts[0] == slug and parts[1] == "tenant_operator":
            last = (parts[2], parts[3])
    return last  # most recent entry wins (password resets append)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("db", type=Path)
    ap.add_argument("--saas", default="http://127.0.0.1:9001")
    ap.add_argument("--region", default="ap-south")
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()

    col = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    ledger = {
        pid: (sha, datetime.fromisoformat(created))
        for pid, sha, created in col.execute(
            "SELECT payload_id, sha256, created_at FROM egress_ledger"
        )
    }
    collector_id = json.loads(
        col.execute("SELECT payload_json FROM egress_ledger LIMIT 1").fetchone()[0]
    )["collector_id"]

    saas: dict[str, tuple[str, datetime]] = {}
    dumps: dict[str, str] = {}
    with owner_connection(a.region) as c:
        for t in TABLES:
            for pid, sha, rec in c.execute(
                text(
                    f"SELECT payload_id::text, payload_sha256, received_at FROM {t} WHERE collector_id = :c"
                ),  # noqa: S608
                {"c": collector_id},
            ):
                saas[pid] = (sha, rec)
        for t in ALL:
            dumps[t] = json.dumps(
                [list(r) for r in c.execute(text(f"SELECT * FROM {t}"))], default=str
            )  # noqa: S608

    missing = sorted(set(ledger) - set(saas))
    mismatched = sorted(p for p in ledger if p in saas and saas[p][0] != ledger[p][0])
    lat = [(saas[p][1] - ledger[p][1]).total_seconds() for p in ledger if p in saas]
    needles = [
        *FAKE_SECRETS.values(),
        "SRV_001",
        "SRV_002",
        "svc_billing",
        "Failed password",
        "TENANT_01",
    ]
    leaks = sorted({(t, n) for t, d in dumps.items() for n in needles if n in d})
    leaks += sorted(
        {
            (t, "admin(word)")
            for t, d in dumps.items()
            if t != "users" and re.search(r"(?<![A-Za-z_@.])admin\b(?!@)", d)
        }
    )

    api = {}
    for slug in ("acme", "initech"):
        email, pw = creds(slug)
        with httpx.Client(base_url=a.saas, timeout=30) as h:
            assert (
                h.post("/api/v1/auth/login", json={"email": email, "password": pw}).status_code
                == 200
            )
            m = h.get("/api/v1/metrics", params={"minutes": 30, "limit": 20000}).json()
            cols = h.get("/api/v1/collectors").json()
            sec = h.get("/api/v1/security-events").json()
            api[slug] = {
                "metrics_visible": len(m),
                "collectors_of_others_visible": sorted(
                    {x["collector_id"] for x in m} - {f"col_{slug}_01"}
                ),
                "collectors": [(x["id"], x["connectivity"]) for x in cols],
                "security_events": [
                    (x["summary_code"], x["risk_level"], x["failure_count"]) for x in sec
                ],
            }

    rep = {
        "data_source": "SIMULATED (AEGIS dev simulator), live services, Supabase " + a.region,
        "collector_id": collector_id,
        "ledger_payloads": len(ledger),
        "stored_in_saas": len(saas),
        "missing_in_saas": len(missing),
        "sha256_mismatches": len(mismatched),
        "delivery_latency_ledger_to_saas_s": {
            "n": len(lat),
            "p50": round(pct(lat, 50), 3),
            "p95": round(pct(lat, 95), 3),
            "max": round(max(lat), 3) if lat else None,
        },
        "leaks_in_saas_tables": leaks,
        "operator_api": api,
    }
    print(json.dumps(rep, indent=2))
    if a.json:
        a.json.write_text(json.dumps(rep, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
