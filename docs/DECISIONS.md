# AEGIS — Architecture Decision Records

| # | Date | Decision | Alternatives | Rationale | Status |
|---|---|---|---|---|---|
| ADR-01 | 2026-11-20 | Input via HTTP REST `POST /api/v1/telemetry` + JSONL replay + local agent | Kafka, syslog-first | team decision; fast, reproducible | Accepted (user) |
| ADR-02 | 2026-11-20 | Collector→SaaS: HTTPS + per-collector bearer token | mTLS | team decision; simpler behind Caddy; mTLS listed as production upgrade | Accepted (user) |
| ADR-03 | 2026-11-20 | Dashboard push via WebSocket | SSE | team decision | Accepted (user) |
| ADR-04 | 2026-11-20 | Dev simulator, labelled SIMULATED, until official stream supplied | wait | user approved; official stream integrated later | Accepted (user) |
| ADR-05 | 2026-11-20 | No external LLM; deterministic explanations | LLM wording | user decision; privacy + reliability | Accepted (user) |
| ADR-06 | 2026-11-20 | No 3D graphics | R3F | user decision | Accepted (user) |
| ADR-07 | 2026-11-20 | Python 3.11 via uv, FastAPI, Pydantic v2, SQLAlchemy 2, psycopg 3, Alembic | 3.14 | wheel availability | Proposed |
| ADR-08 | 2026-11-20 | Postgres 16 with RLS, per-region databases | schema-per-tenant | strong isolation story, low effort | Proposed |
| ADR-09 | 2026-11-20 | SQLite WAL transactional outbox + hash-chained egress ledger on collector | file queue | durability + tamper evidence | Proposed |
| ADR-10 | 2026-11-20 | 2 s tumbling aggregation windows; batches ≤ 500 items | per-event send | latency budget vs request volume over hotspot | Proposed |
| ADR-11 | 2026-11-20 | Deterministic UUIDv5 payload IDs | random UUIDv4 | idempotent regeneration after crash | Proposed |
| ADR-12 | 2026-11-20 | Robust z (median/MAD) + trend + rules; categorical evidence strength | scikit-learn IsolationForest | explainable, no training data needed; no fake confidence | Proposed |
| ADR-13 | 2026-11-20 | Log-record extension to input schema (`record_type: log`) | none | required for S1/S3; backwards-compatible | Proposed |
| ADR-14 | 2026-11-20 | SaaS on user's VPS (162.35.42.114) via Docker Compose (ports bound to 127.0.0.1) behind the **existing nginx** with a new server block for a dedicated hostname + certbot cert; Caddy dropped (nginx already owns 80/443); local Compose fallback | path prefix on existing site; separate port | doesn't touch the existing app's server block; real network trust boundary | Proposed (awaiting approval) |
| ADR-15 | 2026-11-20 | React + TS + Vite + Tailwind + ECharts + React Flow + Motion | Recharts, Cytoscape | performance + fit | Proposed |
| ADR-16 | 2026-11-20 | Workspace remains in OneDrive folder with sync paused | C:\dev | user decision; risk noted in KNOWN_ISSUES | Accepted (user) |
| ADR-17 | 2026-11-20 | Ports: PG 55432, saas-api 9001, collector 9100, web 5180 | defaults | 5173/8080/8443 occupied on laptop | Proposed |
| ADR-18 | 2026-11-20 | **Supabase Postgres** is the runtime SaaS DB: one project per region (ap-south → Mumbai, eu-west → Frankfurt) for real residency; session pooler (IPv4); tables in private `aegis` schema (not exposed via Data API); custom `aegis_app` role without BYPASSRLS; Supabase Auth/Realtime/Data API unused; automated tests use local docker Postgres | VPS-hosted Postgres | user decision; physically separate regional DBs | Accepted (user) |
| ADR-19 | 2026-11-20 | Single uv workspace + one `.venv` + one `uv.lock` (instead of one venv per service); tier independence enforced by package deps + architecture tests | per-service venvs | faster installs over hotspot; boundary still tested | Accepted (deviation from Phase 2 plan, reported) |
| ADR-20 | 2026-11-20 | Wire format requires explicit `kind` discriminator on every outbound item | default kind | stricter allow-list, unambiguous parsing | Accepted |
| ADR-21 | 2026-11-20 | Two-layer egress canary: high-precision patterns + SHA-256 fingerprints of secret values observed locally (bounded, in-memory, hashes only) | patterns only | patterns cannot recognise a context-free password; fingerprinting closes that gap for any locally seen secret | Accepted |
| ADR-22 | 2026-11-20 | Late events aggregated into a separate deterministic `<metric>#late<n>` partial window rather than dropped or merged | drop late; reopen window | no loss, no payload_id collision; SaaS merges partials (Phase 4/7) | Accepted |
| ADR-23 | 2026-11-20 | Collector ingest processed synchronously under a lock (threadpool) instead of an async queue | asyncio queue | simpler, testable; measured 500 ev/s burst with ~0.4 s overhead | Accepted |
| ADR-24 | 2026-11-20 | System agent measures TCP connect latency/loss (not ICMP); off by default (`AEGIS_COL_SYSTEM_AGENT_ENABLED`) | ICMP ping | ICMP needs admin on Windows; the label stays honest | Accepted |
| ADR-25 | 2026-11-20 | Collector local health is per-window and instantaneous; hysteresis/staleness live in the SaaS health engine | hysteresis on collector | single source of truth for state transitions | Accepted |
