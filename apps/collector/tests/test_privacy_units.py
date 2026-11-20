"""Unit tests: scrubber, canary, pseudonymiser."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from aegis_collector.egress.canary import EgressBlocked, SecretFingerprints, assert_clean, scan
from aegis_collector.pipeline.pseudonym import pseudonym
from aegis_collector.pipeline.scrubber import scrub_record, scrub_text
from aegis_contracts.outbound import MetricSummary

FAKES = {
    "password": "FAKE_P@ss123",
    "api_key": "FAKE_sk_live_51HxAEGISDEMO00000000",
    "jwt": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGQUtFLWRlbW8tdXNlciJ9.FAKEsignatureAEGIS0000",
    "aws": "AKIAFAKEAEGIS0000000",
    "email": "jane.doe@example.com",
    "ip": "10.20.30.40",
    "gh": "ghp_" + "A" * 36,
}


@pytest.mark.parametrize(
    "text,secret,finding",
    [
        (f"password={FAKES['password']}", FAKES["password"], "credential_kv"),
        (f"pwd: {FAKES['password']}", FAKES["password"], "credential_kv"),
        (f"key {FAKES['api_key']} used", FAKES["api_key"], "api_key"),
        (f"Authorization: Bearer {FAKES['jwt']}", FAKES["jwt"], "jwt"),
        (f"aws={FAKES['aws']}", FAKES["aws"], "aws_access_key"),
        (f"mail {FAKES['email']}", FAKES["email"], "email"),
        (f"from {FAKES['ip']} port 22", FAKES["ip"], "ipv4"),
        (f"token {FAKES['gh']}", FAKES["gh"], "github_token"),
        (
            "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj\n-----END RSA PRIVATE KEY-----",
            "MIIBOgIBAAJBAKj",
            "private_key",
        ),
    ],
)
def test_scrubber_masks_each_secret_type(text, secret, finding):
    masked, findings = scrub_text(text)
    assert secret not in masked
    assert finding in findings


def test_scrubber_leaves_benign_text_and_timestamps():
    text = "service started at 2026-11-20T09:30:00+00:00 version 1.2.3 in 35.5 ms"
    masked, findings = scrub_text(text)
    assert masked == text and findings == []


def test_scrub_record_masks_sensitive_attribute_keys_and_keeps_structure():
    raw = {
        "event_id": "E1",
        "source_id": "SRV_001",
        "event_timestamp": "2026-11-20T09:30:00Z",
        "record_type": "log",
        "message": f"login password={FAKES['password']}",
        "attributes": {"user": "admin", "src_ip": FAKES["ip"], "outcome": "failure"},
        "hostname": "db-prod-1",
    }
    masked_json, findings = scrub_record(raw)
    m = json.loads(masked_json)
    assert m["source_id"] == "SRV_001" and m["event_id"] == "E1"
    assert m["attributes"]["outcome"] == "failure"
    for secret in (FAKES["password"], "admin", FAKES["ip"], "db-prod-1"):
        assert secret not in masked_json
    assert "field:user" in findings and "credential_kv" in findings


def _summary_json() -> str:
    t0 = datetime(2026, 11, 20, 9, 30, tzinfo=UTC)
    return MetricSummary(
        payload_id=uuid.uuid4(),
        collector_id="col_test_01",
        source_pid="src_0123456789abcdef",
        source_kind="server",
        metric="cpu_usage",
        unit="percent",
        category="infrastructure",
        window_start_utc=t0,
        window_end_utc=t0 + timedelta(seconds=2),
        source_timezone="Asia/Kolkata",
        count=3,
        min=1.0,
        max=3.0,
        mean=2.0,
        last=3.0,
        p95=3.0,
        severity="info",
        local_health="Excellent",
        summary_code="OK",
        first_event_ts_utc=t0,
        collector_seq=1,
    ).model_dump_json()


def test_canary_passes_legitimate_outbound_json():
    assert scan(_summary_json()) == []


@pytest.mark.parametrize("name", [k for k in FAKES if k != "password"])
def test_canary_pattern_layer_blocks_recognisable_secrets(name):
    smuggled = _summary_json()[:-1] + f', "x": "{FAKES[name]}"}}'
    with pytest.raises(EgressBlocked):
        assert_clean(smuggled)


def test_bare_password_needs_fingerprint_layer():
    # A context-free password matches no pattern - honest limitation of pattern scanning...
    smuggled = _summary_json()[:-1] + f', "x": "{FAKES["password"]}"}}'
    assert scan(smuggled) == []
    # ...but once the collector has seen it in a local raw record, it can never leave.
    secrets: set[str] = set()
    scrub_record({"message": f"login password={FAKES['password']}"}, secrets)
    fp = SecretFingerprints()
    fp.add_many(secrets)
    assert FAKES["password"] in secrets and len(fp) == 1
    with pytest.raises(EgressBlocked) as exc:
        assert_clean(smuggled, fp)
    assert exc.value.findings == ["known_local_secret"]
    assert scan(_summary_json(), fp) == []  # no false positive on legitimate payloads


def test_fingerprints_hold_hashes_not_plaintext():
    fp = SecretFingerprints()
    fp.add_many([FAKES["password"]])
    assert FAKES["password"] not in repr(fp._d)


def test_pseudonym_stable_secret_dependent_and_well_formed():
    a = pseudonym(b"k1" * 20, "SRV_001")
    assert a == pseudonym(b"k1" * 20, "SRV_001")
    assert a != pseudonym(b"k2" * 20, "SRV_001")
    assert a != pseudonym(b"k1" * 20, "SRV_002")
    assert a.startswith("src_") and len(a) == 20
    int(a[4:], 16)
