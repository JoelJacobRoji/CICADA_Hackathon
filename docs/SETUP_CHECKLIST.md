# AEGIS — Setup Checklist

| Item | Status | Verify |
|---|---|---|
| Python 3.11.9 | READY | `python --version` |
| uv 0.12.3 | READY | `uv --version` |
| Node v26.13.1 / npm 11.20 | READY | `node -v` |
| Git 2.52 | READY | `git --version` |
| Docker Desktop engine 29.7.2 | READY (started 2026-11-20) | `docker info --format "{{.ServerVersion}}"` |
| postgres:16 image | READY (pulled) | `docker image ls postgres` |
| Postgres container | NOT CREATED (Phase 2) | `docker exec aegis-pg pg_isready` |
| Playwright browsers | APPROVED, not installed (Phase 9) | `npx playwright --version` |
| VPS access | PENDING USER INPUT | `ssh <user>@<vps>` |
| TLS (Caddy + Let's Encrypt) | PLANNED (deploy) | `curl -vI https://<host>` |
| Official telemetry stream | BLOCKED (pending) | adapter sample ingest |

Secrets: only in git-ignored `.env` files created locally. Never commit them, never paste them into chat.
