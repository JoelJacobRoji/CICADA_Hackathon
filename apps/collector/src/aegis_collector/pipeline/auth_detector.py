"""Local authentication-failure detection (scenario S3).

Usernames and source IPs are held IN MEMORY ONLY to count distinct values; only counts leave.
"""

from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from aegis_contracts.inbound import LogEvent
from aegis_contracts.outbound import RiskLevel, SecurityCode

from .localconfig import SecurityThresholds

_FAIL = re.compile(
    r"(?i)(failed password|authentication failure|invalid user|login failed|"
    r"failed login|access denied|auth(entication)? failed)"
)
_SUCCESS = re.compile(r"(?i)(accepted (password|publickey)|login succeeded|session opened)")


def classify_outcome(ev: LogEvent) -> str | None:
    outcome = ev.attributes.get("outcome")
    if isinstance(outcome, str) and outcome.lower() in {"failure", "failed", "fail", "denied"}:
        return "failure"
    if isinstance(outcome, str) and outcome.lower() in {"success", "succeeded", "ok"}:
        return "success"
    if _FAIL.search(ev.message):
        return "failure"
    if _SUCCESS.search(ev.message):
        return "success"
    return None


@dataclass(frozen=True)
class SecurityFinding:
    source_id: str
    source_timezone: str
    code: SecurityCode
    risk: RiskLevel
    window_start: datetime
    window_end: datetime
    failure_count: int
    distinct_user_count: int
    distinct_src_count: int


@dataclass
class _SourceState:
    failures: deque[tuple[datetime, str, str]] = field(default_factory=deque)
    reported: dict[SecurityCode, RiskLevel] = field(default_factory=dict)


_RANK = {RiskLevel.LOW: 0, RiskLevel.MEDIUM: 1, RiskLevel.HIGH: 2}


class AuthDetector:
    def __init__(self, cfg: SecurityThresholds):
        self.cfg = cfg
        self._state: dict[str, _SourceState] = {}

    def observe(self, ev: LogEvent) -> list[SecurityFinding]:
        if ev.log_kind != "auth":
            return []
        outcome = classify_outcome(ev)
        if outcome is None:
            return []
        st = self._state.setdefault(ev.source_id, _SourceState())
        ts = ev.event_timestamp
        horizon = ts - timedelta(seconds=self.cfg.auth_window_seconds)
        while st.failures and st.failures[0][0] < horizon:
            st.failures.popleft()
        if not st.failures:
            st.reported.clear()  # quiet period -> future bursts are new findings

        user = str(ev.attributes.get("user") or "")
        src = str(ev.attributes.get("src_ip") or "")
        findings: list[SecurityFinding] = []

        if outcome == "failure":
            st.failures.append((ts, user, src))
            n = len(st.failures)
            users = {u for _, u, _ in st.failures if u}
            if n >= self.cfg.burst_high_failures:
                findings += self._maybe(ev, st, SecurityCode.AUTH_FAILURE_BURST, RiskLevel.HIGH)
            elif n >= self.cfg.burst_medium_failures:
                findings += self._maybe(ev, st, SecurityCode.AUTH_FAILURE_BURST, RiskLevel.MEDIUM)
            if len(users) >= self.cfg.spray_min_users and n >= self.cfg.spray_min_failures:
                findings += self._maybe(ev, st, SecurityCode.AUTH_FAILURE_SPRAY, RiskLevel.HIGH)
        elif len(st.failures) >= self.cfg.success_after_failures_min:
            findings += self._maybe(
                ev, st, SecurityCode.AUTH_SUCCESS_AFTER_FAILURES, RiskLevel.HIGH, force=True
            )
        return findings

    def _maybe(
        self,
        ev: LogEvent,
        st: _SourceState,
        code: SecurityCode,
        risk: RiskLevel,
        force: bool = False,
    ) -> list[SecurityFinding]:
        prev = st.reported.get(code)
        if not force and prev is not None and _RANK[prev] >= _RANK[risk]:
            return []  # already reported at this level or higher (alert-noise reduction)
        st.reported[code] = risk
        first = st.failures[0][0] if st.failures else ev.event_timestamp
        end = max(ev.event_timestamp, first + timedelta(milliseconds=1))
        return [
            SecurityFinding(
                source_id=ev.source_id,
                source_timezone=ev.source_timezone,
                code=code,
                risk=risk,
                window_start=first,
                window_end=end,
                failure_count=len(st.failures),
                distinct_user_count=len({u for _, u, _ in st.failures if u}),
                distinct_src_count=len({s for _, _, s in st.failures if s}),
            )
        ]
