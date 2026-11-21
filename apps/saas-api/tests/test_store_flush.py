"""K36: the AIOps write-behind store persists in batches (not one round trip per row), never lets
a stale snapshot overwrite a newer one, and still re-queues everything if a write fails."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from saas_api.aiops import runtime
from saas_api.aiops.engine import Alert, Change, Incident
from saas_api.db import tenant_connection
from sqlalchemy import event, text
from sqlalchemy.engine import Engine

pytestmark = pytest.mark.integration


def _incident(tenant: uuid.UUID, version: int = 1, title: str = "t") -> Incident:
    now = datetime.now(UTC)
    return Incident(
        id=uuid.uuid4(),
        tenant_id=tenant,
        region="ap-south",
        opened_at=now,
        updated_at=now,
        version=version,
        priority="P2",
        score=9.0,
        title=title,
        explanation={"title": title},
    )


def _alert(tenant: uuid.UUID, inc: Incident, last_seen: datetime) -> Alert:
    return Alert(
        id=uuid.uuid4(),
        tenant_id=tenant,
        region="ap-south",
        entity_type="source",
        entity_id="src_0123456789abcdef",
        collector_id=None,
        metric="cpu_usage",
        family="BASELINE",
        code="BASELINE_DEVIATION",
        severity="medium",
        category="infrastructure",
        onset=last_seen,
        first_seen=last_seen,
        last_seen=last_seen,
        last_true=last_seen,
        incident_id=inc.id,
        evidence={"z": 6.2},
    )


class _InsertCounter:
    def __init__(self) -> None:
        self.n = 0

    def __call__(self, conn, cursor, statement, params, context, executemany) -> None:  # noqa: ANN001
        if statement.lstrip().upper().startswith("INSERT"):
            self.n += 1


def test_600_alerts_flush_in_a_few_statements(regions, seeded):
    tenant = seeded["acme"]["tenant"].id
    store = runtime.Store()
    inc = _incident(tenant)
    t0 = datetime.now(UTC)
    alerts = [_alert(tenant, inc, t0 + timedelta(seconds=i)) for i in range(600)]
    store.enqueue([Change(kind="opened", incident=inc, alerts=alerts)])

    counter = _InsertCounter()
    event.listen(Engine, "before_cursor_execute", counter)
    try:
        written = store.flush()
    finally:
        event.remove(Engine, "before_cursor_execute", counter)

    assert written >= 601
    # 1 incident statement + 2 alert chunks (500 + 100); before K36 this was 601 statements.
    assert counter.n <= 4, counter.n
    with tenant_connection("ap-south", tenant) as c:
        assert (
            c.execute(
                text("SELECT count(*) FROM alerts WHERE incident_id = :i"), {"i": inc.id}
            ).scalar_one()
            == 600
        )
    assert store.flush() == 0  # nothing left pending


def test_stale_snapshot_never_overwrites_newer(regions, seeded):
    tenant = seeded["acme"]["tenant"].id
    store = runtime.Store()
    inc = _incident(tenant, version=5, title="newer")
    t0 = datetime.now(UTC)
    a = _alert(tenant, inc, t0 + timedelta(seconds=30))
    store.enqueue([Change(kind="updated", incident=inc, alerts=[a])])
    store.flush()

    # An older snapshot of the same incident and alert arrives late (e.g. a slower flush).
    old_inc = Incident(**{**inc.__dict__, "version": 3, "title": "older"})
    old_alert = Alert(**{**a.__dict__, "last_seen": t0, "occurrences": 1, "evidence": {"z": 1.0}})
    store.enqueue([Change(kind="updated", incident=old_inc, alerts=[old_alert])])
    store.flush()

    with tenant_connection("ap-south", tenant) as c:
        row = c.execute(
            text("SELECT version, title FROM incidents WHERE id = :i"), {"i": inc.id}
        ).one()
        assert (row.version, row.title) == (5, "newer")
        ev = c.execute(text("SELECT evidence FROM alerts WHERE id = :i"), {"i": a.id}).scalar_one()
        assert ev == {"z": 6.2}

    # A genuinely newer snapshot still wins.
    newest = Incident(**{**inc.__dict__, "version": 6, "title": "newest"})
    store.enqueue([Change(kind="updated", incident=newest, alerts=[])])
    store.flush()
    with tenant_connection("ap-south", tenant) as c:
        assert (
            c.execute(text("SELECT title FROM incidents WHERE id = :i"), {"i": inc.id}).scalar_one()
            == "newest"
        )


def test_failed_write_requeues_everything(regions, seeded, monkeypatch):
    tenant = seeded["acme"]["tenant"].id
    store = runtime.Store()
    inc = _incident(tenant)
    alerts = [_alert(tenant, inc, datetime.now(UTC)) for _ in range(3)]
    store.enqueue([Change(kind="opened", incident=inc, alerts=alerts)])

    def boom(*_a, **_k):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(runtime, "_write_group", boom)
    assert store.flush() == 0
    monkeypatch.undo()
    assert store.flush() >= 4  # the same incident + 3 alerts, written on the next attempt
    with tenant_connection("ap-south", tenant) as c:
        assert (
            c.execute(
                text("SELECT count(*) FROM alerts WHERE incident_id = :i"), {"i": inc.id}
            ).scalar_one()
            == 3
        )
