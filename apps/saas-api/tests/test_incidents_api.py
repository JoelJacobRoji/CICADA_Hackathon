"""Phase 6 integration (local Postgres): incidents API, audited ack, device-notification channel,
tenant isolation of incidents/alerts/notifications (API + RLS)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from saas_api.db import tenant_connection
from saas_helpers import login, post, security
from sqlalchemy import text

pytestmark = pytest.mark.integration


def create_app():
    from saas_api.main import create_app as _create_app

    return _create_app()


def _security_incident(api, who):
    r = post(api, who["region"], who["token"], [security(who["collector_id"])])
    assert r.status_code == 200, r.text


def _auth(who):
    return {"Authorization": f"Bearer {who['token']}"}


def test_security_signal_becomes_incident_with_evidence(regions, seeded):
    acme = seeded["acme"]
    api = TestClient(create_app())
    _security_incident(api, acme)
    login(api, acme)
    incs = api.get("/api/v1/incidents").json()
    assert len(incs) == 1
    inc = incs[0]
    assert inc["status"] == "open" and inc["priority"] in ("P1", "P2")
    assert inc["title"].startswith("Repeated failed logins")
    d = api.get(f"/api/v1/incidents/{inc['id']}").json()
    assert len(d["alerts"]) == 1 and d["alerts"][0]["code"] == "SECURITY_AUTH_FAILURE_BURST"
    x = d["explanation"]
    assert x["recommendations"][0]["evidence"] == [d["alerts"][0]["id"]]
    assert x["evidence_strength"]["level"] in ("Low", "Medium", "High")
    # only counts: no usernames / IPs anywhere in the incident
    assert "@" not in str(d) and "failure_count" in str(d)
    s = api.get("/api/v1/aiops/summary").json()
    assert s["incidents_total"] == 1 and s["alerts_total"] == 1


def test_ack_is_idempotent_and_audited(regions, seeded):
    acme = seeded["acme"]
    api = TestClient(create_app())
    _security_incident(api, acme)
    login(api, acme)
    iid = api.get("/api/v1/incidents").json()[0]["id"]
    assert api.post(f"/api/v1/incidents/{iid}/ack").status_code == 200
    assert api.post(f"/api/v1/incidents/{iid}/ack").status_code == 200
    d = api.get(f"/api/v1/incidents/{iid}").json()
    assert d["acked_at"] and d["acked_by"].startswith("user:")
    with tenant_connection("ap-south", acme["tenant"].id) as c:
        n = c.execute(
            text(
                "SELECT count(*) FROM audit_log WHERE action='incident_acknowledged' AND target=:t"
            ),
            {"t": iid},
        ).scalar_one()
    assert n == 1


def test_device_notification_pull_and_ack(regions, seeded):
    acme = seeded["acme"]
    api = TestClient(create_app())
    _security_incident(api, acme)
    r = api.get("/api/v1/notifications/ap-south", headers=_auth(acme))
    assert r.status_code == 200
    notes = r.json()
    assert len(notes) == 1 and notes[0]["kind"] == "incident"
    p = notes[0]["payload"]
    assert p["title"].startswith("Repeated failed logins")
    assert p["signals"][0]["entity"].startswith("src_")  # pseudonymous: collector re-identifies
    assert p["recommendations"] and p["dashboard_path"].startswith("/incidents/")
    # still pending until acked (at-least-once delivery)
    assert len(api.get("/api/v1/notifications/ap-south", headers=_auth(acme)).json()) == 1
    a = api.post(
        "/api/v1/notifications/ap-south/ack", headers=_auth(acme), json={"ids": [notes[0]["id"]]}
    )
    assert a.json() == {"acked": 1}
    assert api.get("/api/v1/notifications/ap-south", headers=_auth(acme)).json() == []
    login(api, acme)
    stats = api.get("/api/v1/notifications/stats").json()
    assert stats == [{"collector_id": "col_acme_01", "total": 1, "delivered": 1, "acked": 1}]


def test_notifications_and_incidents_are_tenant_isolated(regions, seeded):
    acme, initech = seeded["acme"], seeded["initech"]
    api = TestClient(create_app())
    _security_incident(api, acme)
    acme_note = api.get("/api/v1/notifications/ap-south", headers=_auth(acme)).json()[0]
    # initech's collector sees nothing and cannot ack acme's notification
    assert api.get("/api/v1/notifications/ap-south", headers=_auth(initech)).json() == []
    r = api.post(
        "/api/v1/notifications/ap-south/ack",
        headers=_auth(initech),
        json={"ids": [acme_note["id"]]},
    )
    assert r.json() == {"acked": 0}
    c_ini = TestClient(create_app())
    login(c_ini, initech)
    assert c_ini.get("/api/v1/incidents").json() == []
    iid = acme_note["incident_id"]
    assert c_ini.get(f"/api/v1/incidents/{iid}").status_code == 404
    assert c_ini.post(f"/api/v1/incidents/{iid}/ack").status_code == 404
    with tenant_connection("ap-south", initech["tenant"].id) as c:
        for t in ("incidents", "alerts", "notifications"):
            assert c.execute(text(f"SELECT count(*) FROM {t}")).scalar_one() == 0


def test_collector_token_cannot_read_incidents_and_operator_cannot_pull(regions, seeded):
    acme = seeded["acme"]
    api = TestClient(create_app())
    assert api.get("/api/v1/incidents", headers=_auth(acme)).status_code == 401
    login(api, acme)
    assert api.get("/api/v1/notifications/ap-south").status_code == 401
