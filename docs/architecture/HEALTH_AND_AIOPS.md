# AEGIS — Health Engine and AIOps Design

## 1. Four health states (product states, not judging phases)
**Excellent · Good · Fair · Poor.** They are evaluated per **source** (by source_pid), per **collector**, and rolled up per **tenant**.

### 1.1 Default thresholds (`config/health_thresholds.yaml`, editable in Settings)

| Signal | Good if > | Fair if > | Poor if > |
|---|---|---|---|
| cpu_usage % | 70 | 85 | 95 |
| memory_usage % | 75 | 88 | 95 |
| disk_usage % | 80 | 90 | 95 |
| latency_ms | 100 | 250 | 500 |
| packet_loss % | 0.5 | 2 | 10 |
| error_rate % | 1 | 5 | 15 |
| service_up / connectivity | — | — | value 0 → Poor |
| Anomaly (robust z) | \|z\| ≥ 3.5 → Good | \|z\| ≥ 5 or anomaly persists ≥ 3 windows → Fair | — (anomaly alone never makes Poor) |
| Security summary | — | risk_level medium | risk_level high |

### 1.2 Precedence and hysteresis
- A source's state = **worst** factor across its signals. Ties list all factors as reasons.
- **Degrade:** applied when the condition holds for 2 consecutive windows (4 s). Poor-level critical conditions (service down, connectivity 0, high security risk) degrade **immediately**.
- **Recover:** one level at a time, after 5 consecutive windows (10 s) better than the current state. This prevents flapping.
- **Collector state:** Excellent when the heartbeat is fresh, outbox depth < 100 and no adapter is in error. Good when outbox depth is ≥ 100 or one adapter is degraded. Fair when heartbeat age > 20 s or the oldest pending item is > 30 s old. **Poor when heartbeat age > 30 s** (= offline). The checker runs every 5 s, so worst-case detection is 35 s, inside the 60 s target.

### 1.3 Stale / missing data
Expected cadence = one window (2 s).
- No data for > 10 s → state is at least **Fair**, reason `STALE_DATA`.
- > 30 s → **Poor**, reason `NO_DATA`.

The last value is shown greyed with an "as of" timestamp, never as current.

### 1.4 Transition record
`health_transitions(tenant_id, entity_type, entity_id, from_state, to_state, at_utc, reasons jsonb)`. Example `reasons`:
`[{"code":"LATENCY_FAIR","metric":"latency_ms","observed":312,"threshold":250,"windows":2}]`.

## 2. Anomaly detection (beyond static thresholds)

| Technique | Detail | Why |
|---|---|---|
| Robust z-score | z = 0.6745·(x − median)/MAD over a rolling 150-window history (5 min) per source+metric | robust to outliers; Iglewicz–Hoaglin cutoff 3.5 |
| Minimum history | no anomaly verdict until 30 windows (60 s). Status `BASELINE_LEARNING` is shown. | avoids false anomalies on cold start |
| MAD floor | MAD := max(MAD, metric floor), e.g. cpu 1.0 %, latency 2 ms | flat signals would otherwise give infinite z |
| Trend | slope of the last 15 windows via least squares; `LATENCY_RISING` if slope × 30 s > 50 % of median | catches ramps before thresholds |
| Rate of change | \|Δ\| between windows > 4·MAD | step changes |
| Repetition | same alert code ≥ 3 times in 5 min → merged with an occurrence count | noise reduction |
| Missing data | §1.3 | |

**Normal spike vs anomaly (judge Q):** a single-window spike (z ≥ 3.5 in one window, not persisting) is recorded as `TRANSIENT`, with no alert. An alert requires persistence (≥ 2 windows) **or** corroboration from another signal on the same or a related source.

## 3. Local security detection (collector)
Sliding 60 s window per source:
- `AUTH_FAILURE_BURST`: ≥ 5 failures. Risk medium; high at ≥ 20.
- `AUTH_FAILURE_SPRAY`: ≥ 3 distinct users from ≥ 1 src. Risk high.
- `AUTH_SUCCESS_AFTER_FAILURES`: a success after ≥ 5 failures. Risk high.

Only counts and codes leave (METADATA_SCHEMA §2.2).

## 4. Correlation (deterministic rules, applied in order)

| Rule | Condition | Evidence recorded |
|---|---|---|
| C-DUP | same source_pid + metric + summary_code, open alert exists | occurrence count++ (not a new alert) |
| C-SRC | alerts on the same source_pid within 5 min | `shared_source` |
| C-TOPO | alerts on sources connected by a `TopologyEdge` (≤ 2 hops) within 5 min | `dependency_path: [pid → pid]` |
| C-SITE | ≥ 3 network-category alerts from the same collector within 2 min | `common_collector_network` |

Alerts that match no rule open a new incident. **No correlation by time alone.**

**Root-cause hypothesis:** among the incident's sources, the most-upstream node in the dependency graph whose first alert came earliest. If there's a tie or no topology, it is labelled "undetermined", with candidates listed.

**Noise-reduction metric:** `raw_alert_count / incident_count`, shown per tenant.

## 5. Prioritisation (heuristic, labelled as such)
`priority_score = sev_weight(max severity: Poor 8, Fair 4, Good 1) + 2·affected_sources + min(persistence_minutes, 10) + 3·security_flag + recurrence_count`. P1 ≥ 15, P2 ≥ 8, otherwise P3. It is a ranking heuristic, **not a probability**.

## 6. Explainability: "evidence strength", not fake confidence
Each anomaly and incident carries a categorical **evidence strength**:
- **High:** persisted ≥ 3 windows **and** corroborated by ≥ 1 other signal or rule (C-SRC/C-TOPO), with baseline history ≥ 30.
- **Medium:** persisted ≥ 2 windows, or corroborated, but not both.
- **Low:** single signal, or baseline still learning (threshold-only detection).

The UI always shows the inputs: observed value, baseline median ± MAD, z, windows persisted, corroborating signals.

### Explanation payload (per incident)
`trigger_signals[]`, `baseline{median, mad, history_n}`, `observed`, `deviation{z, pct}`, `detection_methods[]`, `related_alerts[]`, `correlation_evidence[]`, `probable_cause{hypothesis, basis}`, `evidence_strength`, `uncertainty[]` (e.g. "no topology for APP_003", "baseline < 30 windows"), `recommendations[]`.

## 7. Recommendations (deterministic playbook)
A keyed table `(category, summary_code, context) → steps[] + rationale`. Examples:

| Pattern | Recommendation | Rationale shown |
|---|---|---|
| CPU baseline deviation, no error_rate rise | Inspect top processes on source; check recent deploys/cron at onset time | CPU deviated z=6.1 from 35 % baseline; no downstream errors → likely workload change, not failure |
| Latency rising on network device + dependent app alerts | Check link/interface on upstream device; consider failover route | Upstream device's onset preceded dependents by 40 s along dependency path |
| AUTH_FAILURE_BURST high | Review source auth logs locally; consider temporary lock/IP block (proposed action → Safe Action Simulator) | 25 failures/60 s, 1 user, 1 source → brute-force pattern |
| Disk > 90 % with rising trend | Rotate/compress logs; extend volume | Projected full in N min at current slope |

No LLM. Each recommendation cites the evidence IDs it was derived from.
