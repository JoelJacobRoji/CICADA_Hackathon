"""Phase 4: tenant isolation (API, RLS, WebSocket), residency, operator auth."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from saas_api.db import owner_connection, tenant_connection
from saas_helpers import login, metric, post, security
from sqlalchemy import text
from starlette.websockets import WebSocketDisconnect

pytestmark = pytest.mark.integration


def create_app():
    """Lazy import: importing saas_api.main builds the app, which needs settings.
    At module import time the test DB settings do not exist yet (CI has no .env, K16)."""
    from saas_api.main import create_app as _create_app

    return _create_app()


def _ingest_for(api, who):
    items = [metric(who["collector_id"], i) for i in range(3)] + [security(who["collector_id"])]
    assert post(api, who["region"], who["token"], items).status_code == 200
    return items


def test_cross_tenant_api_isolation(regions, seeded):
    acme, initech = seeded["acme"], seeded["initech"]
    c_acme, c_ini = TestClient(create_app()), TestClient(create_app())
    acme_items = _ingest_for(c_acme, acme)
    _ingest_for(c_ini, initech)
    login(c_acme, acme)
    login(c_ini, initech)

    a_m = c_acme.get("/api/v1/metrics?minutes=60").json()
    i_m = c_ini.get("/api/v1/metrics?minutes=60").json()
    assert {m["collector_id"] for m in a_m} == {"col_acme_01"}
    assert {m["collector_id"] for m in i_m} == {"col_initech_01"}
    assert [c["id"] for c in c_ini.get("/api/v1/collectors").json()] == ["col_initech_01"]
    assert all(
        e["collector_id"] == "col_initech_01" for e in c_ini.get("/api/v1/security-events").json()
    )
    # Initech cannot fetch Acme's receipt even with the exact payload_id (404, no existence leak).
    pid = str(acme_items[0].payload_id)
    assert c_acme.get(f"/api/v1/receipts/{pid}").status_code == 200
    assert c_ini.get(f"/api/v1/receipts/{pid}").status_code == 404
    # token hashes are never returned
    assert "token_hash" not in c_acme.get("/api/v1/collectors").text


def test_rls_blocks_cross_tenant_at_database_level(regions, seeded):
    acme, initech = seeded["acme"], seeded["initech"]
    api = TestClient(create_app())
    _ingest_for(api, acme)
    with tenant_connection("ap-south", initech["tenant"].id) as c:
        assert c.execute(text("SELECT count(*) FROM metric_summaries")).scalar_one() == 0
        assert (
            c.execute(text("SELECT count(*) FROM collectors WHERE id='col_acme_01'")).scalar_one()
            == 0
        )
        # Writing a row for another tenant violates the RLS WITH CHECK policy.
        with pytest.raises(Exception):  # noqa: B017
            c.execute(
                text("INSERT INTO audit_log (tenant_id, actor, action) VALUES (:t,'x','x')"),
                {"t": acme["tenant"].id},
            )


def test_residency_eu_collector_unknown_in_ap_and_data_only_in_eu(regions, seeded):
    g = seeded["globex"]
    api = TestClient(create_app())
    # The EU collector's identity (like its data) exists only in the eu-west database.
    assert post(api, "ap-south", g["token"], [metric(g["collector_id"])]).status_code == 401
    assert post(api, "eu-west", g["token"], [metric(g["collector_id"])]).status_code == 200
    with owner_connection("eu-west") as c:
        assert c.execute(text("SELECT count(*) FROM metric_summaries")).scalar_one() == 1
    with owner_connection("ap-south") as c:
        assert (
            c.execute(
                text("SELECT count(*) FROM metric_summaries WHERE collector_id='col_globex_01'")
            ).scalar_one()
            == 0
        )
        assert c.execute(text("SELECT count(*) FROM tenants WHERE slug='globex'")).scalar_one() == 0
    login(api, g)
    me = api.get("/api/v1/auth/me").json()
    assert me == {"tenant": "globex", "role": "tenant_operator", "region": "eu-west"}
    assert len(api.get("/api/v1/metrics?minutes=60").json()) == 1


def _session(client, who) -> str:
    r = client.post("/api/v1/auth/login", json={"email": who["email"], "password": who["password"]})
    assert r.status_code == 200
    tok = r.cookies.get("aegis_session")
    client.cookies.clear()
    return tok


def test_websocket_streams_only_own_tenant(regions, seeded):
    acme, initech = seeded["acme"], seeded["initech"]
    # One client = one event loop, exactly like a single uvicorn worker.
    with TestClient(create_app()) as c:
        tok_a, tok_i = _session(c, acme), _session(c, initech)
        with (
            c.websocket_connect("/api/v1/ws", headers={"cookie": f"aegis_session={tok_a}"}) as ws_a,
            c.websocket_connect("/api/v1/ws", headers={"cookie": f"aegis_session={tok_i}"}) as ws_i,
        ):
            assert ws_a.receive_json()["tenant"] == "acme"
            assert ws_i.receive_json()["tenant"] == "initech"
            post(c, "ap-south", acme["token"], [metric(acme["collector_id"], 0)])
            msg = ws_a.receive_json()
            assert msg["type"] == "metric_summary" and msg["source_pid"].startswith("src_")
            post(c, "ap-south", initech["token"], [metric(initech["collector_id"], 1)])
            # initech's FIRST event is its own: acme's event was never delivered to it.
            msg_i = ws_i.receive_json()
            assert msg_i["payload_id"] == str(metric(initech["collector_id"], 1).payload_id)


def test_websocket_rejects_unauthenticated_and_foreign_origin(regions, seeded):
    api = TestClient(create_app())
    with pytest.raises(WebSocketDisconnect), api.websocket_connect("/api/v1/ws") as ws:
        ws.receive_json()
    login(api, seeded["acme"])
    with (
        pytest.raises(WebSocketDisconnect),
        api.websocket_connect("/api/v1/ws", headers={"origin": "https://evil.example"}) as ws,
    ):
        ws.receive_json()


def test_login_logout_and_failures(regions, seeded, monkeypatch):
    a = seeded["acme"]
    api = TestClient(create_app())
    assert api.get("/api/v1/metrics").status_code == 401
    bad = api.post(
        "/api/v1/auth/login", json={"email": a["email"], "password": "wrong-password-123"}
    )
    unknown = api.post(
        "/api/v1/auth/login", json={"email": "nobody@x.example", "password": "whatever-123"}
    )
    assert bad.status_code == unknown.status_code == 401
    assert bad.json() == unknown.json()  # no user enumeration
    r = api.post(
        "/api/v1/auth/login", json={"email": a["email"].upper(), "password": a["password"]}
    )
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert api.get("/api/v1/auth/me").json()["tenant"] == "acme"
    api.post("/api/v1/auth/logout")
    assert api.get("/api/v1/auth/me").status_code == 401
    with owner_connection("ap-south") as c:
        actions = [r[0] for r in c.execute(text("SELECT action FROM audit_log ORDER BY id"))]
    assert "login_success" in actions and "collector_registered" in actions


def test_tampered_or_forged_session_rejected(regions, seeded):
    import jwt

    api = TestClient(create_app())
    login(api, seeded["acme"])
    tok = api.cookies.get("aegis_session")
    claims = jwt.decode(tok, options={"verify_signature": False})
    forged = jwt.encode(
        claims | {"tid": str(seeded["initech"]["tenant"].id)}, "attacker-key" * 4, algorithm="HS256"
    )
    api.cookies.set("aegis_session", forged)
    assert api.get("/api/v1/metrics").status_code == 401
    none_alg = jwt.encode(claims, key="", algorithm="none")
    api.cookies.set("aegis_session", none_alg)
    assert api.get("/api/v1/metrics").status_code == 401


def test_login_rate_limited(regions, seeded, monkeypatch):
    from saas_api.auth import operator

    monkeypatch.setattr(operator, "login_limiter", operator.LoginRateLimiter())
    from saas_api import read_api

    monkeypatch.setattr(read_api, "login_limiter", operator.login_limiter)
    monkeypatch.setenv("AEGIS_SAAS_LOGIN_MAX_ATTEMPTS_PER_MINUTE", "3")
    from saas_api.config import get_settings

    get_settings.cache_clear()
    api = TestClient(create_app())
    codes = [
        api.post(
            "/api/v1/auth/login", json={"email": "ops@acme.example", "password": "nope-nope-nope"}
        ).status_code
        for _ in range(5)
    ]
    assert codes == [401, 401, 401, 429, 429]
