"""Grounding validator: the LLM output may only mention facts present in the evidence.

Checks: required sections present and bounded; every source ID (full or the src_xxxxxx short form)
exists in the evidence; every number appears in the evidence (with rounding tolerance) or is a
small count; every clock time appears in the evidence; every RULE/CODE-like token exists in it.
"""

from __future__ import annotations

import json
import re
from typing import Any

SRC = re.compile(r"src_[0-9a-f]{4,16}")
TIME = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
# ISO-8601 UTC offset right after a time/date ("09:02:04+00:00"): not a clock time itself.
OFFSET = re.compile(r"(?<=\d)[+-]\d{2}:\d{2}\b")
# Full ISO datetime ("2026-11-20T09:02:04.5"): split into a date (checked) and a time (checked).
ISO_DT = re.compile(r"\b(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?")
DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}(?![\d-])")  # also matches before 'T' in ISO strings
NUM = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?(?![\w])")
CODE = re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b")
SECTIONS = ("summary", "reasoning", "why_these_actions", "verify_next", "caveats")


def _numbers_in(obj: Any, out: set[float]) -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        out.add(float(obj))
    elif isinstance(obj, str):
        for m in NUM.finditer(obj):
            out.add(float(m.group()))
    elif isinstance(obj, dict):
        for v in obj.values():
            _numbers_in(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _numbers_in(v, out)


def _text(resp: dict[str, Any]) -> str:
    parts: list[str] = []
    for k in SECTIONS:
        v = resp.get(k)
        parts.extend(v if isinstance(v, list) else [v] if isinstance(v, str) else [])
    return "\n".join(str(p) for p in parts)


def check(resp: Any, evidence: dict[str, Any]) -> dict[str, Any]:
    violations: list[str] = []
    if not isinstance(resp, dict):
        return {"ok": False, "violations": ["response is not a JSON object"]}
    for k in SECTIONS:
        v = resp.get(k)
        if k == "summary":
            if not isinstance(v, str) or not v.strip() or len(v) > 900:
                violations.append("summary missing or too long")
        elif (
            not isinstance(v, list)
            or len(v) > 8
            or any(not isinstance(i, str) or len(i) > 400 for i in v)
        ):
            violations.append(f"{k} missing or malformed")
    ev_text = json.dumps(evidence, default=str)
    text = ISO_DT.sub(r"\1 \2", OFFSET.sub("", _text(resp)))
    ev_dates = set(DATE.findall(ev_text))
    for d in DATE.findall(text):
        if d not in ev_dates:
            violations.append(f"unknown date {d}")
    text = DATE.sub(" ", text)

    ids = set(re.findall(r"src_[0-9a-f]{16}", ev_text))
    for m in SRC.findall(text):
        if not any(full.startswith(m) for full in ids):
            violations.append(f"unknown source id {m}")

    ev_times = {t[:5] for t in re.findall(r"T(\d{2}:\d{2}:\d{2})", ev_text)}
    ev_times |= {t for t in re.findall(r"T(\d{2}:\d{2}:\d{2})", ev_text)}
    for t in TIME.findall(text):
        if t not in ev_times and t[:5] not in ev_times:
            violations.append(f"unknown time {t}")

    allowed: set[float] = set()
    _numbers_in(evidence, allowed)
    stripped = SRC.sub(" ", TIME.sub(" ", text))
    for m in NUM.finditer(stripped):
        x = float(m.group())
        if abs(x) <= 10 and x == int(x):
            continue  # small counts ("2 applications", "3 windows") are allowed
        if not any(abs(x - a) <= max(0.051, 0.006 * abs(a)) for a in allowed):
            violations.append(f"unsupported number {m.group()}")

    codes = set(CODE.findall(ev_text))
    for c in set(CODE.findall(text)):
        if c not in codes:
            violations.append(f"unknown code {c}")

    return {"ok": not violations, "violations": sorted(set(violations))[:20]}
