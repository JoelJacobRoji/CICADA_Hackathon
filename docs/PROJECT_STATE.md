# AEGIS — Project State

- **Current phase:** 3 (Collector & Privacy): complete, awaiting user review
- **Last approved phase:** 3 (approved 2026-11-20)
- **Next gate:** Pre-phase checkpoint for Phase 4 (requires `APPROVE PHASE 4`)
- **Git:** repo `JoelJacobRoji/CICADA_Hackathon` (origin/main = Phase 1 docs). Phase 2 + 3 work is UNCOMMITTED. **Do not commit/push until the user says so.**
- **Database:** Supabase (ADR-18, Free plan) at runtime: `aegis-ap-south` (Mumbai) + `aegis-eu-west` (Frankfurt), migration 0001 applied and verified 2026-11-20. Local docker `aegis-pg` (127.0.0.1:55432) used by automated tests only.
- **Hackathon clock:** started ≈ 1 h before Phase 1 began on 2026-11-20
- **Product code:** contracts; SaaS skeleton (+RLS); collector pipeline complete up to the outbox (adapters, scrubber, pseudonyms, 2 s windows, local health, auth detector, canary + fingerprints, hash-chained ledger, local console API, retention); dev simulator with S1/S3/S4/S5/S6. No sender, no ingest, no UI yet.
- **Environment:** Docker Desktop running; container `aegis-pg` running; `.venv` (Python 3.11.9) + `apps/web/node_modules` installed; `.env` files generated locally (git-ignored)

## VPS facts (read-only inspection, 2026-11-20)
- `162.35.42.114` (SSH alias `incendium`, key auth, root), Ubuntu 24.04.5, 2 vCPU, 5.8 GiB RAM (4.9 available), 104 GB free disk, Python 3.12.3
- Existing app: nginx (80/443, `server_name _` default_server, LE IP cert `incendium-ip`) → gunicorn 127.0.0.1:5000
- ufw active: OpenSSH + Nginx Full only. Docker NOT installed. Postgres NOT installed. Caddy not used.
- SSH access authorised by user for this project. Inspection so far was read-only; no changes made.

## Pending user inputs
- Approval of VPS deployment approach (hostname, Docker install, nginx server block): asked at Phase 2 checkpoint
- Official organizer telemetry stream (to be supplied later → adapter integration)

## Docs index
See `docs/requirements/`, `docs/architecture/`, `docs/security/`, `docs/judging/`, `docs/DECISIONS.md`.
