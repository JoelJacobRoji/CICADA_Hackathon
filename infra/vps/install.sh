#!/usr/bin/env bash
# AEGIS SaaS - VPS installer (idempotent). Run as root, one stage at a time:
#   ssh incendium 'bash -s' -- <stage> [args] < infra/vps/install.sh
# Stages: backup | runtime <git_commit> | service | nginx-http | cert <email-or-none> | nginx-https | web | status
# Secrets (/etc/aegis/saas.env) are written separately over SSH stdin, never by this script.
set -euo pipefail

HOST="aegis.162-35-42-114.sslip.io"
REPO="https://github.com/JoelJacobRoji/CICADA_Hackathon.git"
BASE=/opt/aegis
APP=$BASE/app
SITE=/etc/nginx/sites-available/aegis
INFRA="${AEGIS_INFRA:-/root/aegis-infra}"  # uploaded copy of infra/vps (config files)
stage="${1:-status}"

log() { echo "[aegis-install] $*"; }

case "$stage" in
  backup)
    ts=$(date -u +%Y%m%dT%H%M%SZ)
    tar -czf "/root/nginx-backup-$ts.tar.gz" -C / etc/nginx
    log "nginx config backed up to /root/nginx-backup-$ts.tar.gz"
    ;;

  runtime)
    commit="${2:?git commit required}"
    id aegis >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin aegis
    install -d -o aegis -g aegis -m 0755 "$BASE"
    install -d -o root -g aegis -m 0750 /etc/aegis
    if ! command -v /opt/aegis/bin/uv >/dev/null 2>&1; then
      install -d -o aegis -g aegis "$BASE/bin"
      curl -LsSf https://astral.sh/uv/install.sh | \
        sudo -u aegis env UV_INSTALL_DIR="$BASE/bin" INSTALLER_NO_MODIFY_PATH=1 sh >/dev/null
    fi
    if [ ! -d "$APP/.git" ]; then
      sudo -u aegis git clone --quiet "$REPO" "$APP"
    fi
    sudo -u aegis git -C "$APP" fetch --quiet origin
    sudo -u aegis git -C "$APP" -c advice.detachedHead=false checkout --quiet "$commit"
    # SaaS package only (+ contracts). The collector is never installed or run on the VPS.
    sudo -u aegis env HOME="$BASE" UV_PYTHON_INSTALL_DIR="$BASE/python" UV_CACHE_DIR="$BASE/.cache/uv" \
      "$BASE/bin/uv" sync --project "$APP" --package aegis-saas-api --frozen --no-dev --python 3.11 --quiet
    log "runtime ready at commit $(sudo -u aegis git -C "$APP" rev-parse --short HEAD)"
    ;;

  service)
    install -m 0644 "$INFRA/aegis-saas.service" /etc/systemd/system/aegis-saas.service
    systemctl daemon-reload
    systemctl enable --quiet aegis-saas
    systemctl restart aegis-saas
    for _ in $(seq 1 30); do
      curl -fs -o /dev/null http://127.0.0.1:9001/healthz && break
      sleep 1
    done
    log "service: $(systemctl is-active aegis-saas); readyz: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9001/readyz)"
    ;;

  nginx-http)
    install -d -m 0755 /var/www/aegis-acme
    install -m 0644 "$INFRA/nginx-aegis-http.conf" "$SITE"
    ln -sfn "$SITE" /etc/nginx/sites-enabled/aegis
    nginx -t
    systemctl reload nginx
    log "nginx stage 1 (http) live"
    ;;

  cert)
    email="${2:-none}"
    if [ "$email" = "none" ]; then reg=(--register-unsafely-without-email); else reg=(-m "$email"); fi
    /opt/certbot/bin/certbot certonly --webroot -w /var/www/aegis-acme -d "$HOST" \
      --cert-name aegis --agree-tos --non-interactive "${reg[@]}" \
      --deploy-hook "systemctl reload nginx"
    log "certificate issued: /etc/letsencrypt/live/aegis/"
    ;;

  nginx-https)
    cat "$INFRA/nginx-aegis-http.conf" "$INFRA/nginx-aegis-https.conf" > "$SITE"
    nginx -t
    systemctl reload nginx
    log "nginx stage 2 (https) live"
    ;;

  web)
    # Atomic swap of the static dashboard build uploaded to $INFRA/web-dist (built locally from
    # a pushed commit; the VPS has no Node toolchain).
    test -f "$INFRA/web-dist/index.html"
    rm -rf /var/www/aegis-web.new
    cp -r "$INFRA/web-dist" /var/www/aegis-web.new
    chown -R root:root /var/www/aegis-web.new
    find /var/www/aegis-web.new -type d -exec chmod 0755 {} +
    find /var/www/aegis-web.new -type f -exec chmod 0644 {} +
    rm -rf /var/www/aegis-web.old
    [ -d /var/www/aegis-web ] && mv /var/www/aegis-web /var/www/aegis-web.old
    mv /var/www/aegis-web.new /var/www/aegis-web
    log "dashboard deployed ($(cat /var/www/aegis-web/build.txt 2>/dev/null || echo 'no build info'))"
    ;;

  status)
    systemctl is-active aegis-saas || true
    ls -l /etc/nginx/sites-enabled/
    nginx -t 2>&1 | tail -1
    ;;

  *)
    echo "unknown stage: $stage" >&2
    exit 2
    ;;
esac
