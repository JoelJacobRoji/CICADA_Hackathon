"""Device alerts on the collector: pull -> local re-identification -> durable store -> ack ->
local webhook (loopback/private only), retries, idempotency. SaaS and webhook are mocked."""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
from aegis_collector.egress.notifications import (
    NotificationChannel,
    list_local,
    validate_webhook_url,
)


def _note(pid: str, kind: str = "incident") -> dict:
    short = f"src_{pid[4:10]}…"
    return {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "incident_id": str(uuid.uuid4()),
        "incident_version": 1,
        "created_at": "2026-11-20T09:00:00+00:00",
        "payload": {
            "title": f"Baseline deviation on server {short} (cpu_usage)",
            "priority": "P2",
            "status": "open",
            "version": 1,
            "probable_cause": {"entity": pid, "status": "determined", "basis": "single source"},
            "signals": [{"entity": pid, "code": "BASELINE_DEVIATION", "observed": 80.0}],
            "recommendations": [
                {"title": f"Explain the cpu usage shift on {short}", "steps": [], "rationale": "x"}
            ],
        },
    }


class FakeSaas:
    def __init__(self, notes: list[dict]) -> None:
        self.pending = {n["id"]: n for n in notes}
        self.acks: list[list[str]] = []

    def handler(self, req: httpx.Request) -> httpx.Response:
        assert req.headers["Authorization"] == "Bearer tok"
        if req.method == "GET" and req.url.path == "/api/v1/notifications/ap-south":
            return httpx.Response(200, json=list(self.pending.values()))
        if req.method == "POST" and req.url.path == "/api/v1/notifications/ap-south/ack":
            ids = json.loads(req.content)["ids"]
            self.acks.append(ids)
            for i in ids:
                self.pending.pop(i, None)
            return httpx.Response(200, json={"acked": len(ids)})
        return httpx.Response(404)


class Hook:
    def __init__(self, fail_first: int = 0) -> None:
        self.received: list[dict] = []
        self.fail_first = fail_first

    def handler(self, req: httpx.Request) -> httpx.Response:
        if self.fail_first > 0:
            self.fail_first -= 1
            return httpx.Response(503)
        self.received.append(json.loads(req.content))
        return httpx.Response(204)


def _channel(pipeline, saas, hook=None, url="http://127.0.0.1:9200/"):
    return NotificationChannel(
        conn=pipeline.conn,
        lock=pipeline.lock,
        client=httpx.Client(
            base_url="http://saas.test", transport=httpx.MockTransport(saas.handler)
        ),
        region="ap-south",
        token="tok",
        collector_id="col_test_01",
        webhook_url=url if hook else None,
        webhook_client=httpx.Client(transport=httpx.MockTransport(hook.handler)) if hook else None,
    )


def test_reidentifies_locally_stores_acks_and_delivers(pipeline):
    pid = pipeline.pseudo.pid("db-primary-01")
    saas, hook = FakeSaas([_note(pid)]), Hook()
    ch = _channel(pipeline, saas, hook)
    ch.tick()
    assert len(saas.acks) == 1 and not saas.pending
    (got,) = hook.received
    assert got["title"] == "Baseline deviation on server db-primary-01 (cpu_usage)"
    assert got["probable_cause"]["entity"] == "db-primary-01"
    assert got["signals"][0]["entity"] == "db-primary-01"
    assert got["recommendations"][0]["title"].endswith("db-primary-01")
    assert got["aegis_notification"]["collector_id"] == "col_test_01"
    # the stored SaaS copy stays pseudonymous (proof of what actually crossed the boundary)
    row = pipeline.conn.execute("SELECT saas_payload, webhook_status FROM notifications").fetchone()
    assert "db-primary-01" not in row[0] and pid in row[0] and row[1] == "delivered"
    items = list_local(pipeline.conn, pipeline.lock, 10)
    assert items[0]["payload"]["title"].endswith("(cpu_usage)") and "db-primary-01" in str(items)


def test_unknown_pseudonym_stays_pseudonymous(pipeline):
    pid = "src_" + "f" * 16
    saas, hook = FakeSaas([_note(pid)]), Hook()
    _channel(pipeline, saas, hook).tick()
    assert hook.received[0]["probable_cause"]["entity"] == pid


def test_redelivery_is_idempotent(pipeline):
    pid = pipeline.pseudo.pid("web-01")
    n = _note(pid)
    saas, hook = FakeSaas([n]), Hook()
    ch = _channel(pipeline, saas, hook)
    ch.poll()
    saas.pending[n["id"]] = n  # SaaS re-sends (e.g. ack lost)
    ch.tick()
    assert pipeline.conn.execute("SELECT count(*) FROM notifications").fetchone()[0] == 1
    assert len(hook.received) == 1


def test_webhook_failure_retries_with_backoff(pipeline):
    pid = pipeline.pseudo.pid("web-01")
    saas, hook = FakeSaas([_note(pid)]), Hook(fail_first=1)
    ch = _channel(pipeline, saas, hook)
    ch.tick()
    row = pipeline.conn.execute(
        "SELECT webhook_status, webhook_attempts, webhook_error FROM notifications"
    ).fetchone()
    assert tuple(row) == ("pending", 1, "HTTP 503")
    assert len(saas.acks) == 1  # SaaS ack does not depend on the local webhook
    pipeline.conn.execute("UPDATE notifications SET webhook_next_at = '2000-01-01T00:00:00+00:00'")
    ch.deliver()
    assert len(hook.received) == 1
    assert (
        pipeline.conn.execute("SELECT webhook_status FROM notifications").fetchone()[0]
        == "delivered"
    )


def test_no_webhook_configured_still_stores_locally(pipeline):
    pid = pipeline.pseudo.pid("web-01")
    saas = FakeSaas([_note(pid)])
    _channel(pipeline, saas).tick()
    assert (
        pipeline.conn.execute("SELECT webhook_status FROM notifications").fetchone()[0]
        == "disabled"
    )


def test_saas_unreachable_is_harmless(pipeline):
    def down(req):
        raise httpx.ConnectError("down")

    ch = NotificationChannel(
        conn=pipeline.conn,
        lock=pipeline.lock,
        client=httpx.Client(base_url="http://saas.test", transport=httpx.MockTransport(down)),
        region="ap-south",
        token="tok",
        collector_id="col_test_01",
        webhook_url=None,
    )
    assert ch.poll() == 0 and ch.last_error == "ConnectError"


def test_closed_channel_does_not_touch_db(pipeline):
    pid = pipeline.pseudo.pid("web-01")
    saas = FakeSaas([_note(pid)])
    ch = _channel(pipeline, saas)
    ch.close()
    assert ch.poll() == 0 and saas.acks == []  # not acked -> SaaS re-delivers after restart


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:9200/",
        "http://localhost:9200/hook",
        "http://10.0.0.5/x",
        "https://192.168.1.20:8443/",
        "http://[::1]:9/",
    ],
)
def test_webhook_allows_local_targets(url):
    assert validate_webhook_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "http://8.8.8.8/",
        "https://hooks.example.com/x",
        "ftp://127.0.0.1/",
        "http://169.254.169.254/latest",
        "127.0.0.1:9200",
    ],
)
def test_webhook_rejects_external_or_odd_targets(url):
    with pytest.raises(ValueError):
        validate_webhook_url(url)


def test_settings_reject_external_webhook(col_env, monkeypatch):
    from aegis_collector.config import get_settings

    monkeypatch.setenv("AEGIS_COL_NOTIFY_WEBHOOK_URL", "https://hooks.example.com/x")
    get_settings.cache_clear()
    with pytest.raises(ValueError):
        get_settings()
