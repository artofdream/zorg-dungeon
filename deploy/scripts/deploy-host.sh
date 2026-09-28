#!/usr/bin/env bash
# Host-side deploy steps for deploy-web. Runs as root in /opt/zorg AFTER the
# checkout was reset to origin/main and /etc/zorg/grafana.env was written.
# Prints status only; never prints secrets.
set -euo pipefail
cd /opt/zorg
C=(docker compose -f deploy/compose.prod.yaml)

echo "==> build + start web"
"${C[@]}" up -d --build web

echo "==> validate Caddyfile before applying it"
"${C[@]}" run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
  || { echo "::error::Caddyfile failed validation; not applying"; exit 1; }

echo "==> back up grafana.db before applying changes (Grafana upgrades migrate the DB)"
GF_ID="$("${C[@]}" ps -q grafana 2>/dev/null || true)"
if [ -n "$GF_ID" ]; then
  GF_RUNNING_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$GF_ID")"
  GF_DATA_DIR="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Source}}{{end}}{{end}}' "$GF_ID")"
else
  GF_RUNNING_IMAGE=""
  GF_DATA_DIR="$(docker volume inspect -f '{{.Mountpoint}}' deploy_grafana_data 2>/dev/null || true)"
fi
GF_TARGET_IMAGE="$(sed -n 's/^[[:space:]]*image:[[:space:]]*\(grafana\/grafana:[^[:space:]]*\).*/\1/p' deploy/compose.prod.yaml | head -n1)"
python3 deploy/scripts/backup-grafana-db.py "${GF_DATA_DIR:-/nonexistent}/grafana.db" "$GF_RUNNING_IMAGE" "$GF_TARGET_IMAGE"

echo "==> apply compose changes (recreates only services whose config changed)"
"${C[@]}" up -d

echo "==> refresh single-file bind mounts (Caddyfile, prometheus.yml)"
bash deploy/scripts/sync-bind-mounts.sh

echo "==> wait for Grafana on its host-local port"
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:3000/grafana/api/health && break
  sleep 2
done
curl -sf -o /dev/null http://127.0.0.1:3000/grafana/api/health || { echo "::error::Grafana not healthy on 127.0.0.1:3000"; exit 1; }

echo "==> re-apply admin password from the root-only env file (stdin only)"
# GF_SECURITY_ADMIN_PASSWORD only applies when Grafana's DB is first created.
sh -c '. /etc/zorg/grafana.env && printf "%s\n" "$GF_SECURITY_ADMIN_PASSWORD"' \
  | "${C[@]}" exec -T grafana grafana cli admin reset-admin-password --password-from-stdin >/dev/null
echo "admin password re-applied"

echo "==> verify admin login over the host-local port (tunnel path)"
python3 deploy/scripts/grafana_admin.py login-check
echo "grafana_version=$(curl -s http://127.0.0.1:3000/grafana/api/health | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version"))')"

echo "==> persisted logs grow and survive recreation (counts only; logs hold IPs)"
mount_src() { # service, container path -> host dir of its volume
  docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}" "$("${C[@]}" ps -q "$1")"
}
python3 deploy/scripts/log-stats.py check \
  caddy="$(mount_src caddy /var/log/caddy)" grafana="$(mount_src grafana /var/log/grafana)"
