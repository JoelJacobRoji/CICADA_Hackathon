"""Build the LLM prompt from the deterministic explanation - allow-listed fields ONLY.

Anything not explicitly listed here is dropped. Inputs are already pseudonymous metadata; a canary
scan (patterns for credentials, emails, IPs, keys) blocks the prompt if anything slipped through.
"""

from __future__ import annotations

import json
import re
from typing import Any

SYSTEM = (
    "You are a senior site-reliability engineer explaining an incident to an on-call operator. "
    "Use ONLY the facts in the EVIDENCE JSON. Do not invent hosts, IDs, numbers, times, metrics, "
    "causes or tools. Sources are pseudonymous IDs like src_xxxxxxxxxxxxxxxx; refer to them "
    "exactly as given (never guess real names). The probable cause, priority and evidence "
    "strength were computed by deterministic rules: explain them, do not change them. "
    "Recommendations must come "
    "from the PLAYBOOK entries in the evidence; explain why they fit and what to verify first. "
    "If something is uncertain or missing, say so plainly. Be concise and concrete."
)

TRIGGER_FIELDS = (
    "entity",
    "entity_kind",
    "metric",
    "code",
    "family",
    "severity",
    "onset",
    "occurrences",
    "status",
)
EVIDENCE_FIELDS = (
    "observed",
    "unit",
    "threshold",
    "state",
    "windows",
    "detection",
    "baseline_median",
    "baseline_mad",
    "z",
    "z_threshold",
    "history_n",
    "deviation_pct",
    "direction",
    "rise_over_span",
    "span_windows",
    "summary_code",
    "risk_level",
    "failure_count",
    "distinct_user_count",
    "distinct_src_count",
    "seconds_since_heartbeat",
    "seconds_since_data",
)

OUTPUT_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "reasoning": {"type": "ARRAY", "items": {"type": "STRING"}},
        "why_these_actions": {"type": "ARRAY", "items": {"type": "STRING"}},
        "verify_next": {"type": "ARRAY", "items": {"type": "STRING"}},
        "caveats": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["summary", "reasoning", "why_these_actions", "verify_next", "caveats"],
}


def evidence_from_explanation(x: dict[str, Any]) -> dict[str, Any]:
    triggers = []
    for t in x.get("trigger_signals", []):
        item = {k: t[k] for k in TRIGGER_FIELDS if k in t}
        ev = t.get("evidence") or {}
        item["evidence"] = {k: ev[k] for k in EVIDENCE_FIELDS if k in ev and ev[k] is not None}
        triggers.append(item)
    pc = x.get("probable_cause") or {}
    es = x.get("evidence_strength") or {}
    pr = x.get("priority") or {}
    return {
        "title": x.get("title"),
        "status": x.get("status"),
        "priority": {
            "label": pr.get("label"),
            "score": pr.get("score"),
            "components": pr.get("components"),
        },
        "probable_cause": {k: pc.get(k) for k in ("entity", "entity_kind", "status", "basis")},
        "evidence_strength": {"level": es.get("level"), "reasons": es.get("reasons")},
        "uncertainty": list(x.get("uncertainty") or []),
        "correlation": [
            {k: c[k] for k in ("rule", "detail", "path", "hops") if k in c}
            for c in x.get("correlation", [])
        ],
        "trigger_signals": triggers,
        "playbook": [
            {k: r[k] for k in ("id", "title", "steps", "rationale") if k in r}
            for r in x.get("recommendations", [])
        ],
        "affected_entities": list(x.get("affected_entities") or []),
    }


def build_prompt(x: dict[str, Any]) -> dict[str, Any]:
    ev = evidence_from_explanation(x)
    text = (
        "EVIDENCE JSON:\n" + json.dumps(ev, separators=(",", ":"), default=str) + "\n\n"
        "Write: summary (2-3 sentences: what is happening and the most likely cause), reasoning "
        "(3-5 short steps from signals to cause), why_these_actions (one line per playbook entry), "
        "verify_next (2-4 checks that would confirm or rule out the hypothesis), caveats "
        "(uncertainties from the evidence)."
    )
    return {"system": SYSTEM, "user": text, "evidence": ev}


# --- canary: block the prompt if anything credential- or identity-like is present ------------
CANARY = {
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "jwt": re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
    "bearer": re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"),
    "aws_key": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "api_key": re.compile(r"(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}"),
    "credential_kv": re.compile(r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|token)\s*[=:]"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "ipv4": re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"),
}


def canary_findings(text: str) -> list[str]:
    return sorted(k for k, rx in CANARY.items() if rx.search(text))
