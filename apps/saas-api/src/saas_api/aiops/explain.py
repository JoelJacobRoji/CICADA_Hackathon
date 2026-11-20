"""Explanation payload: everything an operator (or the LLM) may use, and nothing else.

Fields: trigger_signals, detection_methods, correlation, probable_cause, evidence_strength,
priority, uncertainty, recommendations, noise. All IDs are pseudonymous.
"""

from __future__ import annotations

from typing import Any

from .engine import Alert, Incident, short
from .playbook import recommend


def _evidence_strength(inc: Incident, alerts: list[Alert]) -> dict[str, Any]:
    persisted3 = any(a.occurrences >= 3 or a.evidence.get("windows", 0) >= 3 for a in alerts)
    persisted2 = any(a.occurrences >= 2 or a.evidence.get("windows", 0) >= 2 for a in alerts)
    corroborated = len(alerts) >= 2
    rules = sorted({c["rule"] for c in inc.correlation if c["rule"] != "NEW"})
    reasons = [
        f"{'persisted' if persisted3 else 'not yet persisted'} for 3+ windows",
        f"{'corroborated by ' + str(len(alerts)) + ' alerts' if corroborated else 'single signal'}",
    ]
    if rules:
        reasons.append("correlated via " + ", ".join(rules))
    if any(a.family == "BASELINE" for a in alerts):
        n = min(a.evidence.get("history_n", 0) for a in alerts if a.family == "BASELINE")
        reasons.append(f"baseline history {n} windows (minimum 30)")
    if any(a.family == "SECURITY" for a in alerts):
        reasons.append("security finding detected locally by the collector (rule-based)")
    level = (
        "High" if persisted3 and corroborated else "Medium" if persisted2 or corroborated else "Low"
    )
    return {
        "level": level,
        "reasons": reasons,
        "definition": "High = persisted 3+ windows AND corroborated; Medium = persisted 2+ "
        "windows OR corroborated; Low = otherwise. Not a probability.",
    }


def _uncertainty(engine, inc: Incident, alerts: list[Alert], status: str) -> list[str]:
    t = engine.topo(inc.tenant_id)
    out: list[str] = []
    for e in sorted({a.entity_id for a in alerts if a.entity_type == "source"}):
        if not t.known(e):
            out.append(
                f"No dependency data for {short(e)}: "
                "correlation for it is limited to same-source rules"
            )
    if len(alerts) == 1:
        out.append("Single signal so far: no corroborating metric or related source yet")
    if status == "undetermined":
        out.append("Probable cause undetermined: several independent candidates")
    fams = {a.family for a in alerts}
    if fams == {"BASELINE"}:
        out.append(
            "Deviation is statistical and below static thresholds: user impact not yet observed"
        )
    if "SECURITY" in fams:
        out.append(
            "Only counts leave the customer environment: account names and source IPs must be "
            "checked on the collector"
        )
    return out


def build_explanation(
    engine,
    inc: Incident,
    alerts: list[Alert],
    root: str | None,
    basis: str,
    status: str,
    prio: dict[str, float],
) -> dict[str, Any]:
    triggers = [
        {
            "alert_id": str(a.id),
            "entity": a.entity_id,
            "entity_kind": engine.kinds.get((inc.tenant_id, a.entity_id), a.entity_type),
            "metric": a.metric,
            "code": a.code,
            "family": a.family,
            "severity": a.severity,
            "onset": a.onset.isoformat(),
            "occurrences": a.occurrences,
            "status": a.status,
            "evidence": a.evidence,
        }
        for a in sorted(alerts, key=lambda a: a.onset)
    ]
    methods = sorted({a.evidence.get("detection", a.family.lower()) for a in alerts})
    kind_of = lambda e: engine.kinds.get((inc.tenant_id, e), "source")  # noqa: E731
    return {
        "title": inc.title,
        "status": inc.status,
        "trigger_signals": triggers,
        "detection_methods": methods,
        "correlation": inc.correlation,
        "probable_cause": {
            "entity": root,
            "entity_kind": kind_of(root) if root else None,
            "status": status,
            "basis": basis,
        },
        "evidence_strength": _evidence_strength(inc, alerts),
        "priority": {
            "label": inc.priority,
            "score": inc.score,
            "components": prio,
            "note": "ranking heuristic, not a probability",
        },
        "uncertainty": _uncertainty(engine, inc, alerts, status),
        "recommendations": recommend(inc, alerts, kind_of),
        "affected_entities": sorted({a.entity_id for a in alerts}),
    }
