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
