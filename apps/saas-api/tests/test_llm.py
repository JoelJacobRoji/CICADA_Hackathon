"""LLM layer: prompt allow-list, canary, grounding, client fallback, region policy. All mocked."""

from __future__ import annotations

import json
import random
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from saas_api.aiops import runtime as aiops
from saas_api.aiops.config import load as load_aiops
from saas_api.aiops.engine import AiopsEngine
from saas_api.config import REPO_CONFIG, get_settings
from saas_api.health.engine import HealthEngine
from saas_api.health.thresholds import load as load_th
from saas_api.llm import client as llm_client
from saas_api.llm.grounding import check
from saas_api.llm.prompt import build_prompt, canary_findings

T0 = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
SRV = "src_" + "d" * 16


@pytest.fixture(autouse=True)
def _fresh_store():
    aiops.reset()  # setup only: teardown would run while `engine` is monkeypatched
    yield


def _incident(region: str = "ap-south"):
    he = HealthEngine(load_th(str(REPO_CONFIG / "health_thresholds.yaml")))
    now = [T0]
    eng = AiopsEngine(
        load_aiops(str(REPO_CONFIG / "aiops.yaml")), he.classify, clock=lambda: now[0]
    )
    r = random.Random(1)
    tenant = uuid.uuid4()
    vals = [r.gauss(35, 2) for _ in range(40)] + [80.0, 81.0, 79.0]
    for i, v in enumerate(vals):
        now[0] = T0 + timedelta(seconds=2 * (i + 1))
        eng.observe_metrics(
            tenant,
            region,
            [
                {
                    "source_pid": SRV,
                    "source_kind": "server",
                    "metric": "cpu_usage",
                    "unit": "percent",
                    "category": "infrastructure",
                    "mean": v,
                    "min": v,
                    "window_end": now[0],
                    "payload_id": uuid.uuid4(),
                    "collector_id": "col_t_01",
                }
            ],
        )
    (inc,) = eng.incidents.values()
    return eng, inc


def _good_response(ev: dict) -> dict:
    t = ev["trigger_signals"][0]
    return {
        "summary": f"CPU on {SRV[:10]} rose to {t['evidence']['observed']} percent, far above its "
        f"baseline median of {t['evidence']['baseline_median']}.",
        "reasoning": ["The robust z-score exceeded the threshold for consecutive windows."],
        "why_these_actions": [
            "BASELINE_CPU_USAGE fits a behaviour change below static thresholds."
        ],
        "verify_next": ["Check for a deploy or batch job at the onset time."],
        "caveats": ["User impact is not yet observed."],
    }


def test_prompt_contains_only_allow_listed_fields():
    _, inc = _incident()
    p = build_prompt(inc.explanation)
    ev = p["evidence"]
    assert set(ev) == {
        "title",
        "status",
        "priority",
        "probable_cause",
        "evidence_strength",
        "uncertainty",
        "correlation",
        "trigger_signals",
        "playbook",
        "affected_entities",
    }
    trig = ev["trigger_signals"][0]
    assert "alert_id" not in trig and "payload_ids" not in trig["evidence"]
    assert "collector_id" not in json.dumps(ev)
    assert canary_findings(p["user"]) == []
    assert SRV in p["user"]


@pytest.mark.parametrize(
    "bad, kind",
    [
        ("password=hunter2", "credential_kv"),
        ("contact alice@example.com", "email"),
        ("from 10.20.30.40", "ipv4"),
        ("AKIAABCDEFGHIJKLMNOP", "aws_key"),
        ("-----BEGIN RSA PRIVATE KEY-----", "private_key"),
    ],
)
def test_canary_blocks_identity_and_secrets(bad, kind):
    assert kind in canary_findings(f"EVIDENCE {bad} end")


def test_grounding_accepts_faithful_response():
    _, inc = _incident()
    ev = build_prompt(inc.explanation)["evidence"]
    g = check(_good_response(ev), ev)
    assert g["ok"], g


@pytest.mark.parametrize(
    "mutate, expect",
    [
        (lambda r: r.update(summary="Host src_ffffffffffffffff is failing."), "unknown source id"),
        (lambda r: r.update(summary="CPU reached 97.3 percent."), "unsupported number"),
        (lambda r: r["reasoning"].append("It started at 04:12."), "unknown time"),
        (lambda r: r["why_these_actions"].append("Run RESTART_DATABASE now."), "unknown code"),
        (lambda r: r.pop("caveats"), "caveats missing"),
    ],
)
def test_grounding_rejects_hallucinations(mutate, expect):
    _, inc = _incident()
    ev = build_prompt(inc.explanation)["evidence"]
    resp = _good_response(ev)
    mutate(resp)
    g = check(resp, ev)
    assert not g["ok"] and any(expect in v for v in g["violations"]), g


