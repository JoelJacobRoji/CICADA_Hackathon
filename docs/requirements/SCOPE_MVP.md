# AEGIS — Scope, MVP and 24-Hour Plan

## 1. Problem in one paragraph
Organisations must watch infrastructure, networks and security events across many sites without shipping raw logs, payloads or credentials to a central service. Shipping raw telemetry widens the attack surface and can breach compliance. AEGIS keeps raw data inside the customer environment: a local collector redacts, aggregates and analyses it, then sends only allow-listed, pseudonymised metadata to a multi-tenant SaaS. The SaaS turns that metadata into health states, correlated incidents and explainable recommendations. An **egress proof** shows exactly what left each environment.

## 2. Primary use cases (J1)
1. **Infrastructure health**: CPU, memory, disk and service availability per source, with four-state health.
2. **Network performance**: latency, packet loss, bandwidth and connectivity, plus trend and service impact.
3. **Security signals**: repeated failed logins detected locally. Only a summary leaves the collector.
4. **Collector fleet health**: online/offline, last-seen, version, resource usage, configuration hash, queue depth.
5. **Privacy proof**: for any payload, show the local source record next to the exact outbound JSON and the SaaS-received copy.

## 3. Priorities

| Priority | Feature |
|---|---|
| **P0** | Collector pipeline (adapters → normalise → redact → aggregate → detect → policy → outbox) |
| P0 | Strict outbound schema, field allow-list, secret scrubbing, HMAC pseudonyms |
| P0 | Egress ledger + egress proof panel (basic) |
| P0 | SaaS ingest: token auth, TLS, schema revalidation, tenant binding, dedup, ack |
| P0 | Postgres row-level security + cross-tenant tests |
| P0 | Four-state health engine with reasons, stale-data handling, transition history |
| P0 | Dashboard: Overview, Fleet, Infrastructure, Network, Security, Incidents (live via WebSocket) |
| P0 | Robust baseline anomaly detection (median/MAD), correlation, prioritisation, explanations |
| P0 | Durable outbox, retry/backoff, offline detection, out-of-order handling |
| P0 | Latency instrumentation + scenario scripts S1–S8 + evidence reports |
| P1 | Privacy Glass (full side-by-side), Incident Constellation (React Flow), Recovery Timeline |
| P1 | Safe Action Simulator (policy → approval → simulated run → audit → rollback) |
| P1 | Two logical regions with separate databases; VPS deployment with Caddy TLS |
| P2 | Extra adapters (syslog UDP, SNMP), advanced animation, predictive models |
| Dropped | 3D/Three.js (user decision), external LLM (user decision) |

**Cut order if behind schedule:** P2 → Constellation animation → second region (falls back to policy-only, labelled) → Safe Action polish → Recovery Timeline visuals. P0 is never cut silently. Any cut is presented for approval.

## 4. Telemetry sources: what we will and won't claim

| Source type (guide) | AEGIS adapter | Claim |
|---|---|---|
| Agent | `system_agent`: psutil (CPU/mem/disk/net bytes) + ICMP/TCP probe for latency, loss and connectivity on the collector host | IMPLEMENTED once tested |
| API | `http_ingest`: `POST /api/v1/telemetry` (JSON / JSON array) on the collector, localhost/LAN only | IMPLEMENTED once tested |
| File replay | `jsonl_replay`: JSONL with rate control and time-shifting | IMPLEMENTED once tested |
| Synthetic | `simulator` (dev, **labelled SIMULATED**): multi-source metrics + logs + scenario injection | SIMULATED |
| Syslog | Planned P2 (UDP 5514 adapter) | PLANNED, not claimed |
| SNMP / flow | Not built. The simulator emits SNMP-like and flow-like metrics, but they are labelled simulated. | Not claimed |
| Official organizer stream | Adapter mapping added when supplied | **BLOCKED** (pending input) |

