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
| ADR-14 | 2026-11-20 | SaaS on user's VPS via Docker Compose + Caddy TLS; local Compose fallback | managed PaaS | real network trust boundary; no new accounts | Proposed (pending VPS facts) |
| ADR-15 | 2026-11-20 | React + TS + Vite + Tailwind + ECharts + React Flow + Motion | Recharts, Cytoscape | performance + fit | Proposed |
| ADR-16 | 2026-11-20 | Workspace remains in OneDrive folder with sync paused | C:\dev | user decision; risk noted in KNOWN_ISSUES | Accepted (user) |
| ADR-17 | 2026-11-20 | Ports: PG 55432, saas-api 9001, collector 9100, web 5180 | defaults | 5173/8080/8443 occupied on laptop | Proposed |
