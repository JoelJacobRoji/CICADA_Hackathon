"""Phase 4: authenticated, re-validated, idempotent, tenant-bound ingest."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from saas_api import admin as adm
from saas_api.db import owner_connection
from saas_helpers import T0, batch_body, metric, post, security, sha
from sqlalchemy import text

pytestmark = pytest.mark.integration


def test_valid_batch_accepted_and_hash_matches(api, seeded):
    a = seeded["acme"]
    items = [metric(a["collector_id"], i) for i in range(3)] + [security(a["collector_id"])]
    r = post(api, "ap-south", a["token"], items)
    assert r.status_code == 200, r.text
    ack = r.json()
    assert len(ack["accepted"]) == 4 and ack["duplicate"] == [] and ack["rejected"] == []
    with owner_connection("ap-south") as c:
        stored = dict(
            c.execute(text("SELECT payload_id::text, payload_sha256 FROM metric_summaries")).all()
        )
        tid = c.execute(text("SELECT DISTINCT tenant_id FROM metric_summaries")).scalar_one()
    assert tid == a["tenant"].id  # bound to the TOKEN's tenant
    for m in items[:3]:
        assert stored[str(m.payload_id)] == sha(m)  # SaaS hash == collector ledger hash


def test_replay_is_idempotent(api, seeded):
    a = seeded["acme"]
    items = [metric(a["collector_id"], i) for i in range(5)]
    body = batch_body(items)
    first = post(api, "ap-south", a["token"], [], body=body).json()
    second = post(api, "ap-south", a["token"], [], body=body).json()
    assert len(first["accepted"]) == 5
    assert second["accepted"] == [] and len(second["duplicate"]) == 5
    with owner_connection("ap-south") as c:
        assert c.execute(text("SELECT count(*) FROM metric_summaries")).scalar_one() == 5
        receipts = c.execute(
            text("SELECT accepted, duplicate FROM ingest_receipts ORDER BY id")
        ).all()
    assert [tuple(r) for r in receipts] == [(5, 0), (0, 5)]


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer " + "x" * 43}, {"Authorization": "Basic abc"}],
)
def test_bad_or_missing_token_401(api, seeded, headers):
    r = api.post(
        "/api/v1/ingest/ap-south", content=batch_body([metric("col_acme_01")]), headers=headers
    )
    assert r.status_code == 401


def test_revoked_token_401(api, seeded):
    a = seeded["acme"]
    adm.revoke_collector(a["collector_id"])
    assert post(api, "ap-south", a["token"], [metric(a["collector_id"])]).status_code == 401


def test_unknown_region_404(api, seeded):
    a = seeded["acme"]
    assert post(api, "us-east", a["token"], [metric(a["collector_id"])]).status_code == 404


def test_collector_mismatch_rejected(api, seeded):
    a = seeded["acme"]
    spoof = metric("col_initech_01")  # acme's token claiming to be initech's collector
    ack = post(api, "ap-south", a["token"], [spoof]).json()
    assert ack["accepted"] == [] and ack["rejected"][0]["reason"] == "COLLECTOR_MISMATCH"


def test_schema_revalidation_rejects_raw_and_extra_fields(api, seeded):
    a = seeded["acme"]
    good = metric(a["collector_id"])
    smuggled = json.loads(good.model_dump_json()) | {"message": "password=FAKE_P@ss123"}
    raw_log = {
        "event_id": "E1",
        "source_id": "SRV_001",
        "record_type": "log",
        "message": "Failed password for admin",
        "event_timestamp": "2026-11-20T09:30:00Z",
    }
    other_kind = {"kind": "raw_log", "message": "x"}
    body = batch_body([json.dumps(smuggled), json.dumps(raw_log), json.dumps(other_kind)])
    ack = post(api, "ap-south", a["token"], [], body=body).json()
    assert ack["accepted"] == []
    assert [x["reason"] for x in ack["rejected"]] == ["SCHEMA_INVALID"] * 3
    with owner_connection("ap-south") as c:
        dump = json.dumps(
            [list(r) for r in c.execute(text("SELECT * FROM metric_summaries")).all()], default=str
        )
    assert "FAKE_P@ss123" not in dump and "Failed password" not in dump


def test_envelope_and_size_limits(api, seeded):
    a = seeded["acme"]
    h = {"Authorization": f"Bearer {a['token']}", "Content-Type": "application/json"}
    assert api.post("/api/v1/ingest/ap-south", content=b"{not json", headers=h).status_code == 422
    big = (
        b'{"batch_id":"' + str(uuid.uuid4()).encode() + b'","items":["' + b"x" * 1_100_000 + b'"]}'
    )
    assert api.post("/api/v1/ingest/ap-south", content=big, headers=h).status_code == 413
    too_many = batch_body([metric(a["collector_id"], i) for i in range(501)])
    assert (
        api.post("/api/v1/ingest/ap-south", content=too_many.encode(), headers=h).status_code == 422
    )


def test_late_flag_and_event_time_order(api, seeded):
    a = seeded["acme"]
    old = metric(
        a["collector_id"],
        0,
        window_start_utc=T0 - timedelta(minutes=5),
        window_end_utc=T0 - timedelta(minutes=5) + timedelta(seconds=2),
        first_event_ts_utc=T0 - timedelta(minutes=5),
    )
    now_ws = datetime.now(UTC).replace(microsecond=0) - timedelta(seconds=4)
    new = metric(
        a["collector_id"],
        1,
        window_start_utc=now_ws,
        window_end_utc=now_ws + timedelta(seconds=2),
        first_event_ts_utc=now_ws,
    )
    post(api, "ap-south", a["token"], [new])
    post(api, "ap-south", a["token"], [old])  # arrives AFTER the newer window
    with owner_connection("ap-south") as c:
        rows = c.execute(
            text("SELECT payload_id, late FROM metric_summaries ORDER BY window_end")
        ).all()
    assert [r[0] for r in rows] == [old.payload_id, new.payload_id]
    assert [r[1] for r in rows] == [True, False]


def test_heartbeat_updates_fleet_record(api, seeded):
    a = seeded["acme"]
    hb = {
        "kind": "heartbeat",
        "schema_version": 1,
        "collector_id": a["collector_id"],
        "sent_at_utc": datetime.now(UTC).isoformat(),
        "collector_version": "0.1.0",
        "uptime_s": 12.5,
        "cpu_percent": 3.2,
        "memory_mb": 88.0,
        "outbox_depth": 7,
        "oldest_pending_age_s": 1.5,
        "config_hash": "a" * 64,
        "adapters": [{"name": "sender", "status": "ok"}],
        "region": "ap-south",
    }
    h = {"Authorization": f"Bearer {a['token']}", "Content-Type": "application/json"}
    assert (
        api.post("/api/v1/heartbeat/ap-south", content=json.dumps(hb), headers=h).status_code == 204
    )
    wrong = hb | {"collector_id": "col_initech_01"}
    assert (
        api.post("/api/v1/heartbeat/ap-south", content=json.dumps(wrong), headers=h).status_code
        == 403
    )
    with owner_connection("ap-south") as c:
        row = c.execute(
            text(
                "SELECT outbox_depth, collector_version, last_seen_at FROM collectors WHERE id=:i"
            ),
            {"i": a["collector_id"]},
        ).one()
    assert row[0] == 7 and row[1] == "0.1.0" and row[2] is not None


def test_no_route_accepts_raw_inbound_records(api):
    paths = {getattr(r, "path", "") for r in api.app.routes}
    assert not any(
        "telemetry" in p for p in paths
    )  # the raw-ingest path exists ONLY on the collector
    post_routes = [r for r in api.app.routes if "POST" in getattr(r, "methods", set())]
    for r in post_routes:
        for p in r.dependant.body_params:
            assert "MetricEvent" not in repr(p.type_) and "LogEvent" not in repr(p.type_)