## 5. Minimum viable end-to-end demo (acceptance)
1. The simulator emits a raw log containing `password=FAKE_P@ss123` and `api_key=FAKE_sk_live_51Hx…` for `SRV_001`.
2. The collector stores the raw record locally (visible in the collector console only).
3. The outbound payload contains `source_pid=src_…`, metric/summary fields only. Grep for each fake secret in the outbound payload, the SaaS DB dump and the SaaS logs → **0 matches**.
4. The egress ledger shows the payload's SHA-256. The SaaS ingest audit shows the same SHA-256.
5. Within 10 s the dashboard shows the event, and the source's health state changes with a stated reason.

### Scenario pass criteria

| Scn | Injection | Pass criterion |
|---|---|---|
| S1 | Raw log with fake secrets | Rule 3 above. The Privacy Glass diff shows fields dropped/pseudonymised. |
| S2 | Stop SaaS (or hotspot off) for ≥ 60 s while 100 ev/s continue | Collector status → Poor ≤ 60 s. Outbox depth grows. After restore: `missing_ids = 0`, `duplicate_rows = 0`, counts printed. |
| S3 | 25 failed logins for one host in 60 s | Local `AUTH_FAILURE_BURST` summary. Security health Fair/Poor. SaaS contains no username, IP or raw line. |
| S4 | Latency on `NET_001` ramps 20 → 400 ms over 60 s | Alert with severity, affected pseudonymous source, trend chart, dependent services listed as impacted |
| S5 | CPU on `SRV_002` steps from ~35 % to 80 % (below the 85 % static Fair threshold) | Anomaly flagged by robust z-score ≥ 3.5, with baseline, deviation and contributing signals shown. Recommendation shown. |
| S6 | Network loss on `NET_001` → latency on dependent `APP_001`, `APP_002` → their error-rate rise | ≥ 4 alerts merged into 1 incident. Root-cause hypothesis = `NET_001`. Noise-reduction ratio displayed. |
| S7 | Replay 200 payloads twice, plus 50 shuffled with late timestamps | Stored rows = unique IDs. Charts ordered by event time. Late arrivals flagged. |
| S8 | Recommendation "restart service on APP_001" | Policy check result, approve/reject, simulated execution, audit entry, rollback plan visible. **No real execution.** |

## 6. Time budget (≈ 22.5 h remaining at Phase 1 start; clock started ≈ 1 h earlier)

| Hours (from Phase 1 start) | Eng. phase | Deliverable | Judging touchpoint |
|---|---|---|---|
| 0.0–1.0 | 1 Blueprint | docs/ | **J1 evidence ready** |
| 1.0–2.5 | 2 Foundations | repo, venvs, Postgres, CI, health endpoints | — |
| 2.5–5.5 | 3 Collector & privacy | redaction, outbox, egress ledger, simulator | J2 evidence |
| 5.5–8.5 | 4 SaaS ingest & tenancy | auth, RLS, dedup, WebSocket | **Vertical slice by ~h8** |
| 8.5–12.0 | 5 Dashboard & health | live pages, 4-state engine | J3 checkpoint likely |
| 12.0–15.0 | 6 AIOps | baselines, correlation, explanations | — |
| 15.0–17.5 | 7 Reliability & measurement | outage/recovery, latency reports | J3 (10 marks) |
| 17.5–19.5 | 8 Innovation | Privacy Glass, Constellation, Safe Action | — |
| 19.5–21.0 | 9 Validation | test report | — |
| 21.0–22.5 | 10 Demo & docs | runbook, Q&A, pitch, GO/NO-GO | **J4** |

Risk: phase approval round-trips add latency. Fast replies at gates protect this schedule.

## 7. Team roles (suggested; team of 4)

| Role | Owner | Responsibilities | Demo duty |
|---|---|---|---|
| A: Collector & Privacy | Member 1 | adapters, redaction rules, egress ledger | S1, S3 |
| B: SaaS & Reliability | Member 2 | ingest, tenancy, outbox, VPS deploy | S2, S7 |
| C: Dashboard & UX | Member 3 | pages, health visuals, Privacy Glass | screen driver |
| D: AIOps, QA & Pitch | Member 4 | detection rules, scenarios, test report, Q&A | S4–S6, S8, pitch |

## 8. Explicit exclusions
Real remediation on any infrastructure · production-grade multi-region · external LLM · 3D graphics · SSO/IdP · Kubernetes, Kafka, Redis.
