"""Integration: ingest -> health engine -> API / persistence / WebSocket (local Postgres)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from saas_api.db import owner_connection
from saas_api.health import runtime as health
from saas_helpers import login, metric, post
from sqlalchemy import text

pytestmark = pytest.mark.integration

PID = "src_0123456789abcdef"


def create_app():
    from saas_api.main import create_app as _c

    return _c()


def _windows(collector_id: str, values: list[float], start_offset_s: int = 60):
    base = datetime.now(UTC).replace(microsecond=0) - timedelta(seconds=start_offset_s)
    out = []
    for i, v in enumerate(values):
        ws = base + timedelta(seconds=2 * i)
        out.append(
            metric(
                collector_id,
                i,
                window_start_utc=ws,
                window_end_utc=ws + timedelta(seconds=2),
                first_event_ts_utc=ws,
                min=v,
                max=v,
                mean=v,
                last=v,
                p95=v,
            )
        )
    return out


def test_ingest_drives_health_and_api_explains(regions, seeded):
    a = seeded["acme"]
    api = TestClient(create_app())
    # Two consecutive CPU windows at 90% (> 85 Fair threshold) -> Fair after 2 windows.
    for m in _windows(a["collector_id"], [35, 90, 91]):
        assert post(api, "ap-south", a["token"], [m]).status_code == 200
    login(api, a)
    s = api.get("/api/v1/health/summary").json()
    assert s["tenant"]["state"] == "Fair"
    assert s["counts"]["source"]["Fair"] == 1
    d = api.get(f"/api/v1/health/source/{PID}").json()
    assert d["state"] == "Fair"
    r = next(x for x in d["reasons"] if x["code"] == "CPU_USAGE_FAIR")
    assert r["observed"] == 91 and r["threshold"] == 85
    # History is persisted (write-behind) with UTC timestamps and reasons.
    hist = d["history"]
    assert [h["to_state"] for h in reversed(hist)] == ["Excellent", "Fair"]
    for h in hist:  # UTC (offset zero), whatever the serialised suffix ("Z" or "+00:00")
        assert datetime.fromisoformat(h["at_utc"].replace("Z", "+00:00")).utcoffset() == timedelta(
            0
        )
    with owner_connection("ap-south") as c:
        cur = c.execute(
            text("SELECT state FROM health_current WHERE entity_id=:p"), {"p": PID}
        ).scalar_one()
    assert cur == "Fair"


def test_health_is_tenant_scoped(regions, seeded):
    a, i = seeded["acme"], seeded["initech"]
    api_a, api_i = TestClient(create_app()), TestClient(create_app())
    for m in _windows(a["collector_id"], [35, 96, 97]):
        post(api_a, "ap-south", a["token"], [m])
    login(api_i, i)
    assert api_i.get("/api/v1/health/entities").json() == []
    assert api_i.get(f"/api/v1/health/source/{PID}").status_code == 404
    assert api_i.get("/api/v1/health/transitions").json() == []
    login(api_a, a)
    assert api_a.get(f"/api/v1/health/source/{PID}").json()["state"] == "Poor"


def test_heartbeat_creates_collector_health(regions, seeded):
    from aegis_collector.config import REPO_CONFIG
    from aegis_collector.egress import heartbeat as hb

    a = seeded["acme"]
    api = TestClient(create_app())
    beat = hb.build(
        collector_id=a["collector_id"],
        region="ap-south",
        cfg_hash=hb.config_hash(REPO_CONFIG),
        depth=150,
        oldest_age=0.0,
        adapters={"sender": hb.AdapterStatus.OK},
    )
    assert hb.send(api, a["token"], beat) == 204
    login(api, a)
    c = api.get(f"/api/v1/health/collector/{a['collector_id']}").json()
    assert c["state"] == "Good" and c["reasons"][0]["code"] == "BACKLOG"


def test_websocket_receives_health_transitions(regions, seeded):
    a = seeded["acme"]
    with TestClient(create_app()) as c:
        r = c.post("/api/v1/auth/login", json={"email": a["email"], "password": a["password"]})
        tok = r.cookies.get("aegis_session")
        c.cookies.clear()
        with c.websocket_connect("/api/v1/ws", headers={"cookie": f"aegis_session={tok}"}) as ws:
            ws.receive_json()  # hello
            post(c, "ap-south", a["token"], _windows(a["collector_id"], [35]))
            seen = [ws.receive_json() for _ in range(3)]
    kinds = {(m["type"], m.get("entity_type")) for m in seen}
    assert ("health_transition", "source") in kinds and ("metric_summary", None) in kinds


def test_persisted_state_restored_after_restart(regions, seeded):
    a = seeded["acme"]
    api = TestClient(create_app())
    for m in _windows(a["collector_id"], [35, 96, 97]):
        post(api, "ap-south", a["token"], [m])
    health.writer.flush()
    health.reset()  # simulate API process restart
    health.load_state()
    v = health.engine().get(a["tenant"].id, "source", PID)
    assert v["state"] == "Poor"
    # The collector is known after restart even without new heartbeats (offline detection works).
    assert (a["tenant"].id, "collector", a["collector_id"]) in health.engine().entities
