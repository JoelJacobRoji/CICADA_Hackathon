"""Privacy Glass (M3): raw (local) -> masked -> exact outbound JSON + SHA-256 -> SaaS receipt."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta

import pytest
from aegis_collector.glass import sensitive_values
from fastapi.testclient import TestClient

from simulator.generator import Generator
from simulator.scenarios import FAKE_SECRETS, s1_secret_log, s3_failed_logins

INGEST = {"Authorization": "Bearer " + "c" * 40}
ADMIN = {"Authorization": "Bearer " + "a" * 40}


class FakeReceipts:
    """Stands in for the SaaS: returns the hash it 'computed' for the received bytes."""

    def __init__(self, conn, tamper: bool = False):
        self.conn, self.tamper, self.calls = conn, tamper, []

    def fetch(self, payload_id: str):
        self.calls.append(payload_id)
        (body,) = self.conn.execute(
            "SELECT payload_json FROM egress_ledger WHERE payload_id = ?", (payload_id,)
        ).fetchone()
        sha = hashlib.sha256((body + (" " if self.tamper else "")).encode()).hexdigest()
        return {
            "status": "ok",
            "payload_id": payload_id,
            "kind": "x",
            "payload_sha256": sha,
            "received_at": datetime.now(UTC).isoformat(),
            "region": "ap-south",
        }


@pytest.fixture
def client(col_env):
    from aegis_collector.main import create_app

    with TestClient(create_app()) as c:
        start = datetime.now(UTC) - timedelta(seconds=60)
        gen = Generator(seed=3)
        gen.add_scenario(s1_secret_log(), start + timedelta(seconds=1))
        gen.add_scenario(s3_failed_logins(n=25, span=10), start + timedelta(seconds=2))
        for batch in gen.run_offline(start, 20, 60):
            if batch:
                assert c.post("/api/v1/telemetry", json=batch, headers=INGEST).status_code == 202
        c.app.state.pipeline.flush(force=True)
        yield c


def test_glass_requires_admin_token(client):
    assert client.get("/local/glass").status_code == 401
    assert client.get("/local/glass/leakscan").status_code == 401
    assert client.get("/local/glass", headers=INGEST).status_code == 401


def test_security_payload_four_columns(client):
    v = client.get("/local/glass?kind=security_summary", headers=ADMIN).json()
    assert v["kind"] == "security_summary"
    assert v["local_source_name"] == "SRV_002"

    # Column 1: the raw auth logs, with the username and IP, are shown locally.
    contributing = [r for r in v["raw_records"] if r["contributed"]]
    assert contributing, "no raw auth records matched the payload window"
    raw_text = json.dumps([r["raw"] for r in contributing])
    assert "admin" in raw_text and "10.20.30.40" in raw_text and "SRV_002" in raw_text

    # Column 3: the exact outbound JSON has counts and a pseudonym only.
    out = v["outbound"]["json"]
    for value in ("admin", "10.20.30.40", "SRV_002", "TENANT_01", "Failed password"):
        assert value not in out
    payload = v["outbound"]["payload"]
    assert payload["source_pid"].startswith("src_") and payload["failure_count"] >= 5
    assert v["leak_check"]["found_in_outbound"] == 0
    assert v["leak_check"]["sensitive_values_checked"] >= 4

    # Ledger integrity: recomputed SHA-256 of the stored bytes equals the ledger entry.
    assert v["outbound"]["ledger_hash_ok"] is True
    assert v["outbound"]["recomputed_sha256"] == hashlib.sha256(out.encode()).hexdigest()

    # Column 4 without a collector token: honest "disabled", never a fake match.
    assert v["receipt"]["status"] == "disabled" and v["hash_match"] is False


def test_receipt_match_and_mismatch(client):
    conn = client.app.state.pipeline.conn
    client.app.state.receipts = FakeReceipts(conn)
    v = client.get("/local/glass?kind=metric_summary", headers=ADMIN).json()
    assert v["receipt"]["status"] == "ok" and v["hash_match"] is True
    assert client.app.state.receipts.calls == [v["payload_id"]]
    assert any(r["contributed"] for r in v["raw_records"])

    client.app.state.receipts = FakeReceipts(conn, tamper=True)
    v2 = client.get(f"/local/glass?payload_id={v['payload_id']}", headers=ADMIN).json()
    assert v2["payload_id"] == v["payload_id"] and v2["hash_match"] is False


def test_leak_check_detects_a_planted_leak(client):
    """Negative control: if a raw value WERE in the outbound bytes, the panel would say so."""
    conn = client.app.state.pipeline.conn
    v = client.get("/local/glass?kind=security_summary", headers=ADMIN).json()
    pid = v["payload_id"]
    tampered = v["outbound"]["json"][:-1] + ',"x":"10.20.30.40"}'
    conn.execute("UPDATE egress_ledger SET payload_json = ? WHERE payload_id = ?", (tampered, pid))
    bad = client.get(f"/local/glass?payload_id={pid}", headers=ADMIN).json()
    assert bad["leak_check"]["found_in_outbound"] >= 1
    assert bad["outbound"]["ledger_hash_ok"] is False
    scan = client.get("/local/glass/leakscan", headers=ADMIN).json()
    assert scan["found"] >= 1 and pid in scan["hit_payload_ids"]


def test_leak_scan_clean_with_secret_examples(client):
    s = client.get("/local/glass/leakscan", headers=ADMIN).json()
    assert s["records_with_findings"] >= 1
    assert s["sensitive_values_checked"] >= len(FAKE_SECRETS)
    assert s["payloads_scanned"] == s["payloads_total"] > 0
    assert s["found"] == 0 and s["hits"] == []
    ex = s["examples"][0]
    raw, masked = json.dumps(ex["raw"]), json.dumps(ex["masked"])
    for secret in FAKE_SECRETS.values():
        assert secret in raw and secret not in masked


def test_topology_payload_has_no_raw_records(client):
    client.app.state.pipeline.emit_topology()
    v = client.get("/local/glass?kind=topology_edge", headers=ADMIN).json()
    assert v["raw_records"] == [] and "inventory" in v["note"]


def test_unknown_payload_and_bad_kind(client):
    assert client.get("/local/glass?payload_id=nope", headers=ADMIN).status_code == 404
    assert client.get("/local/glass?kind=raw", headers=ADMIN).status_code == 422


def test_page_is_static_with_strict_csp(client):
    r = client.get("/glass")
    assert r.status_code == 200 and "Privacy Glass" in r.text
    csp = r.headers["content-security-policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert "unsafe-inline" not in csp
    assert "<script>" not in r.text and "style=" not in r.text  # no inline code
    assert r.headers["cache-control"] == "no-store"
    js = client.get("/glass/app.js")
    assert js.status_code == 200 and "innerHTML" not in js.text
    assert client.get("/glass/app.css").status_code == 200
    assert client.get("/glass/secrets.txt").status_code == 404
    assert "10.20.30.40" not in r.text + js.text  # the page itself carries no data


def test_sensitive_values_extraction():
    raw = {
        "source_id": "SRV_001",
        "tenant_id": "TENANT_01",
        "event_id": "SIM_abc",
        "message": "db connect failed user=svc_billing password=FAKE_P@ss123 from 10.20.30.40",
        "attributes": {"user": "svc_billing", "outcome": "error", "src_ip": "10.20.30.40"},
    }
    vals = sensitive_values(raw)
    for v in ("SRV_001", "TENANT_01", "svc_billing", "FAKE_P@ss123", "10.20.30.40"):
        assert v in vals
    assert "error" not in vals and "failed" not in vals
