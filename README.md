# AEGIS: Privacy-First Autonomous Intelligence & Observability

CICADA 2026 · Secure AIOps observability. A two-tier design: a **local collector** keeps raw telemetry inside the
customer environment, and a **multi-tenant SaaS** receives allow-listed, pseudonymous metadata only. It turns that metadata into
four-state health, correlated incidents and grounded AI explanations.

**Live:** https://aegis.162-35-42-114.sslip.io · **Data:** SYNTHETIC for 9 sources, from the AEGIS simulator (the organizers
provide no dataset, so it is the official source), plus **REAL** host metrics from the collector laptop (system agent:
CPU, memory, disk, bandwidth, TCP-probe latency/loss; shown in the cloud only as a `src_…` pseudonym).
**Diversified REAL sources** (opt-in, `scripts/setup_real_sources.py`): storage (system disk IOPS/latency), database
(local PostgreSQL via a read-only role) and a web application (`scripts/demo_webapp.py` + real traffic) — see the Data tier page.

> Status: Phases 1–6 and 9 complete and deployed; Phase 10 materials ready. Phase 8: Privacy Glass (M3) done;
> other Phase 7–8 extras deferred.
> Validation: `docs/VALIDATION_REPORT.md`. Demo: `docs/DEMO_SCRIPT.md`. Judge Q&A: `docs/judging/QA.md`.

## What it does (all verified live)
- **Privacy:**
  - raw logs, secrets and real names stay on the collector
  - **0 leaks** across all SaaS tables
  - collector ledger SHA-256 equals what the SaaS stored, for **3,231 / 3,231** payloads
  - **Privacy Glass** (collector-local page): raw → masked → exact outbound JSON + SHA-256 → live SaaS
    receipt hash for any payload, plus a leak scan of every sent payload
  - **Egress receipts** page in the dashboard: the SHA-256 the cloud computed for every recent payload, plus ingest batches
- **AI engine:**
  - robust baselines (caught a CPU change the static threshold missed: z ≈ 30)
  - trend early warning (30 s before the threshold breaks)
  - dependency-aware correlation (**18 alerts → 1 incident**) with probable cause and a cited playbook,
    shown on a dependency graph in each incident's investigation view
  - Gemini explanations that must pass a grounding check
  - 0 false incidents in 100 clean minutes
- **Device alerts:** incidents are pulled by the collector over its outbound connection, re-identified locally, and delivered to a local webhook.
- **Security:** 49/49 live checks:
  - TLS and HSTS
  - argon2id passwords and rate-limited login
  - httpOnly SameSite=Strict sessions
  - row-level security per tenant
  - regional tokens (EU tenants never sent to the LLM)
  - strict CSP
- **Reliability and speed:**
  - after a SaaS outage, **1,837 / 1,837** delivered with 0 lost and 0 duplicated
  - p95 event → cloud 5.2 s; breach → alert 5.7 s; offline detected in ≤ 36 s

## Layout
```text
apps/collector     Tier 1 local collector (FastAPI + SQLite WAL), loopback only: pipeline, privacy, ledger, sender, device alerts, Privacy Glass
apps/saas-api      Tier 2 SaaS (FastAPI + PostgreSQL/Supabase with RLS): ingest, health, AIOps, LLM, incidents, WebSocket
apps/web           Operator dashboard (React + TS + Vite + Tailwind)
packages/contracts Shared Pydantic contracts; outbound.py is the egress allow-list
simulator/         Synthetic telemetry + scenarios S1, S3, S4, S5, S6 (NAME@SECONDS scheduling)
config/            health_thresholds.yaml, aiops.yaml, inventory.yaml
tests/             architecture (tier boundaries, runtime deps) and system (real pipeline -> AIOps) tests
infra/vps/         systemd + nginx + installer for the VPS
scripts/           check.ps1, demo.ps1, e2e_live.py, verify_e2e.py, validate_security.py, release-web.ps1, ...
docs/              requirements, architecture, security, decisions, test results, judging evidence
```

## Quick start (Windows PowerShell)
```powershell
uv run python scripts/gen-secrets.py   # writes git-ignored .env files; prints no secrets
./scripts/check.ps1                    # lint, types, 238 Python tests x2 (normal + CI parity), web tests, build
./scripts/demo.ps1                     # live demo: device webhook + collector (-> deployed SaaS) + timed scenarios
./scripts/glass.ps1                    # open Privacy Glass (http://127.0.0.1:9100/glass); token to clipboard, not shown
```
Local development stack: `./scripts/dev.ps1` (see `docs/runbooks/DEV_SETUP.md`). VPS operations: `docs/runbooks/VPS_DEPLOY.md`.

## Ports
SaaS 9001 · Collector 9100 (loopback) · demo webhook 9200 (loopback) · Web 5180 · local Postgres 55432 (loopback).

> ⚠️ This folder is inside OneDrive. **Keep sync paused**: syncing can corrupt the collector's SQLite files.
