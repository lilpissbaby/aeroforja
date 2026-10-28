#!/usr/bin/env bash
# Deploys or updates AeroForja on the VPS (docker-modular-infra layout).
#
#   First time:  git clone <repo> /opt/homelab/apps/aeroforja
#                cd /opt/homelab/apps/aeroforja && ./docker/vps/deploy.sh
#   Updates:     the same command; it pulls, rebuilds and restarts.
#
# INFRA_DIR is where docker-modular-infra lives (nginx/conf.d inside it);
# by default /opt/homelab/infra, or ~/infra if that is where it is.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -z "${INFRA_DIR:-}" ]]; then
  if [[ -d /opt/homelab/infra/nginx/conf.d ]]; then INFRA_DIR=/opt/homelab/infra; else INFRA_DIR="$HOME/infra"; fi
fi
[[ -d "$INFRA_DIR/nginx/conf.d" ]] || {
  echo "[error] $INFRA_DIR/nginx/conf.d not found; run with INFRA_DIR=/path/to/infra" >&2
  exit 1
}
CONF_SRC="$APP_DIR/docker/vps/aeroforja.conf"
CONF_DST="$INFRA_DIR/nginx/conf.d/aeroforja.conf"

cd "$APP_DIR"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git pull --ff-only
fi

docker network inspect proxy_network >/dev/null 2>&1 || {
  echo "[error] proxy_network does not exist: start the infra stack first." >&2
  exit 1
}

# The image build runs the type checks and the physics validation tests.
docker compose -f docker/docker-compose.vps.yml up -d --build

if [[ ! -f "$CONF_DST" ]]; then
  cp "$CONF_SRC" "$CONF_DST"
  echo "[ok] nginx conf copied to $CONF_DST"
elif ! cmp -s "$CONF_SRC" "$CONF_DST"; then
  echo "[warn] $CONF_DST differs from the repo version; left as it is."
fi

docker exec reverse_proxy nginx -t
docker exec reverse_proxy nginx -s reload
docker exec reverse_proxy wget -qO- http://aeroforja/healthz >/dev/null && echo "[ok] reverse_proxy reaches aeroforja"
echo "[ok] https://aeroforja.tenebrum.online (DNS: A record aeroforja → VPS IP)"
