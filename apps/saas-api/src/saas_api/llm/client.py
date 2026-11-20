"""Gemini REST client (generateContent, JSON mode). Key from settings; never logged."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

import httpx

from .prompt import OUTPUT_SCHEMA

BASE = "https://generativelanguage.googleapis.com/v1beta/models"


@dataclass
class LlmResult:
    status: str  # ok | error
    model: str | None
    response: dict[str, Any] | None
    latency_ms: int
    error: str | None = None


def _call(
    client: httpx.Client,
    key: str,
    model: str,
    prompt: dict[str, Any],
    max_tokens: int,
    timeout: float,
) -> dict[str, Any]:
    body = {
        "systemInstruction": {"parts": [{"text": prompt["system"]}]},
        "contents": [{"role": "user", "parts": [{"text": prompt["user"]}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
            "responseSchema": OUTPUT_SCHEMA,
        },
    }
    r = client.post(
        f"{BASE}/{model}:generateContent",
        headers={"x-goog-api-key": key},
        json=body,
        timeout=timeout,
    )
    if r.status_code != 200:
        raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def explain(
    key: str, cfg: dict[str, Any], prompt: dict[str, Any], client: httpx.Client | None = None
) -> LlmResult:
    models = [m for m in (cfg.get("model"), cfg.get("fallback_model")) if m]
    timeout = float(cfg.get("timeout_seconds", 20))
    max_tokens = int(cfg.get("max_output_tokens", 900))
    own = client is None
    c = client or httpx.Client()
    t0 = time.perf_counter()
    err = None
    try:
        for m in models:
            try:
                resp = _call(c, key, m, prompt, max_tokens, timeout)
                return LlmResult("ok", m, resp, int((time.perf_counter() - t0) * 1000))
            except httpx.HTTPStatusError as e:
                code = e.response.status_code if e.response is not None else 0
                err = f"{m}: HTTP {code}"
                if code not in (429, 500, 502, 503, 504):
                    break  # not transient: don't try the fallback
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
                err = f"{m}: {type(e).__name__}"
        return LlmResult("error", None, None, int((time.perf_counter() - t0) * 1000), err)
    finally:
        if own:
            c.close()
