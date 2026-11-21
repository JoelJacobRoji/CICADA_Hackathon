# AEGIS: Phase 9 validation report (2026-11-20)

Target: the **live deployment** (https://aegis.162-35-42-114.sslip.io, backend + dashboard `f8f1920`;
Supabase Mumbai + Frankfurt). Data: SYNTHETIC, from the AEGIS simulator (the official source, since the organizers provide no dataset).
Every number below comes from a script run against production. The evidence files are in `docs/judging/evidence/`.

## 1. Evaluation criteria (organizers, 2026-11-20)

| Criterion | Verdict | Proof |
|---|---|---|
| Successfully implemented and functional | **PASS** | Live browser suite **11/11** against production (`scripts/e2e_live.py`), 226 Python tests ×2 + 22 web tests |
| Two-tier architecture: frontend + backend + database | **PASS** | React dashboard ↔ FastAPI (VPS, systemd, nginx TLS) ↔ Supabase PostgreSQL (2 regions), plus the local collector tier |
| AI-driven engine integrated | **PASS** | Live: S5 caught only by the statistical baseline (z ≈ 30, below the static threshold); S6 18 alerts → 1 incident with root cause; grounded Gemini explanations; device alerts |
| Security: data protection, secure communication, access control | **PASS** | **49/49 live security checks** (`phase9_security_validation.json`); 0 leaks across all SaaS tables |

## 2. End-to-end pipeline (live, `phase9_e2e_verify.json`)
Run: fresh collector, 220 s at 100 ev/s, S1 (secrets in raw logs) + S3 (failed logins) + S6 (cascade).

| Check | Result |
|---|---|
| Payloads ledgered → stored in SaaS | **3,231 / 3,231**, 0 missing |
| Collector ledger SHA-256 == SaaS SHA-256 | **0 mismatches** |
| Fake secrets + all 9 real source names in **any** SaaS table (incl. incidents, alerts, notifications, LLM prompts/responses) | **0 leaks** |
| Delivery latency ledger → SaaS | p50 0.21 s · p95 1.26 s · max 2.99 s |
| Tenant scoping (initech operator) | 0 acme rows visible |
| Device alerts delivered to the local webhook | 18 (re-identified locally) |

## 3. Targets (live timestamps, `phase9_targets.json`)

| Target | Required | Measured |
|---|---|---|
| T1 raw event → SaaS (WS publish in-process) | P95 ≤ 10 s | **p95 5.2 s** (n = 13,079) |
| T2 breach → alert | ≤ 15 s | **p95 5.7 s, max 5.7 s** (n = 25) |
| T3 last heartbeat → collector Poor | ≤ 60 s | **max 35.7 s** (n = 9) |
| T4 outage backlog delivered, 0 loss / 0 dup | proof | **1,837 / 1,837 delivered, 0 missing, 0 duplicate IDs** after a 60 s collector-side outage + collector restart (`phase9_outage_verify.json`) |

Method notes:
- **T1** is measured to SaaS storage. The WebSocket publish happens in the same request; the browser render step is not instrumented.
- **T1 and T2** compare laptop event timestamps with VPS receive timestamps, so they include any skew between the two clocks (not separately measured).

## 3b. Outage and recovery (live, `phase9_outage_timeline.json`, `phase9_outage_verify.json`)

The production SaaS was **not** stopped: that was blocked as too disruptive. Instead the collector was made unable to reach the SaaS.

| Step | Result |
|---|---|
| Collector pointed at an unreachable address for 60 s of telemetry | sender `network_error`; **957 payloads buffered** in the local outbox |
| Collector restarted with a full outbox, then reconnected to production | buffer survived the restart; drained in ~37 s |
| IDs compared | **1,837 / 1,837** stored, **0 missing, 0 duplicate IDs, 0 hash mismatches**, 0 leaks |

## 4. Security validation (live, 49/49, `scripts/validate_security.py`)
- **Transport:**
  - HTTP → HTTPS 301
  - HSTS (1 year) on the UI and the API
  - database over TLS
- **Browser hardening:** CSP `default-src 'self'`, X-Frame-Options DENY, nosniff, Referrer-Policy.
- **Authentication:**
  - every API returns 401 without a session
  - identical errors for a wrong password and an unknown user
  - login rate limit returns 429 after 5 attempts per minute (probed with a non-existent account)
  - session cookie is HttpOnly + Secure + SameSite=Strict; the token never appears in a response body
- **Tenant isolation:**
  - initech sees none of acme's incidents; GET or acknowledge on acme's incident → 404
  - WebSocket refuses a foreign Origin and connections without a session
  - row-level security on **every** table in both regions; the app role can't bypass it and isn't a superuser
  - no grants to anon, authenticated or PUBLIC
- **Collector credentials and residency:**
  - no token or a forged token → 401; collector tokens can't read operator APIs
  - Mumbai token refused in Frankfurt and the reverse
  - eu-west: 11 explanation records, **0 sent** to the external LLM
- **Stored secrets and history:**
  - collector tokens stored only as SHA-256; passwords only as argon2id
  - the app can't delete the audit log or incident history
- **Bundle hygiene:** the 711 kB dashboard bundle contains no keys, tokens or database URLs.

## 5. Requirements matrix (`docs/requirements/REQUIREMENTS_MATRIX.md`)
45 rows validated: **39 TESTED** (32 of them live in production) · **5 PARTIAL** · **1 DEFERRED**.
The PARTIAL and DEFERRED rows are exactly the Phase 7–8 items still postponed by user decision
(Privacy Glass, M3, was built on 2026-11-21 and verified live: `phase8_glass_live.json`):
- out-of-order scenario (S7/G4)
- Safe Action Simulator (B5/S8/R1)
- extra adapters (C3, partial by design)

## 6. Defects found during Phases 6–9 validation, all fixed with regression tests

| # | Defect | Found by | Fix |
|---|---|---|---|
| 1 | Service crash on deploy: `httpx` not a declared runtime dependency | VPS deploy | declared; architecture test fails on any undeclared import |
| 2 | Baseline absorbed an incident → false P1 on recovery, missed repeat | live e2e | baseline frozen during a deviation; harmful-direction alerts; filtered warm start |
| 3 | Collector stop flipped an incident's root cause to the network device | live e2e | C-COLLECTOR rule; NO_DATA never used for topology/root cause |
| 4 | A rejected LLM answer was not retried | live e2e | one self-correction retry, re-validated |
| 5 | Grounding validator misread ISO timestamps / UTC offsets | live Gemini call | parser fix + regression tests (wrong dates/times still rejected) |
| 6 | LLM worker published to a closed event loop at shutdown | test run | loop detached + liveness check |

## 7. Known limits (honest)
- **Single instance:** one SaaS instance with in-memory WebSocket, health and AIOps state (K18, K30). Open incidents are closed with a visible reason after a restart.
- **Gemini free tier:** no data-processing agreement, so it's used only for ap-south and only with pseudonymous metadata (K31).
- **Grounding check:** it works at the level of words and numbers, so it can't catch a wrong causal sentence built only from true facts (K32). The deterministic cause and priority stay authoritative.
- **Hosting:** the SaaS compute is one US VPS; only the databases are regional.
