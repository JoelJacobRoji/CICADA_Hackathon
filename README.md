# AEGIS: Privacy-First Autonomous Intelligence & Observability

CICADA 2026 · Secure AIOps observability. A two-tier design: a **local collector** keeps raw telemetry inside the customer environment, and a **multi-tenant SaaS** receives allow-listed metadata only.

> Status: **Phase 2 (foundation)**. The services start and are tested. No observability features exist yet. See `docs/PROJECT_STATE.md`.

## Layout
```text
apps/collector     Tier 1 local collector (FastAPI + SQLite WAL). Binds to loopback only.
apps/saas-api      Tier 2 SaaS API (FastAPI + Postgres with RLS; Supabase at runtime)
apps/web           Operator UI (React + TS + Vite + Tailwind)
packages/contracts Shared Pydantic contracts. outbound.py is the egress allow-list.
tests/architecture Tier-boundary tests
infra/             DB init scripts (later: deploy)
scripts/           dev.ps1, check.ps1, migrate.ps1, gen-secrets.py
docs/              Requirements, architecture, security, judging evidence
```

## Quick start (Windows PowerShell)
```powershell
uv run python scripts/gen-secrets.py   # writes git-ignored .env files; prints no secrets
./scripts/dev.ps1                      # Postgres (docker) + migrations + 3 services
./scripts/check.ps1                    # lint, types, tests, build, secrets guard
```
To use Supabase, see `docs/runbooks/DEV_SETUP.md` §3. Then run `./scripts/dev.ps1 -NoDb` after `./scripts/migrate.ps1`.

## Ports
SaaS 9001 · Collector 9100 (loopback) · Web 5180 · local Postgres 55432 (loopback).

> ⚠️ This folder is inside OneDrive. **Keep sync paused.** Syncing can corrupt the collector's SQLite files. Alternatively, set `AEGIS_COL_DB_PATH` to a path outside OneDrive.
