# AEGIS — Requirements Traceability Matrix

Source of truth: *CICADA 2026 Smart Observability Hackathon Evaluation Guide v8* (10 pages).
Status labels: **PLANNED · IMPLEMENTED · TESTED · DEMONSTRATED · PARTIAL · SIMULATED · BLOCKED**.
As of Phase 1, every row is **PLANNED** unless stated otherwise.

Class key: **ORG-M** = organizer-mandatory ("Mandatory for every team") · **CORE** = guide states as requirement · **TGT** = suggested target (confirmed by team on 2026-11-20) · **BONUS** = §6 bonus · **SCN** = §8 live scenario · **TEAM** = team/user decision · **ENG** = engineering recommendation.

Judging phase key: J1 Problem & Ideation (10) · J2 Architecture (25) · J3 Prototype (35) · J4 Final Demo (30).

## 1. Organizer-mandatory

| ID | Requirement | Guide § | Module | Test / evidence | Judging | Eng. phase | Status |
|---|---|---|---|---|---|---|---|
| M1 | Real-time targets measured from timestamps on the telemetry stream | §2, §3 | `apps/web` latency probe, `apps/saas-api/metrics`, `tests/performance` | `docs/judging/evidence/latency_report.json` (P95, n, method) | J3 (10 marks), J4 | 7, 9 | PLANNED |
| M2 | Same organizer-provided simulated telemetry stream | §3 | `apps/collector/adapters` | Adapter ingests official stream sample; schema validation report | J3 | 3 → final integration | **RESOLVED BY ORGANIZERS (2026-11-20): no dataset will be provided; teams use their own synthetic data.** The AEGIS simulator (schema-compatible, scenario-injectable, labelled SIMULATED) is the official data source. |
| M3 | Egress proof panel: exactly what each payload contained before leaving | §2, §3 | `apps/collector/egress`, `apps/web` Privacy Glass | Ledger entry hash == SaaS-received hash for chosen payload_id | J3, J4 | 3, 8 | PLANNED |

## 2. Core architecture & data protection