def test_grounding_iso_offset_is_not_a_time_but_wrong_times_still_fail():
    """Regression (live Gemini run): '09:02:04+00:00' was flagged as unknown time '00:00'."""
    _, inc = _incident()
    ev = build_prompt(inc.explanation)["evidence"]
    onset = ev["trigger_signals"][0]["onset"][11:19]  # real HH:MM:SS from the evidence
    resp = _good_response(ev)
    resp["reasoning"].append(f"CPU rose starting at {onset}+00:00.")
    assert check(resp, ev)["ok"], check(resp, ev)
    resp["reasoning"].append("It had already started at 08:41:07+00:00.")
    g = check(resp, ev)
    assert not g["ok"] and "unknown time 08:41:07" in g["violations"]


def test_grounding_full_iso_timestamp_checked_as_date_and_time():
    """Regression (2nd live run): '2026-11-20T09:02:04+00:00' was flagged as time '02:04'."""
    _, inc = _incident()
    ev = build_prompt(inc.explanation)["evidence"]
    iso = ev["trigger_signals"][0]["onset"]  # e.g. 2026-11-20T09:01:24+00:00
    resp = _good_response(ev)
    resp["reasoning"].append(f"Alerts began at {iso}.")
    assert check(resp, ev)["ok"], check(resp, ev)
    bad = _good_response(ev)
    bad["reasoning"].append(f"Alerts began at 2025-01-02T{iso[11:19]}+00:00.")
    g = check(bad, ev)
    assert not g["ok"] and "unknown date 2025-01-02" in g["violations"]
    bad = _good_response(ev)
    bad["reasoning"].append(f"Alerts began at {iso[:10]}T23:59:58+00:00.")
    g = check(bad, ev)
    assert not g["ok"] and "unknown time 23:59:58" in g["violations"]


def _mock(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_client_falls_back_on_transient_error_and_never_sends_key_in_url():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        if "primary" in req.url.path:
            return httpx.Response(503)
        body = {"candidates": [{"content": {"parts": [{"text": json.dumps({"summary": "x"})}]}}]}
        return httpx.Response(200, json=body)

    cfg = {"model": "primary", "fallback_model": "backup", "timeout_seconds": 2}
    res = llm_client.explain("test-key", cfg, {"system": "s", "user": "u"}, _mock(handler))
    assert res.status == "ok" and res.model == "backup"
    assert all("test-key" not in str(r.url) for r in seen)
    assert seen[0].headers["x-goog-api-key"] == "test-key"


def test_client_does_not_retry_on_auth_error():
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        return httpx.Response(403)

    res = llm_client.explain(
        "k", {"model": "a", "fallback_model": "b"}, {"system": "s", "user": "u"}, _mock(handler)
    )
    assert res.status == "error" and len(calls) == 1 and "403" in res.error


@pytest.fixture
def with_key(unit_env, monkeypatch):  # unit_env: CI has no .env (K16)
    monkeypatch.setenv("AEGIS_SAAS_GEMINI_API_KEY", "test-key-not-real")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _worker(handler):
    w = aiops.LlmWorker()
    w.http = _mock(handler)
    w.last_call = -1e9
    return w


def test_worker_eu_region_never_calls_llm(with_key, monkeypatch):
    eng, inc = _incident(region="eu-west")
    monkeypatch.setattr(aiops, "engine", lambda: eng)
    called = []
    row = _worker(lambda r: called.append(r) or httpx.Response(500)).process(inc)
    assert row["status"] == "disabled_by_policy" and called == []
    assert row["prompt"] == {"not_sent": True}


def test_worker_without_key_is_disabled(unit_env, monkeypatch):
    eng, inc = _incident()
    monkeypatch.setattr(aiops, "engine", lambda: eng)
    called = []
    row = _worker(lambda r: called.append(r) or httpx.Response(500)).process(inc)
    assert row["status"] == "disabled" and called == []


def test_worker_grounded_response_creates_ai_notification(with_key, monkeypatch):
    eng, inc = _incident()
    monkeypatch.setattr(aiops, "engine", lambda: eng)
    ev = build_prompt(inc.explanation)["evidence"]
    text = json.dumps(_good_response(ev))

    def handler(req):
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})

    row = _worker(handler).process(inc)
    assert row["status"] == "ok" and row["grounding"]["ok"]
    assert row["prompt"]["user"].startswith("EVIDENCE JSON:")
    notes = [n for n in aiops.store._notifications if n["kind"] == "ai_explanation"]  # noqa: SLF001
    assert len(notes) == 1 and notes[0]["collector_id"] == "col_t_01"


def test_worker_ungrounded_response_is_rejected_not_shown(with_key, monkeypatch):
    eng, inc = _incident()
    monkeypatch.setattr(aiops, "engine", lambda: eng)
    bad = {
        "summary": "The database src_ffffffffffffffff crashed at 03:14 with 99.9% load.",
        "reasoning": [],
        "why_these_actions": [],
        "verify_next": [],
        "caveats": [],
    }

    def handler(req):
        return httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(bad)}]}}]}
        )

    row = _worker(handler).process(inc)
    assert row["status"] == "rejected_ungrounded"
    assert not [n for n in aiops.store._notifications if n["kind"] == "ai_explanation"]  # noqa: SLF001
