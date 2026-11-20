# AEGIS — Requirements Traceability Matrix

Source of truth: *CICADA 2026 Smart Observability Hackathon Evaluation Guide v8* (10 pages).
Status labels: **PLANNED · IMPLEMENTED · TESTED · DEMONSTRATED · PARTIAL · SIMULATED · BLOCKED**.
**Validated in Phase 9 (2026-11-20)** against the live deployment. DEFERRED = Phases 7-8, postponed by user decision until after the evaluation.

Class key: **ORG-M** = organizer-mandatory ("Mandatory for every team") · **CORE** = guide states as requirement · **TGT** = suggested target (confirmed by team on 2026-11-20) · **BONUS** = §6 bonus · **SCN** = §8 live scenario · **TEAM** = team/user decision · **ENG** = engineering recommendation.

Judging phase key: J1 Problem & Ideation (10) · J2 Architecture (25) · J3 Prototype (35) · J4 Final Demo (30).

## 1. Organizer-mandatory

| ID | Requirement | Guide § | Module | Test / evidence | Judging | Eng. phase | Status |
|---|---|---|---|---|---|---|---|
| M1 | Real-time targets measured from timestamps on the telemetry stream | §2, §3 | `apps/web` latency probe, `apps/saas-api/metrics`, `tests/performance` | `docs/judging/evidence/latency_report.json` (P95, n, method) | J3 (10 marks), J4 | 7, 9 | **TESTED (live)**: raw event -> SaaS p95 5.2 s (n=13,079), `docs/judging/evidence/phase9_targets.json`; browser-render leg not instrumented |
| M2 | Same organizer-provided simulated telemetry stream | §3 | `apps/collector/adapters` | Adapter ingests official stream sample; schema validation report | J3 | 3 → final integration | **RESOLVED BY ORGANIZERS (2026-11-20): no dataset will be provided; teams use their own synthetic data.** The AEGIS simulator (schema-compatible, scenario-injectable, labelled SIMULATED) is the official data source. |
| M3 | Egress proof panel: exactly what each payload contained before leaving | §2, §3 | `apps/collector/egress`, `apps/web` Privacy Glass | Ledger entry hash == SaaS-received hash for chosen payload_id | J3, J4 | 3, 8 | **PARTIAL**: proof TESTED live (3,231/3,231 ledger SHA-256 == SaaS SHA-256, `docs/judging/evidence/phase9_e2e_verify.json`; ledger + receipts APIs); Privacy Glass UI panel DEFERRED (Phase 8) |

## 2. Core architecture & data protection

| ID | Requirement | Guide § | Module | Test / evidence | Judging | Phase | Status |
|---|---|---|---|---|---|---|---|
| C1 | Two-tier: local collector + multi-tenant metadata-only SaaS, authenticated link | §1, §2 | `apps/collector`, `apps/saas-api` | Separate processes, stores, hosts (laptop vs VPS) | J2, J3 | 2–4 | **TESTED (live)**: collector on laptop, SaaS on VPS, Supabase DBs; token-authenticated HTTPS link |
| C2 | Collect → filter/redact → aggregate → analyze locally → apply policy → transmit | §2 | `collector/pipeline` | Unit test per stage; pipeline trace in egress ledger | J2 | 3 | **TESTED**: unit tests per stage + system tests through the real pipeline |
| C3 | Sources: agents, SNMP, syslog, flow, APIs | §2 | `collector/adapters` | Only adapters with working tests are claimed (see SCOPE_MVP §4) | J2 | 3 | **PARTIAL by design**: HTTP ingest, JSONL replay, system agent (psutil + TCP probes); no SNMP/syslog/flow adapters |
| C4 | Raw logs, payloads, secrets stay local | §2 | `collector/raw_store` (SQLite) | Security test: synthetic secrets absent from SaaS DB, SaaS logs, wire capture | J1, J3 | 3, 9 | **TESTED (live)**: 0 leaks of fake secrets / source names across all SaaS tables incl. incidents and LLM prompts (`docs/judging/evidence/phase9_e2e_verify.json`) |
| C5 | Only allow-listed metadata sent | §2 | `packages/contracts` outbound schema (`extra=forbid`) | Unknown-field rejection at collector AND SaaS | J1, J2, J3 | 3, 4 | **TESTED**: `extra=forbid` contracts; unknown fields rejected at collector and SaaS |
| C6a | Collector authentication | §2 | `saas-api/auth/collector` | No token / wrong token / revoked token → 401 | J2 | 4 | **TESTED (live)**: no/forged/revoked token -> 401 (`docs/judging/evidence/phase9_security_validation.json` C1-C4) |
| C6b | Encrypted transport (TLS) | §2 | Caddy on VPS (Let's Encrypt) | `curl -v` shows TLS 1.3; plain HTTP refused/redirected | J2 | 4 / deploy | **TESTED (live)**: TLS (Let's Encrypt via nginx, not Caddy), HTTP->HTTPS 301, HSTS; DB sslmode=require |
| C6c | Local retention controls | §2 | `collector/retention` | Records older than configured TTL purged; test | J2 | 3 | **TESTED**: raw-record TTL purge (`test_retention_purges_old_raw`) |
| C6d | Auditable data-transfer records | §2 | `collector/egress` ledger + SaaS ingest audit | Ledger ↔ SaaS audit reconciliation | J2, J3 | 3, 4 | **TESTED (live)**: hash-chained egress ledger reconciled with SaaS receipts (0 mismatches) |
| C7 | Monitor CPU, memory, disk, service availability, bandwidth, latency, packet loss, connectivity | §2 | `collector/adapters/system_agent` (psutil + ping) + simulator | Each metric visible on dashboard with units | J2, J3 | 3, 5 | **TESTED**: all eight metric families on the dashboard (simulated sources; real host via system agent) |
| C8 | Detect repeated auth failures locally | §2 | `collector/detectors/auth` | Scenario S3 | J3, J4 | 3, 6 | **TESTED (live)**: S3 -> local AUTH_FAILURE_BURST, counts only -> security incident |
| C9 | Anomalies, correlation, prioritization, explainable recommendations | §2 | `saas-api/aiops` | Scenarios S5, S6; explanation payload complete | J3, J4 (weighted) | 6 | **TESTED (live)**: baselines/trends/thresholds, correlation, priority, cited playbook, grounded LLM explanation (`docs/judging/evidence/phase6_scenario_sweep.json`, `phase6_live_llm_explanation.json`) |
| C10 | Collector online/offline, last-seen, version, resource usage, config status | §2 | heartbeat + `saas-api/fleet` + Fleet page | Fleet page shows all five fields live | J3 | 4, 5, 7 | **TESTED (live)**: fleet shows online/offline, last seen, version, resources, config hash, adapters |
| C11 | Multiple customer environments, tenant separation | §1, §2 | Postgres RLS + app checks | Cross-tenant API/WebSocket tests return 404/403 | J1, J2, J3 | 4, 9 | **TESTED (live)**: API, WebSocket and SQL (RLS) isolation (`docs/judging/evidence/phase9_security_validation.json` I1-I4, W1-W3, D1-D3) |

