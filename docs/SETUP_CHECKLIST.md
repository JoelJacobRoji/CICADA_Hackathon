# AEGIS — Setup Checklist

| Item | Status | Verify |
|---|---|---|
| Python 3.11.9 | READY | `python --version` |
| uv 0.12.3 | READY | `uv --version` |
| Node v26.13.1 / npm 11.20 | READY | `node -v` |
| Git 2.52 | READY | `git --version` |
| Docker Desktop engine 29.7.2 | READY (started 2026-11-20) | `docker info --format "{{.ServerVersion}}"` |
| postgres:16 image | READY (pulled) | `docker image ls postgres` |
| Postgres container (local test/dev) | READY (aegis-pg, 127.0.0.1:55432) | `docker exec aegis-pg pg_isready` |
| Python venv + deps | READY (.venv, 3.11.9) | `uv run python --version` |
| Web deps | READY | `npm --prefix apps/web test` |
| Supabase projects (2 regions, Free) | READY (migrations 0001-0003, demo tenants seeded) | `GET :9001/readyz` |
| Playwright browsers | APPROVED, not installed (Phase 9) | `npx playwright --version` |
| VPS access | READY (ssh alias `incendium`, key auth; read-only so far) | `ssh incendium hostname` |
| TLS (existing nginx + certbot, new server block) | PLANNED (deploy, needs approval) | `curl -vI https://<host>` |
| Official telemetry stream | BLOCKED (pending) | adapter sample ingest |

Secrets: only in git-ignored `.env` files created locally. Never commit them, never paste them into chat.
