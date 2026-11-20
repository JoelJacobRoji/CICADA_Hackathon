#!/usr/bin/env bash
# AEGIS SaaS - rollback to the pre-Phase-4b server state. Run as root:
#   ssh incendium 'bash -s' -- [--purge] < infra/vps/rollback.sh
# Default: disable the AEGIS site + service (keeps files for inspection).
# --purge: also remove /opt/aegis, /etc/aegis, the aegis user and the AEGIS certificate.
# Never touches any other nginx site, certificate or service.
set -euo pipefail

rm -f /etc/nginx/sites-enabled/aegis
nginx -t
systemctl reload nginx
systemctl disable --now aegis-saas 2>/dev/null || true
echo "[aegis-rollback] AEGIS site disabled and service stopped; other sites untouched"

if [ "${1:-}" = "--purge" ]; then
  rm -f /etc/systemd/system/aegis-saas.service /etc/nginx/sites-available/aegis
  systemctl daemon-reload
  /opt/certbot/bin/certbot delete --cert-name aegis --non-interactive 2>/dev/null || true
  rm -rf /opt/aegis /etc/aegis /var/www/aegis-acme /var/www/aegis-web /var/www/aegis-web.old
  id aegis >/dev/null 2>&1 && userdel aegis
  echo "[aegis-rollback] purged"
fi