## 3. Global-ready

| ID | Requirement | Module | Test / evidence | Judging | Phase | Status |
|---|---|---|---|---|---|---|
| G1 | Regional ingest endpoint | collector region config → `/ingest/{region}` | Collector of EU tenant refused at AP endpoint | J2, bonus | 4 | **TESTED (live)**: Mumbai token refused in eu-west and vice versa (R1, R2) |
| G2 | Tenant data residency, no replication without policy | per-region Postgres database | Row exists only in tenant's regional DB | J2, bonus | 4 | **TESTED (live)**: separate Supabase projects in Mumbai and Frankfurt; EU incidents never sent to the external LLM (R3). SaaS compute is one host (US VPS) |
| G3 | UTC + source timezone | contracts | Validation rejects naive timestamps / invalid IANA zones | J2, bonus | 3, 4 | **TESTED**: contracts reject naive timestamps / invalid IANA zones |
| G4 | Out-of-order placed by event time | SaaS storage keyed by event_time; charts sort by event_time | Scenario S7 | J2, J4 | 7 | **PARTIAL**: late windows stored with a late flag and never re-scored by AIOps (tested); S7 live scenario DEFERRED (Phase 7) |
| G5 | Idempotent delivery, unique payload ID | deterministic UUIDv5 + unique constraint | Scenario S2/S7 counts | J2, J3 | 4, 7 | **TESTED (live)**: deterministic UUIDv5 + ON CONFLICT; 0 duplicates in verification |

## 4. Targets (team-confirmed suggested values)

| ID | Target | Measurement | Evidence | Phase | Status |
|---|---|---|---|---|---|
| T1 | Collection → dashboard P95 ≤ 10 s | raw event timestamp vs browser render timestamp (same laptop clock) | latency_report.json | 7, 9 | **TESTED (live)**: p95 5.2 s (raw event -> SaaS; WS publish in-process) |
| T2 | Breach → alert ≤ 15 s | injected spike event_timestamp vs alert `created_at` (skew-corrected) and vs browser render | alert_latency.json | 7, 9 | **TESTED (live)**: p95 5.7 s, max 5.7 s (n=25 alerts) |
| T3 | Offline detection ≤ 60 s after last heartbeat | last heartbeat `received_at` vs state change to Poor | offline_report.json | 7, 9 | **TESTED (live)**: max 35.7 s (n=9 offline transitions) |
| T4 | Backlog: all delivered, 0 loss, 0 duplicates | sent ID set vs SaaS stored ID set | recovery_report.json | 7, 9 | **TESTED (live)**: collector-side SaaS outage (60 s of telemetry) + collector restart: 957 buffered, then 1,837/1,837 delivered, 0 missing, 0 duplicate IDs, 0 hash mismatches (`docs/judging/evidence/phase9_outage_verify.json`). Production SaaS was not stopped (blocked as too disruptive) |

