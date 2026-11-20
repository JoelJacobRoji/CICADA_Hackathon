"""Deterministic recommendation playbook. Every recommendation cites the alert IDs it is based on.

Recommendations are investigation/response guidance only. Nothing here executes anything; actions
become executable (simulated, approval-gated) only in the Phase 8 Safe Action Simulator.
"""

from __future__ import annotations

from typing import Any

from .engine import Alert, Incident, short


def _rec(
    rid: str, title: str, steps: list[str], rationale: str, alerts: list[Alert]
) -> dict[str, Any]:
    return {
        "id": rid,
        "title": title,
        "steps": steps,
        "rationale": rationale,
        "evidence": [str(a.id) for a in alerts],
    }


def recommend(inc: Incident, alerts: list[Alert], kind_of) -> list[dict[str, Any]]:  # noqa: ANN001
    recs: list[dict[str, Any]] = []
    root = inc.root_entity
    by_family: dict[str, list[Alert]] = {}
    for a in alerts:
        by_family.setdefault(a.family, []).append(a)
    entities = {a.entity_id for a in alerts}

    sec = by_family.get("SECURITY", [])
    if sec:
        a = sec[0]
        ev = a.evidence
        recs.append(
            _rec(
                "SEC_AUTH_REVIEW",
                f"Review authentication activity on {short(a.entity_id)}",
                [
                    "Open the collector's local console for this source: usernames and source IPs are "
                    "kept there and never sent to the SaaS",
                    "Check whether the failures target one account (brute force) or many (spraying)",
                    "If unauthorised, propose a temporary account lockout or source block (approval-gated)",
                ],
                f"{ev.get('failure_count')} failed logins across {ev.get('distinct_user_count')} account(s) "
                f"from {ev.get('distinct_src_count')} origin(s), risk {ev.get('risk_level')}: "
                "a credential-guessing pattern.",
                sec,
            )
        )

    off = by_family.get("OFFLINE", [])
    if off:
        recs.append(
            _rec(
                "COLLECTOR_CONNECTIVITY",
                f"Restore collector {off[0].entity_id} connectivity",
                [
                    "Check the collector host and its outbound HTTPS path to the SaaS",
                    "No data is lost: the collector buffers allow-listed metadata locally and delivers "
                    "it after reconnecting",
                ],
                f"No heartbeat for {off[0].evidence.get('seconds_since_heartbeat')} s.",
                off,
            )
        )

    net_root = root and kind_of(root) == "network_device" and len(entities) > 1
    if net_root:
        root_alerts = [a for a in alerts if a.entity_id == root]
        deps = sorted(entities - {root})
        recs.append(
            _rec(
                "NET_UPSTREAM",
                f"Investigate upstream network device {short(root)} first",
                [
                    f"Check interface errors, utilisation and link state on {short(root)}",
                    "Compare packet loss and latency on its uplinks with the baseline",
                    f"If degradation persists more than 5 minutes, fail over traffic for the "
                    f"{len(deps)} dependent source(s)",
                ],
                f"{short(root)} is upstream of {len(deps)} affected source(s) and alerted first, so "
                "the dependents' symptoms are most likely downstream effects.",
                root_alerts or alerts,
            )
        )

    for a in by_family.get("BASELINE", []):
        if net_root and a.entity_id != root:
            continue
        ev = a.evidence
        has_errors = any(x.metric == "error_rate" for x in alerts)
        recs.append(
            _rec(
                f"BASELINE_{a.metric.upper()}",
                f"Explain the {a.metric.replace('_', ' ')} shift on {short(a.entity_id)}",
                [
                    f"Inspect the top consumers of {a.metric.replace('_', ' ')} on the source around "
                    f"{ev.get('window_end', '')[11:19]} UTC",
                    "Check for deploys, batch jobs or configuration changes at the onset time",
                    "Confirm whether the new level is expected; if so the baseline will adapt in about 5 minutes",
                ],
                f"Observed {ev.get('observed')} against a baseline median of {ev.get('baseline_median')} "
                f"(robust z {ev.get('z')}, {ev.get('windows')} consecutive windows)"
                + (
                    "; no downstream error-rate rise yet, so this is a change in behaviour rather than an "
                    "outage."
                    if not has_errors
                    else "; error rates are also elevated."
                ),
                [a],
            )
        )

    for a in by_family.get("TREND", []):
        ev = a.evidence
        recs.append(
            _rec(
                f"TREND_{a.metric.upper()}",
                f"Act on rising {a.metric.replace('_', ' ')} on {short(a.entity_id)} before it breaches",
                [
                    "Look for congestion, queueing or a degrading link on the path",
                    "Check whether traffic volume grew at the same time",
                ],
                f"Rose about {ev.get('rise_over_span')} over the last {ev.get('span_windows')} windows "
                "(trend detected before the static threshold).",
                [a],
            )
        )

    for a in by_family.get("THRESHOLD", []):
        if net_root and a.entity_id != root:
            continue
        if a.code.endswith("_POOR") and a.metric in ("service_up", "connectivity"):
            title, steps = (
                f"Restore {a.metric.replace('_', ' ')} on {short(a.entity_id)}",
                [
                    "Check the service process / reachability from the collector side",
                    "Verify recent changes on the source",
                ],
            )
        elif a.metric == "disk_usage":
            title, steps = (
                f"Free disk space on {short(a.entity_id)}",
                ["Rotate or compress logs", "Remove temporary files or extend the volume"],
            )
        else:
            title, steps = (
                f"Reduce {a.metric.replace('_', ' ')} on {short(a.entity_id)}",
                [
                    f"Identify what drives {a.metric.replace('_', ' ')} on the source",
                    "Scale or rebalance load if it is sustained",
                ],
            )
        ev = a.evidence
        recs.append(
            _rec(
                f"THRESHOLD_{a.metric.upper()}",
                title,
                steps,
                f"{ev.get('observed')} exceeded the {ev.get('state', '').lower()} threshold "
                f"{ev.get('threshold')} for {ev.get('windows')} window(s).",
                [a],
            )
        )

    nod = by_family.get("NO_DATA", [])
    if nod:
        recs.append(
            _rec(
                "SOURCE_DATA",
                "Check why sources stopped reporting",
                [
                    "Confirm the source is up and its agent/adapter is sending",
                    "Check the collector's adapter status",
                ],
                "No data arrived within the staleness window.",
                nod,
            )
        )

    seen: set[str] = set()
    return [r for r in recs if not (r["id"] in seen or seen.add(r["id"]))]