| ID | Requirement | Guide § | Module | Test / evidence | Judging | Phase | Status |
|---|---|---|---|---|---|---|---|
| C1 | Two-tier: local collector + multi-tenant metadata-only SaaS, authenticated link | §1, §2 | `apps/collector`, `apps/saas-api` | Separate processes, stores, hosts (laptop vs VPS) | J2, J3 | 2–4 | PLANNED |
| C2 | Collect → filter/redact → aggregate → analyze locally → apply policy → transmit | §2 | `collector/pipeline` | Unit test per stage; pipeline trace in egress ledger | J2 | 3 | PLANNED |
| C3 | Sources: agents, SNMP, syslog, flow, APIs | §2 | `collector/adapters` | Only adapters with working tests are claimed (see SCOPE_MVP §4) | J2 | 3 | PARTIAL by design |
| C4 | Raw logs, payloads, secrets stay local | §2 | `collector/raw_store` (SQLite) | Security test: synthetic secrets absent from SaaS DB, SaaS logs, wire capture | J1, J3 | 3, 9 | PLANNED |
| C5 | Only allow-listed metadata sent | §2 | `packages/contracts` outbound schema (`extra=forbid`) | Unknown-field rejection at collector AND SaaS | J1, J2, J3 | 3, 4 | PLANNED |
| C6a | Collector authentication | §2 | `saas-api/auth/collector` | No token / wrong token / revoked token → 401 | J2 | 4 | PLANNED |
| C6b | Encrypted transport (TLS) | §2 | Caddy on VPS (Let's Encrypt) | `curl -v` shows TLS 1.3; plain HTTP refused/redirected | J2 | 4 / deploy | PLANNED |
| C6c | Local retention controls | §2 | `collector/retention` | Records older than configured TTL purged; test | J2 | 3 | PLANNED |
| C6d | Auditable data-transfer records | §2 | `collector/egress` ledger + SaaS ingest audit | Ledger ↔ SaaS audit reconciliation | J2, J3 | 3, 4 | PLANNED |
| C7 | Monitor CPU, memory, disk, service availability, bandwidth, latency, packet loss, connectivity | §2 | `collector/adapters/system_agent` (psutil + ping) + simulator | Each metric visible on dashboard with units | J2, J3 | 3, 5 | PLANNED |
| C8 | Detect repeated auth failures locally | §2 | `collector/detectors/auth` | Scenario S3 | J3, J4 | 3, 6 | PLANNED |
| C9 | Anomalies, correlation, prioritization, explainable recommendations | §2 | `saas-api/aiops` | Scenarios S5, S6; explanation payload complete | J3, J4 (weighted) | 6 | PLANNED |
| C10 | Collector online/offline, last-seen, version, resource usage, config status | §2 | heartbeat + `saas-api/fleet` + Fleet page | Fleet page shows all five fields live | J3 | 4, 5, 7 | PLANNED |
| C11 | Multiple customer environments, tenant separation | §1, §2 | Postgres RLS + app checks | Cross-tenant API/WebSocket tests return 404/403 | J1, J2, J3 | 4, 9 | PLANNED |

## 3. Global-ready

| ID | Requirement | Module | Test / evidence | Judging | Phase | Status |
|---|---|---|---|---|---|---|
| G1 | Regional ingest endpoint | collector region config → `/ingest/{region}` | Collector of EU tenant refused at AP endpoint | J2, bonus | 4 | PLANNED (logical regions, one physical host — limitation documented) |
| G2 | Tenant data residency, no replication without policy | per-region Postgres database | Row exists only in tenant's regional DB | J2, bonus | 4 | PLANNED (PARTIAL: same physical server) |
| G3 | UTC + source timezone | contracts | Validation rejects naive timestamps / invalid IANA zones | J2, bonus | 3, 4 | PLANNED |
| G4 | Out-of-order placed by event time | SaaS storage keyed by event_time; charts sort by event_time | Scenario S7 | J2, J4 | 7 | PLANNED |
| G5 | Idempotent delivery, unique payload ID | deterministic UUIDv5 + unique constraint | Scenario S2/S7 counts | J2, J3 | 4, 7 | PLANNED |

## 4. Targets (team-confirmed suggested values)

| ID | Target | Measurement | Evidence | Phase | Status |
|---|---|---|---|---|---|
| T1 | Collection → dashboard P95 ≤ 10 s | raw event timestamp vs browser render timestamp (same laptop clock) | latency_report.json | 7, 9 | PLANNED |
| T2 | Breach → alert ≤ 15 s | injected spike event_timestamp vs alert `created_at` (skew-corrected) and vs browser render | alert_latency.json | 7, 9 | PLANNED |
| T3 | Offline detection ≤ 60 s after last heartbeat | last heartbeat `received_at` vs state change to Poor | offline_report.json | 7, 9 | PLANNED |
| T4 | Backlog: all delivered, 0 loss, 0 duplicates | sent ID set vs SaaS stored ID set | recovery_report.json | 7, 9 | PLANNED |

## 5. Health states (§4)

| ID | Requirement | Module | Test | Phase | Status |
|---|---|---|---|---|---|
| H1 | Exactly four states: Excellent, Good, Fair, Poor | `saas-api/health` | Enum + unit tests | 5 | PLANNED |
| H2 | Configurable thresholds | `config/health_thresholds.yaml` + Settings page | Change threshold → state changes | 5 | PLANNED |
| H3 | Reason for each state change shown | transition record `reasons[]` | UI shows factors | 5 | PLANNED |
| H4 | Stale/missing data downgrades state | staleness evaluator | Stop source → Fair then Poor | 5, 7 | PLANNED |
| H5 | Transitions UTC-timestamped in event history | `health_transitions` table | History view | 5 | PLANNED |

## 6. Roadmap & bonus

| ID | Item | Phase | Status |
|---|---|---|---|
| R1 | Observe → Detect → Correlate → Recommend implemented; Act = simulated only | 5, 6, 8 | PLANNED |
| B1 | Privacy-aware metadata pipeline | 3 | PLANNED |
| B2 | Local buffering | 7 | PLANNED |
| B3 | Explainable AIOps | 6 | PLANNED |
| B4 | Alert-noise reduction | 6 | PLANNED |
| B5 | Safe remediation simulation (approval, audit, rollback) | 8 | PLANNED (SIMULATED by design) |
| B6 | Global-ready delivery | 4, 7 | PLANNED |

## 7. Live scenarios (§8) — pass criteria in `SCOPE_MVP.md §5`

| ID | Scenario | Phase | Status |
|---|---|---|---|
| S1 | Raw log contains a secret | 3, 8, 10 | PLANNED |
| S2 | Collector loses SaaS connectivity | 7, 10 | PLANNED |
| S3 | Repeated failed logins | 3, 6, 10 | PLANNED |
| S4 | Network latency rises | 5, 6, 10 | PLANNED |
| S5 | CPU/memory deviates from baseline | 6, 10 | PLANNED |
| S6 | Several alerts relate to one incident | 6, 10 | PLANNED |
| S7 | Duplicate / out-of-order delivery | 7, 10 | PLANNED |
| S8 | Remediation proposed | 8, 10 | PLANNED |

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
| Live raw-vs-redacted side by side | Privacy Glass (Phase 8) |
| Timestamps proving targets | `docs/requirements/MEASUREMENT_PLAN.md` → Phase 7/9 reports |
| Forced outage, IDs compared | `scripts/scenarios/s2_outage` (Phase 7) |
| Egress log for a specific payload | Privacy Glass / ledger API |
| Recommendation with signals, confidence, reasoning | Incident Investigator (Phase 6) |
| Related alerts merged into one incident | Scenario S6 |
| §7 questions answered without slides | `docs/judging/QA.md` (Phase 10) |