## 5. Health states (§4)

| ID | Requirement | Module | Test | Phase | Status |
|---|---|---|---|---|---|
| H1 | Exactly four states: Excellent, Good, Fair, Poor | `saas-api/health` | Enum + unit tests | 5 | **TESTED (live)** |
| H2 | Configurable thresholds | `config/health_thresholds.yaml` + Settings page | Change threshold → state changes | 5 | **TESTED** |
| H3 | Reason for each state change shown | transition record `reasons[]` | UI shows factors | 5 | **TESTED (live)** |
| H4 | Stale/missing data downgrades state | staleness evaluator | Stop source → Fair then Poor | 5, 7 | **TESTED (live)**: stale -> Fair -> Poor |
| H5 | Transitions UTC-timestamped in event history | `health_transitions` table | History view | 5 | **TESTED (live)** |

## 6. Roadmap & bonus

| ID | Item | Phase | Status |
|---|---|---|---|
| R1 | Observe → Detect → Correlate → Recommend implemented; Act = simulated only | 5, 6, 8 | **PARTIAL**: Observe -> Detect -> Correlate -> Recommend TESTED live; Act (simulated, approval-gated) DEFERRED (Phase 8) |
| B1 | Privacy-aware metadata pipeline | 3 | **TESTED (live)** |
| B2 | Local buffering | 7 | **TESTED (live)**: outbox survived a collector restart during the outage and drained in ~37 s |
| B3 | Explainable AIOps | 6 | **TESTED (live)** |
| B4 | Alert-noise reduction | 6 | **TESTED (live)**: 18 alerts -> 1 incident (S6) |
| B5 | Safe remediation simulation (approval, audit, rollback) | 8 | **DEFERRED** (Phase 8, user decision) |
| B6 | Global-ready delivery | 4, 7 | **TESTED (live)**: two regional databases + regional token binding |

## 7. Live scenarios (§8) — pass criteria in `SCOPE_MVP.md §5`

| ID | Scenario | Phase | Status |
|---|---|---|---|
| S1 | Raw log contains a secret | 3, 8, 10 | **TESTED (live)**: secrets visible locally, masked in console, absent from SaaS |
| S2 | Collector loses SaaS connectivity | 7, 10 | **TESTED (live)**: outage detected (sender network_error), metadata buffered in the local outbox, retried, resumed after reconnect with 0 loss / 0 duplicates |
| S3 | Repeated failed logins | 3, 6, 10 | **TESTED (live)** |
| S4 | Network latency rises | 5, 6, 10 | **TESTED**: trend alert 30-32 s before the static threshold (5/5 seeds) |
| S5 | CPU/memory deviates from baseline | 6, 10 | **TESTED (live)**: caught below the static threshold (z ~30) |
| S6 | Several alerts relate to one incident | 6, 10 | **TESTED (live)**: 18 alerts -> 1 P1 incident, root NET_001 |
| S7 | Duplicate / out-of-order delivery | 7, 10 | **PARTIAL**: duplicate delivery TESTED (idempotent); out-of-order live scenario DEFERRED (Phase 7) |
| S8 | Remediation proposed | 8, 10 | **PARTIAL**: remediation PROPOSED (cited playbook, nothing executed); approval/rollback simulator DEFERRED (Phase 8) |

## 8. Judge evidence requests → artifact

| Guide request | Artifact |
|---|---|
| One-page data-flow sketch with trust boundary | `docs/judging/J1_ONE_PAGER.md` |
| Allow-list fields + redaction examples | `docs/security/DATA_CLASSIFICATION.md`, `docs/architecture/METADATA_SCHEMA.md` |
| Simulated-telemetry plan and roles | `docs/requirements/SCOPE_MVP.md` |
| Architecture diagram, every hop labelled | `docs/architecture/ARCHITECTURE.md` |
| Payload schema and allow-list mechanism | `docs/architecture/METADATA_SCHEMA.md` |
| Behaviour when SaaS unreachable; duplicates | `docs/architecture/RELIABILITY.md` |
| Tenant isolation approach | `docs/security/THREAT_MODEL.md §4` |
| Live raw-vs-redacted side by side | Collector local console `/local/raw` (masked) vs reveal; Privacy Glass UI deferred (Phase 8) |
| Timestamps proving targets | `docs/requirements/MEASUREMENT_PLAN.md` → Phase 7/9 reports |
| Forced outage, IDs compared | `scripts/scenarios/s2_outage` (Phase 7) |
| Egress log for a specific payload | Privacy Glass / ledger API |
| Recommendation with signals, confidence, reasoning | Incident detail page (evidence strength, priority breakdown, cited playbook, grounded AI explanation) |
| Related alerts merged into one incident | Scenario S6 |
| §7 questions answered without slides | `docs/judging/QA.md` (Phase 10) |
