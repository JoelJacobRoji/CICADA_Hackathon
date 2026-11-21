# AEGIS — Project State

- **Current phase:** 8 partial: Privacy Glass (M3) done and deployed (24cbdce, 2026-11-21); 9 and 10 complete
- **Last approved phase:** 6 (approved 2026-11-20). **Phase 8 Privacy Glass approved and built 2026-11-21; other Phase 7-8 items deferred by user decision** (implement after the 2026-11-21 09:00 evaluation); next: demo/validation (9-10) on request
- **Evaluation:** 2026-11-21 09:00 - criteria: functional product, two-tier (frontend + backend + DB), AI engine, security. Demo: `scripts/demo.ps1` + `docs/DEMO_SCRIPT.md`
- **Git / deployed:** backend 24cbdce on the VPS (Privacy Glass receipt endpoint); dashboard unchanged since f8f1920 (build.txt). Live e2e 11/11 on f8f1920; re-run on 24cbdce pending (first run invalid: a demo session was running). **The user commits and pushes; never commit/push without being told.**
- **Database:** Supabase (ADR-18, Free plan): `aegis-ap-south` (Mumbai) + `aegis-eu-west` (Frankfurt), both at migration 0005 (verified: RLS + policies on all tenant tables, aegis_app no DELETE). Local docker `aegis-pg` (127.0.0.1:55432) for automated tests only.
- **LLM:** Gemini (free tier) key in apps/saas-api/.env and VPS /etc/aegis/saas.env (root:aegis 0640); enabled for ap-south only (eu-west disabled: residency)
- **Hackathon clock:** started ≈ 1 h before Phase 1 began on 2026-11-20
- **Product code:** collector (pipeline, privacy, ledger, sender, heartbeat, device-alert pull + local webhook); SaaS (ingest, tenancy/RLS, auth, health engine, AIOps engine, incidents API, notifications, grounded Gemini explanations, WebSocket); dashboard (overview, fleet, metrics, security, incident center + detail, security & privacy); simulator S1/S3/S4/S5/S6 with timed scenarios.
- **Environment:** Docker Desktop running; container `aegis-pg` running; `.venv` (Python 3.11.9) + `apps/web/node_modules` installed; `.env` files generated locally (git-ignored)

## VPS facts (read-only inspection, 2026-11-20)
- `162.35.42.114` (SSH alias `incendium`, key auth, root), Ubuntu 24.04.5, 2 vCPU, 5.8 GiB RAM (4.9 available), 104 GB free disk, Python 3.12.3
- Existing app: nginx (80/443, `server_name _` default_server, LE IP cert `incendium-ip`) → gunicorn 127.0.0.1:5000
- ufw active: OpenSSH + Nginx Full only. Docker NOT installed. Postgres NOT installed. Caddy not used.
- SSH access authorised by user for this project. Inspection so far was read-only; no changes made.

## Pending user inputs
- Approval of VPS deployment approach (hostname, Docker install, nginx server block): asked at Phase 2 checkpoint
- (resolved) Organizers provide no dataset: the simulator is the official data source

## Docs index
See `docs/requirements/`, `docs/architecture/`, `docs/security/`, `docs/judging/`, `docs/DECISIONS.md`.

## Demo tenants (Supabase, seeded 2026-11-20)
| Tenant | Region | Collector | Operator(s) |
|---|---|---|---|
| acme | ap-south (Mumbai) | col_acme_01 (token in apps/collector/.env) | ops@acme.example, admin@acme.example |
| initech | ap-south (Mumbai) | col_initech_01 (token in apps/collector/.env.initech) | ops@initech.example |
| globex | eu-west (Frankfurt) | col_globex_01 (token in apps/collector/.env.globex) | ops@globex.example |

Operator passwords: `apps/saas-api/.demo-operators.local` (git-ignored; latest line per email wins). Reset with `uv run python -m saas_api.admin reset-password --email <e> --generate`.

## Deployment (Phase 4b, 2026-11-20)
- SaaS live at `https://aegis.162-35-42-114.sslip.io` (VPS 162.35.42.114, US; systemd `aegis-saas`; nginx site `aegis`; LE cert `aegis`), commit ee93a35. Runbook: `docs/runbooks/VPS_DEPLOY.md`.
- Laptop collector `AEGIS_COL_SAAS_BASE_URL` now points at the VPS.
- The other VPS app is untouched (verified before/after).

## Dashboard (Phase 5)
- `https://aegis.162-35-42-114.sslip.io/` - sign in with a demo operator from `apps/saas-api/.demo-operators.local`.
- Release: `./scripts/release-web.ps1` (clean tree required; writes build.txt). Backend: `install.sh runtime <commit>` + `service`.
- Live e2e: `uv run python scripts/e2e_live.py` (starts collector + simulator, stops collector for the offline check).
