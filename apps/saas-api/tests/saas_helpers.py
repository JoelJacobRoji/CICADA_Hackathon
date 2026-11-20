from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

from aegis_contracts.outbound import MetricSummary, SecuritySummary, payload_id_for

T0 = datetime.now(UTC).replace(microsecond=0) - timedelta(seconds=10)


def metric(collector_id: str, i: int = 0, pid: str = "src_0123456789abcdef", **kw) -> MetricSummary:
    ws = T0 + timedelta(seconds=2 * i)
    base = dict(
        payload_id=payload_id_for(collector_id, pid, "cpu_usage", ws),
        collector_id=collector_id,
        source_pid=pid,
        source_kind="server",
        metric="cpu_usage",
        unit="percent",
        category="infrastructure",
        window_start_utc=ws,
        window_end_utc=ws + timedelta(seconds=2),
        source_timezone="Asia/Kolkata",
        count=5,
        min=30.0,
        max=40.0,
        mean=35.0,
        last=36.0,
        p95=39.0,
        severity="info",
        local_health="Excellent",
        summary_code="OK",
        first_event_ts_utc=ws,
        collector_seq=i + 1,
    )
    base.update(kw)
    return MetricSummary(**base)


def security(collector_id: str, pid: str = "src_00000000000000aa") -> SecuritySummary:
    return SecuritySummary(
        payload_id=uuid.uuid4(),
        collector_id=collector_id,
        source_pid=pid,
        window_start_utc=T0,
        window_end_utc=T0 + timedelta(seconds=20),
        source_timezone="UTC",
        collector_seq=999,
        summary_code="AUTH_FAILURE_BURST",
        failure_count=25,
        distinct_user_count=1,
        distinct_src_count=1,
        severity="high",
        local_health="Poor",
        risk_level="high",
    )


def batch_body(items: list) -> str:
    """Exactly how the collector sender builds the body: ledger JSON strings concatenated."""
    parts = [i if isinstance(i, str) else i.model_dump_json() for i in items]
    return (
        '{"batch_id":"'
        + str(uuid.uuid4())
        + '","sent_at_utc":"'
        + datetime.now(UTC).isoformat()
        + '","items":['
        + ",".join(parts)
        + "]}"
    )


def sha(model) -> str:
    return hashlib.sha256(model.model_dump_json().encode()).hexdigest()


def post(api, region: str, token: str, items: list, body: str | None = None):
    return api.post(
        f"/api/v1/ingest/{region}",
        content=(body or batch_body(items)).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )


def login(api, who: dict) -> None:
    r = api.post("/api/v1/auth/login", json={"email": who["email"], "password": who["password"]})
    assert r.status_code == 200, r.text


def jdump(obj) -> str:
    return json.dumps(obj, default=str)
