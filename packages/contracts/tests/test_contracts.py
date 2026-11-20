from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from aegis_contracts.inbound import LogEvent, MetricEvent, parse_inbound
from aegis_contracts.outbound import (
    MAX_BATCH_ITEMS,
    IngestBatch,
    MetricSummary,
    SecuritySummary,
    payload_id_for,
)
from pydantic import ValidationError

T0 = datetime(2026, 11, 20, 9, 30, tzinfo=UTC)

TEAM_SAMPLE = {
    "event_id": "EVT_001",
    "tenant_id": "TENANT_01",
    "source_id": "SRV_001",
    "event_timestamp": "2026-11-20T09:30:00Z",
    "source_timezone": "Asia/Kolkata",
    "metric": "cpu_usage",
    "value": 95.0,
    "unit": "percent",
    "category": "infrastructure",
    "severity": "high",
}


def metric_summary(**overrides):
    base = {
        "kind": "metric_summary",
        "payload_id": str(payload_id_for("col_dev_01", "src_0123456789abcdef", "cpu_usage", T0)),
        "collector_id": "col_dev_01",
        "source_pid": "src_0123456789abcdef",
        "source_kind": "server",
        "metric": "cpu_usage",
        "unit": "percent",
        "category": "infrastructure",
        "window_start_utc": T0.isoformat(),
        "window_end_utc": (T0 + timedelta(seconds=2)).isoformat(),
        "source_timezone": "Asia/Kolkata",
        "count": 10,
        "min": 80.0,
        "max": 95.0,
        "mean": 90.0,
        "last": 95.0,
        "p95": 94.5,
        "severity": "high",
        "local_health": "Fair",
        "summary_code": "CPU_HIGH",
        "first_event_ts_utc": T0.isoformat(),
        "collector_seq": 1,
    }
    base.update(overrides)
    return base


# ---------- inbound ----------


def test_team_sample_schema_parses_unchanged():
    rec = parse_inbound(TEAM_SAMPLE)
    assert isinstance(rec, MetricEvent)
    assert rec.event_timestamp.tzinfo is not None
    assert rec.event_timestamp.utcoffset() == timedelta(0)


def test_inbound_offset_timestamp_normalised_to_utc():
    rec = parse_inbound({**TEAM_SAMPLE, "event_timestamp": "2026-11-20T15:00:00+05:30"})
    assert rec.event_timestamp == T0


def test_inbound_naive_timestamp_rejected():
    with pytest.raises(ValidationError):
        parse_inbound({**TEAM_SAMPLE, "event_timestamp": "2026-11-20T09:30:00"})


@pytest.mark.parametrize("tz", ["Mars/Olympus", "../etc/passwd", ""])
def test_inbound_invalid_timezone_rejected(tz):
    with pytest.raises(ValidationError):
        parse_inbound({**TEAM_SAMPLE, "source_timezone": tz})


def test_inbound_metric_unit_mismatch_rejected():
    with pytest.raises(ValidationError):
        parse_inbound({**TEAM_SAMPLE, "unit": "ms"})


def test_inbound_unknown_fields_kept_locally_only():
    rec = parse_inbound({**TEAM_SAMPLE, "hostname": "db-prod-1"})
    assert rec.model_extra == {"hostname": "db-prod-1"}


def test_log_event_parses():
    rec = parse_inbound(
        {
            **{k: v for k, v in TEAM_SAMPLE.items() if k not in {"metric", "value", "unit"}},
            "record_type": "log",
            "category": "security",
            "log_kind": "auth",
            "message": "Failed password for admin from 10.20.30.40 port 52211 ssh2",
            "attributes": {"user": "admin", "src_ip": "10.20.30.40", "outcome": "failure"},
        }
    )
    assert isinstance(rec, LogEvent)


# ---------- outbound allow-list ----------


def test_valid_metric_summary():
    m = MetricSummary.model_validate(metric_summary())
    assert m.kind == "metric_summary"


@pytest.mark.parametrize(
    "field,value",
    [
        ("message", "password=FAKE_P@ss123"),
        ("attributes", {"user": "admin"}),
        ("tenant_id", "TENANT_02"),
        ("source_id", "SRV_001"),
        ("hostname", "db-prod-1"),
    ],
)
def test_outbound_rejects_unknown_or_sensitive_fields(field, value):
    with pytest.raises(ValidationError) as exc:
        MetricSummary.model_validate(metric_summary(**{field: value}))
    assert "extra_forbidden" in str(exc.value)


@pytest.mark.parametrize("pid", ["SRV_001", "src_XYZ", "src_0123456789abcdeF", "src_0123"])
def test_outbound_requires_pseudonymous_source(pid):
    with pytest.raises(ValidationError):
        MetricSummary.model_validate(metric_summary(source_pid=pid))


def test_outbound_summary_code_is_enum_not_free_text():
    with pytest.raises(ValidationError):
        MetricSummary.model_validate(metric_summary(summary_code="user admin pwd FAKE_P@ss123"))


def test_outbound_inconsistent_stats_rejected():
    with pytest.raises(ValidationError):
        MetricSummary.model_validate(metric_summary(mean=99.0))


def test_outbound_window_order_enforced():
    with pytest.raises(ValidationError):
        MetricSummary.model_validate(metric_summary(window_end_utc=T0.isoformat()))


def test_outbound_nan_rejected():
    with pytest.raises(ValidationError):
        MetricSummary.model_validate(metric_summary(last=float("nan")))


def test_security_summary_counts_only():
    s = SecuritySummary.model_validate(
        {
            "payload_id": str(uuid.uuid4()),
            "collector_id": "col_dev_01",
            "source_pid": "src_0123456789abcdef",
            "window_start_utc": T0.isoformat(),
            "window_end_utc": (T0 + timedelta(seconds=60)).isoformat(),
            "source_timezone": "UTC",
            "collector_seq": 2,
            "summary_code": "AUTH_FAILURE_BURST",
            "failure_count": 25,
            "distinct_user_count": 1,
            "distinct_src_count": 1,
            "severity": "high",
            "local_health": "Poor",
            "risk_level": "high",
        }
    )
    dumped = s.model_dump()
    assert "user" not in dumped and "src_ip" not in dumped


# ---------- idempotency + batch ----------


def test_payload_id_deterministic():
    a = payload_id_for("col_dev_01", "src_0123456789abcdef", "cpu_usage", T0)
    b = payload_id_for("col_dev_01", "src_0123456789abcdef", "cpu_usage", T0)
    c = payload_id_for("col_dev_01", "src_0123456789abcdef", "cpu_usage", T0 + timedelta(seconds=2))
    assert a == b and a != c and a.version == 5


def test_batch_limits():
    item = metric_summary()
    ok = IngestBatch.model_validate(
        {"batch_id": str(uuid.uuid4()), "sent_at_utc": T0.isoformat(), "items": [item]}
    )
    assert len(ok.items) == 1
    with pytest.raises(ValidationError):
        IngestBatch.model_validate(
            {"batch_id": str(uuid.uuid4()), "sent_at_utc": T0.isoformat(), "items": []}
        )
    with pytest.raises(ValidationError):
        IngestBatch.model_validate(
            {
                "batch_id": str(uuid.uuid4()),
                "sent_at_utc": T0.isoformat(),
                "items": [item] * (MAX_BATCH_ITEMS + 1),
            }
        )


def test_batch_rejects_unknown_kind():
    with pytest.raises(ValidationError):
        IngestBatch.model_validate(
            {
                "batch_id": str(uuid.uuid4()),
                "sent_at_utc": T0.isoformat(),
                "items": [{"kind": "raw_log", "message": "anything"}],
            }
        )
