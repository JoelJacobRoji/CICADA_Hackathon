"""Secret scrubber: produces a MASKED DISPLAY COPY of raw records for the local console.

This is defence in depth, not the primary control. The primary control is that outbound
contracts have no field that can carry free text (packages/contracts/outbound.py).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

SENSITIVE_KEY = re.compile(
    r"(?i)^(pass(word|wd)?|pwd|secret|client[_-]?secret|api[_-]?key|apikey|token|"
    r"access[_-]?token|refresh[_-]?token|access[_-]?key|private[_-]?key|authorization|cookie|"
    r"session|credentials?|user(name)?|login|email|src_ip|ip|ip_address|host(name)?)$"
)


@dataclass(frozen=True)
class Pattern:
    name: str
    regex: re.Pattern[str]
    # Returns the replacement for a match (default: whole match -> [redacted:name]).
    replace: Callable[[re.Match[str]], str] | None = None


def _kv(m: re.Match[str]) -> str:
    return f"{m.group(1)}{m.group(2)}[redacted:{m.group(1).lower()}]"


# Ordered: most specific first.
PATTERNS: tuple[Pattern, ...] = (
    Pattern(
        "private_key",
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    ),
    Pattern("jwt", re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")),
    Pattern("bearer_token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}")),
    Pattern("aws_access_key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    Pattern(
        "aws_secret_key",
        re.compile(r"(?i)aws_secret_access_key\s*[=:]\s*[A-Za-z0-9/+=]{30,}"),
    ),
    Pattern("api_key", re.compile(r"[A-Za-z0-9_]*(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}")),
    Pattern("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    Pattern("slack_token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
    Pattern(
        "credential_kv",
        re.compile(
            r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|apikey|token|access[_-]?key|"
            r"client[_-]?secret|auth)(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;&\"']+)"
        ),
        _kv,
    ),
    Pattern("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    Pattern(
        "ipv4",
        re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b"),
    ),
)


def scrub_text(text: str) -> tuple[str, list[str]]:
    """Mask secrets in free text. Returns (masked_text, sorted unique finding names)."""
    found: set[str] = set()
    out = text
    for p in PATTERNS:

        def _sub(m: re.Match[str], p: Pattern = p) -> str:
            found.add(p.name)
            return p.replace(m) if p.replace else f"[redacted:{p.name}]"

        out = p.regex.sub(_sub, out)
    return out, sorted(found)


def extract_secret_values(text: str) -> set[str]:
    """The concrete secret strings in ``text`` (for local fingerprinting, never stored)."""
    out: set[str] = set()
    for p in PATTERNS:
        for m in p.regex.finditer(text):
            if p.name == "credential_kv":
                out.add(m.group(3).strip("\"'"))
            elif p.name == "bearer_token":
                out.add(m.group(0).split()[-1])
            else:
                out.add(m.group(0))
    return out


def scrub_value(
    key: str | None, value: Any, found: set[str], secrets: set[str] | None = None
) -> Any:
    if isinstance(value, dict):
        return {k: scrub_value(k, v, found, secrets) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub_value(key, v, found, secrets) for v in value]
    if key is not None and SENSITIVE_KEY.match(key) and value not in (None, ""):
        found.add(f"field:{key.lower()}")
        if secrets is not None:
            secrets.add(str(value))
        return f"[redacted:{key.lower()}]"
    if isinstance(value, str):
        masked, names = scrub_text(value)
        found.update(names)
        if names and secrets is not None:
            secrets.update(extract_secret_values(value))
        return masked
    return value


# Fields of the inbound schema that are structural and safe to display as-is.
STRUCTURAL = {
    "event_id",
    "tenant_id",
    "source_id",
    "event_timestamp",
    "source_timezone",
    "record_type",
    "metric",
    "value",
    "unit",
    "category",
    "severity",
    "log_kind",
}


def scrub_record(raw: dict[str, Any], secrets: set[str] | None = None) -> tuple[str, list[str]]:
    """Masked JSON display copy of one raw record + finding names.

    If ``secrets`` is given, the concrete secret values found are added to it so the caller can
    fingerprint them (see egress/canary.py SecretFingerprints).
    """
    found: set[str] = set()
    masked = {
        k: (v if k in STRUCTURAL else scrub_value(k, v, found, secrets)) for k, v in raw.items()
    }
    return json.dumps(masked, ensure_ascii=False, default=str), sorted(found)
