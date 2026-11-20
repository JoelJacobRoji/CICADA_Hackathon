# VPS Deployment Runbook (Tier 2 SaaS)

**Live:** `https://aegis.162-35-42-114.sslip.io` → nginx (TLS 1.2/1.3, Let's Encrypt) → `127.0.0.1:9001` (uvicorn, systemd `aegis-saas`) → Supabase (ap-south Mumbai / eu-west Frankfurt).
Deployed 2026-11-20 from commit `ee93a35` (CI green). The VPS also hosts another app (nginx `default_server` → gunicorn :5000). AEGIS is **additive** and does not modify that site.

## What lives where on the VPS

| Path | Purpose | Owner / mode |
|---|---|---|
| `/opt/aegis/app` | git clone pinned to a commit; `.venv` holds **only** `aegis-saas-api` + contracts (collector not installed) | aegis |
| `/opt/aegis/bin/uv`, `/opt/aegis/python` | uv + managed CPython 3.11 (system Python 3.12 untouched) | aegis |
| `/etc/aegis/saas.env` | runtime secrets: **app-role** Supabase URLs, VPS-only JWT key, prod flags. **No owner URLs** (migrations/admin run from the laptop) | root:aegis 0640 |
| `/etc/systemd/system/aegis-saas.service` | hardened unit (see infra/vps/aegis-saas.service) | root |
| `/etc/nginx/sites-available/aegis` (+ symlink in sites-enabled) | AEGIS server blocks only | root |
| `/etc/letsencrypt/live/aegis/` | certificate (webroot), renewed by the existing root cron; global `reload-nginx` deploy hook | root |
| `/root/aegis-infra/` | uploaded copy of `infra/vps/*` used by the installer | root 0700 |
| `/root/nginx-backup-20261120T135954Z.tar.gz` | pre-change backup of /etc/nginx | root |

## Install / update (from the laptop, Git Bash)
```bash
scp infra/vps/* incendium:/root/aegis-infra/
ssh incendium 'bash /root/aegis-infra/install.sh backup'
ssh incendium 'bash /root/aegis-infra/install.sh runtime <commit>'   # clone/checkout + uv sync (SaaS only)
# secrets: written over SSH stdin from apps/saas-api/.env (see Phase 4b log); never echoed
ssh incendium 'bash /root/aegis-infra/install.sh service'            # systemd (re)start + local readyz
ssh incendium 'bash /root/aegis-infra/install.sh nginx-http'         # first install only
ssh incendium 'bash /root/aegis-infra/install.sh cert none'          # first install only
ssh incendium 'bash /root/aegis-infra/install.sh nginx-https'
```
To deploy new code, run `runtime <new-commit>` and then `service`. Run any schema migrations from the laptop **first**.

## Rollback
```bash
ssh incendium 'bash -s' < infra/vps/rollback.sh            # disable site + stop service
ssh incendium 'bash -s' -- --purge < infra/vps/rollback.sh # also remove files, user, AEGIS cert
```
It never touches the other site, its certificate or its service.

## Operations
```bash
ssh incendium 'systemctl status aegis-saas --no-pager; journalctl -u aegis-saas -n 50 --no-pager'
curl -s https://aegis.162-35-42-114.sslip.io/readyz
```
The collector points at the VPS via `AEGIS_COL_SAAS_BASE_URL=https://aegis.162-35-42-114.sslip.io` in `apps/collector/.env`.

## Dashboard (Phase 5)
- Static build served from `/var/www/aegis-web` (atomic swap; previous build kept as `/var/www/aegis-web.old`).
- Release from a clean, pushed commit: `./scripts/release-web.ps1` (writes `build.txt`; check `https://aegis.162-35-42-114.sslip.io/build.txt`).
- nginx: `/` serves the SPA (no-cache), `/assets/` cached 1 y, `/api/*`, `/api/v1/ws`, `/healthz`, `/readyz` proxied to `127.0.0.1:9001`. CSP, HSTS, nosniff, X-Frame-Options and Referrer-Policy on every response.
