"""End-to-end collector tests through the real HTTP ingest endpoint.

S1: raw log with secrets  -> visible locally (raw), masked in console, ABSENT from egress.
S3: repeated failed logins -> counts-only SecuritySummary, no usernames/IPs in egress.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from aegis_contracts.outbound import IngestBatch
from fastapi.testclient import TestClient

from simulator.generator import Generator
from simulator.scenarios import FAKE_SECRETS, s1_secret_log, s3_failed_logins

INGEST = {"Authorization": "Bearer " + "c" * 40}
ADMIN = {"Authorization": "Bearer " + "a" * 40}


@pytest.fixture
def client(col_env):
    from aegis_collector.main import create_app

    with TestClient(create_app()) as c:
        yield c


def _post_offline(client, gen, start, seconds, rate=100):
    for batch in gen.run_offline(start, seconds, rate):
        if batch:
            r = client.post("/api/v1/telemetry", json=batch, headers=INGEST)
            assert r.status_code == 202, r.text


def _egress_text(client) -> str:
    db = client.app.state.pipeline.conn
    ledger = "".join(r[0] for r in db.execute("SELECT payload_json FROM egress_ledger"))
    outbox = "".join(" ".join(map(str, r)) for r in db.execute("SELECT * FROM outbox"))
    return ledger + outbox


def test_s1_secret_stays_local(client, capsys):
    start = datetime.now(UTC) - timedelta(seconds=30)
    gen = Generator(seed=1)
    gen.add_scenario(s1_secret_log(), start + timedelta(seconds=1))
    _post_offline(client, gen, start, 10)
    client.app.state.pipeline.flush(force=True)

    # 1. Raw (local, admin) view contains the original secrets.
    rows = client.get("/local/raw?with_findings=true&limit=10", headers=ADMIN).json()
    assert rows, "S1 log not stored"
    raw = client.get(f"/local/raw/{rows[0]['id']}/reveal", headers=ADMIN).json()
    raw_text = json.dumps(raw)
    for secret in FAKE_SECRETS.values():
        assert secret in raw_text

    # 2. Masked console view hides them.
    masked_text = json.dumps(rows)
    for secret in FAKE_SECRETS.values():
        assert secret not in masked_text

    # 3. Egress (ledger + outbox) contains NONE of them, nor the raw source name.
    egress = _egress_text(client)
    assert egress, "nothing queued"
    for secret in [*FAKE_SECRETS.values(), "svc_billing", "SRV_001", "TENANT_01"]:
        assert secret not in egress, f"{secret!r} leaked into egress"

    # 4. Every queued payload is a valid allow-listed item (the SaaS will revalidate too).
    db = client.app.state.pipeline.conn
    items = [json.loads(r[0]) for r in db.execute("SELECT payload_json FROM egress_ledger")]
    IngestBatch.model_validate(
        {
            "batch_id": "00000000-0000-4000-8000-000000000000",
            "sent_at_utc": datetime.now(UTC).isoformat(),
            "items": items[:500],
        }
    )

    # 5. Collector logs never printed them either.
    out = capsys.readouterr()
    for secret in FAKE_SECRETS.values():
        assert secret not in out.out and secret not in out.err

    # 6. Ledger chain verifies.
    assert client.get("/local/egress/verify", headers=ADMIN).json()["ok"] is True


def test_s3_failed_logins_counts_only(client):
    start = datetime.now(UTC) - timedelta(seconds=60)
    gen = Generator(seed=2)
    gen.add_scenario(s3_failed_logins(), start + timedelta(seconds=1))
    _post_offline(client, gen, start, 25, rate=20)
    rows = client.get("/local/egress?kind=security_summary", headers=ADMIN).json()
    assert rows, "no security summary queued"
    entries = [
        client.get(f"/local/egress/{r['payload_id']}", headers=ADMIN).json()["payload"]
        for r in rows
    ]
    high = [e for e in entries if e["risk_level"] == "high"]
    assert high and high[0]["summary_code"] == "AUTH_FAILURE_BURST"
    assert high[0]["failure_count"] >= 20 and high[0]["distinct_user_count"] == 1
    egress = _egress_text(client)
    for leaked in ("admin", "10.20.30.40", "Failed password", "SRV_002"):
        assert leaked not in egress


def test_pseudonym_lookup_is_local_only_and_consistent(client):
    start = datetime.now(UTC) - timedelta(seconds=30)
    _post_offline(client, Generator(seed=3), start, 5)
    client.app.state.pipeline.flush(force=True)
    e = client.get("/local/egress?kind=metric_summary&limit=1", headers=ADMIN).json()[0]
    payload = client.get(f"/local/egress/{e['payload_id']}", headers=ADMIN).json()["payload"]
    sid = client.get(f"/local/pseudonyms/{payload['source_pid']}", headers=ADMIN).json()[
        "source_id"
    ]
    assert sid.startswith(("SRV_", "NET_", "APP_"))


def test_topology_edges_emitted_once_with_pseudonyms(client):
    rows = client.get("/local/egress?kind=topology_edge&limit=100", headers=ADMIN).json()
    # 10 simulated edges (config/inventory.yaml) + 2 real ones (config/inventory.real.yaml)
    assert len(rows) == 12
    p = client.get(f"/local/egress/{rows[0]['payload_id']}", headers=ADMIN).json()["payload"]
    assert p["from_pid"].startswith("src_") and p["to_pid"].startswith("src_")


def test_same_input_gives_same_payload_ids(tmp_path, pipeline_factory):
    start = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
    batches = list(Generator(seed=9).run_offline(start, 10, 50))
    ids = []
    for name in ("a.db", "b.db"):
        p = pipeline_factory(tmp_path / name)
        for b in batches:
            # strip random event_ids so both runs see identical inputs
            p.process("simulator", b)
        p.flush(force=True)
        ids.append(sorted(r[0] for r in p.conn.execute("SELECT payload_id FROM egress_ledger")))
    assert ids[0] == ids[1] and len(ids[0]) > 50


@pytest.mark.parametrize(
    "path,headers,method",
    [
        ("/local/raw", {}, "get"),
        ("/local/raw", INGEST, "get"),  # ingest token must NOT open the console
        ("/local/egress", {"Authorization": "Bearer wrong"}, "get"),
        ("/api/v1/telemetry", {}, "post"),
        ("/api/v1/telemetry", ADMIN, "post"),  # admin token is not an ingest token
    ],
)
def test_endpoints_require_the_right_token(client, path, headers, method):
    r = getattr(client, method)(path, headers=headers, **({"json": []} if method == "post" else {}))
    assert r.status_code == 401


def test_ingest_limits_and_validation(client):
    too_many = [{"x": 1}] * 1001
    assert client.post("/api/v1/telemetry", json=too_many, headers=INGEST).status_code == 413
    big = "x" * 1_100_000
    r = client.post(
        "/api/v1/telemetry", content=big, headers={**INGEST, "Content-Type": "application/json"}
    )
    assert r.status_code == 413
    r = client.post(
        "/api/v1/telemetry",
        content="{not json",
        headers={**INGEST, "Content-Type": "application/json"},
    )
    assert r.status_code == 400
    r = client.post("/api/v1/telemetry", json=[{"event_id": "bad"}, 5], headers=INGEST)
    assert r.json() == {"accepted": 0, "rejected": 2}


def test_retention_purges_old_raw(pipeline):
    pipeline.process(
        "http_ingest",
        [
            {
                "event_id": "E",
                "source_id": "SRV_001",
                "event_timestamp": "2026-11-20T09:30:00Z",
                "source_timezone": "UTC",
                "metric": "cpu_usage",
                "value": 5,
                "unit": "percent",
                "category": "infrastructure",
            }
        ],
    )
    assert pipeline.purge_raw(24, now=datetime.now(UTC) + timedelta(hours=25)) == 1
    assert pipeline.conn.execute("SELECT count(*) FROM raw_events").fetchone()[0] == 0
