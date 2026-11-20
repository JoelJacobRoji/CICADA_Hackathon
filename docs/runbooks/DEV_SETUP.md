# Development Setup Runbook

## 1. Prerequisites
Python 3.11 + uv, Node ≥ 20 (22 LTS recommended; 26 works), Docker Desktop running, Git.

## 2. Local (docker Postgres)
```powershell
uv sync --python 3.11
uv run python scripts/gen-secrets.py
docker compose -f docker-compose.dev.yml --env-file .env up -d
./scripts/migrate.ps1
./scripts/dev.ps1 -NoDb      # or ./scripts/dev.ps1 to do all of the above
```
Automated tests always use this local Postgres (`AEGIS_TEST_DB_ADMIN_URL`). They create and drop throwaway databases, and never touch Supabase.

## 3. Supabase (runtime database for dev/demo)
One Supabase project **per region** gives real regional residency:

| AEGIS region | Supabase region (proposed) |
|---|---|
| `ap-south` | South Asia (Mumbai) `ap-south-1` |
| `eu-west` | Central EU (Frankfurt) `eu-central-1` |

For each project:
1. Dashboard → **Connect** → **Session pooler**. Copy the URI (IPv4, port 5432; user looks like `postgres.<project-ref>`).
2. In `apps/saas-api/.env` (never in chat or git), set:
   - `AEGIS_SAAS_DB_OWNER_URL_<REGION>` = that URI with your DB password, plus `?sslmode=require`
   - `AEGIS_SAAS_DB_APP_URL_<REGION>` = same URI, but user `aegis_app.<project-ref>` and password = `AEGIS_SAAS_DB_APP_PASSWORD`
3. Run `./scripts/migrate.ps1`. It creates the `aegis` schema (not exposed by the Supabase Data API), the `aegis_app` role (no BYPASSRLS), the tables and the RLS policies.
4. Run `./scripts/dev.ps1 -NoDb`, then `GET http://127.0.0.1:9001/readyz` → both regions `ok`.

We use **only Supabase's Postgres**. AEGIS does its own authentication and WebSockets, so Supabase Auth, Realtime and the Data API are not used. Do not put the Supabase `service_role` key anywhere in AEGIS.

## 4. Quality gates
`./scripts/check.ps1` runs ruff, pytest (unit + local-Postgres integration), tsc, ESLint, Vitest (including the Mermaid docs parse), the production build, and the tracked-secrets guard.

## 5. Tenants, operators and collectors (admin CLI, owner connection)
```powershell
uv run python -m saas_api.admin seed-demo --collector-env apps/collector/.env   # acme/initech/globex
uv run python -m saas_api.admin create-user --tenant acme --email you@acme.example --role tenant_admin  # hidden prompt
uv run python -m saas_api.admin register-collector --tenant acme --collector-id col_acme_02 --write-env apps/collector/.env.acme2
uv run python -m saas_api.admin rotate-collector-token --collector-id col_acme_01 --write-env apps/collector/.env
uv run python -m saas_api.admin revoke-collector --collector-id col_acme_02
uv run python -m saas_api.admin reset-password --email ops@acme.example --generate
```
Tokens and generated passwords are written only to git-ignored files and are never printed (except `register-collector` without `--write-env`, which prints the token once).

## 6. Live end-to-end check
```powershell
# terminal 1: SaaS        cd apps/saas-api;  uv run uvicorn saas_api.main:app --port 9001
# terminal 2: collector   cd apps/collector; uv run uvicorn aegis_collector.main:app --port 9100
# terminal 3:
uv run python -m simulator --duration 40 --scenario s1 --scenario s3 --scenario-at 5
uv run python scripts/verify_e2e.py apps/collector/data/collector.db
```
