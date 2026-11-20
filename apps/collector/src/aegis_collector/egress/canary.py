"""Egress canary: last-line check on the exact outbound JSON before it is queued (fail closed).

Two layers:
1. Pattern scan - high-precision secret patterns (keys, tokens, credentials, emails, IPv4).
2. Fingerprint scan - SHA-256 of every secret VALUE the scrubber found in local raw records is
   kept in a bounded in-memory set. Every string token in the outbound JSON is hashed and
   checked against it. This catches a locally-seen secret even with no recognisable context
   (e.g. a bare password). Plaintext secrets are never retained by this mechanism.

Neither layer is the primary control: outbound contracts have no field that can carry free text.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import OrderedDict
from collections.abc import Iterable, Iterator
from typing import Any

from ..pipeline.scrubber import PATTERNS

_CANARY = {
    "private_key",
    "jwt",
    "bearer_token",
    "aws_access_key",
    "aws_secret_key",
    "api_key",
    "github_token",
    "slack_token",
    "credential_kv",
    "email",
    "ipv4",
}
CANARY_PATTERNS = tuple(p for p in PATTERNS if p.name in _CANARY)
MIN_FINGERPRINT_LEN = 8  # shorter values collide with ordinary vocabulary
_TOKEN_SPLIT = re.compile(r"[\s=:,;\"'&/]+")


def _h(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class SecretFingerprints:
    """Bounded LRU of SHA-256 fingerprints of locally observed secret values."""

    def __init__(self, max_size: int = 20_000):
        self.max_size = max_size
        self._d: OrderedDict[str, None] = OrderedDict()

    def add_many(self, values: Iterable[str]) -> None:
        for v in values:
            if len(v) < MIN_FINGERPRINT_LEN:
                continue
            h = _h(v)
            self._d[h] = None
            self._d.move_to_end(h)
            if len(self._d) > self.max_size:
                self._d.popitem(last=False)

    def __contains__(self, value: str) -> bool:
        return _h(value) in self._d

    def __len__(self) -> int:
        return len(self._d)


class EgressBlocked(Exception):  # noqa: N818 - domain name used in docs/logs
    """Raised when an outbound payload matches a secret. Carries finding names only."""

    def __init__(self, findings: list[str]):
        super().__init__(f"egress blocked by canary: {', '.join(findings)}")
        self.findings = findings


def _strings(obj: Any) -> Iterator[str]:
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield str(k)
            yield from _strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _strings(v)


def scan(payload_json: str, fingerprints: SecretFingerprints | None = None) -> list[str]:
    findings = {p.name for p in CANARY_PATTERNS if p.regex.search(payload_json)}
    if fingerprints is not None and len(fingerprints):
        for s in _strings(json.loads(payload_json)):
            candidates = {s, *(_TOKEN_SPLIT.split(s))}
            if any(c and len(c) >= MIN_FINGERPRINT_LEN and c in fingerprints for c in candidates):
                findings.add("known_local_secret")
                break
    return sorted(findings)


def assert_clean(payload_json: str, fingerprints: SecretFingerprints | None = None) -> None:
    findings = scan(payload_json, fingerprints)
    if findings:
        raise EgressBlocked(findings)
