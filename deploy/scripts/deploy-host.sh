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

echo "==> stage /etc/zorg/grafana.env (admin password + secret_key)"
# deploy-web writes the new env to grafana.env.new (root 0600, via SSH stdin).
# A changed GF_SECURITY_SECRET_KEY is only applied if Grafana stores no
# secrets encrypted with the old key (otherwise they would become unreadable).
ENV_CUR=/etc/zorg/grafana.env
ENV_NEW=/etc/zorg/grafana.env.new
KEY_CHANGED=0
if [ -f "$ENV_NEW" ]; then
  if ! cmp -s <(grep '^GF_SECURITY_SECRET_KEY=' "$ENV_NEW" || true) <(grep '^GF_SECURITY_SECRET_KEY=' "$ENV_CUR" 2>/dev/null || true); then
    KEY_CHANGED=1
    echo "secret_key: changes on this deploy (value not shown)"
    if [ -n "$GF_ID" ]; then
      echo "re-verify: no stored secrets encrypted with the current key"
      python3 deploy/scripts/grafana_admin.py stored-secrets \
        || { rm -f "$ENV_NEW"; echo "::error::Grafana has stored secrets (or the check failed); NOT switching secret_key"; exit 1; }
    fi
  else
    echo "secret_key: unchanged"
  fi
  install -m 600 -o root -g root "$ENV_NEW" "$ENV_CUR"
  rm -f "$ENV_NEW"
fi

echo "==> apply compose changes (recreates only services whose config changed)"
"${C[@]}" up -d

echo "==> refresh single-file bind mounts (Caddyfile, prometheus.yml)"
bash deploy/scripts/sync-bind-mounts.sh

if [ "$KEY_CHANGED" = 1 ]; then
  echo "==> recreate Grafana with the new secret_key"
  "${C[@]}" up -d --force-recreate --no-deps grafana
fi

wait_grafana() {
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null http://127.0.0.1:3000/grafana/api/health && return 0
    sleep 2
  done
  echo "::error::Grafana not healthy on 127.0.0.1:3000"; exit 1
}
echo "==> wait for Grafana on its host-local port"
wait_grafana

echo "==> re-apply admin password from the root-only env file (stdin only)"
# GF_SECURITY_ADMIN_PASSWORD only applies when Grafana's DB is first created.
sh -c '. /etc/zorg/grafana.env && printf "%s\n" "$GF_SECURITY_ADMIN_PASSWORD"' \
  | "${C[@]}" exec -T grafana grafana cli admin reset-admin-password --password-from-stdin >/dev/null
echo "admin password re-applied"

echo "==> verify admin login over the host-local port (tunnel path)"
python3 deploy/scripts/grafana_admin.py login-check
if [ "$KEY_CHANGED" = 1 ]; then
  echo "==> secret_key switched: rotate data keys, re-encrypt, restart, re-check"
  python3 deploy/scripts/grafana_admin.py rotate-keys
  "${C[@]}" restart grafana
  wait_grafana
  python3 deploy/scripts/grafana_admin.py login-check
  python3 deploy/scripts/grafana_admin.py stored-secrets || true
fi
echo "grafana_version=$(curl -s http://127.0.0.1:3000/grafana/api/health | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version"))')"

echo "==> persisted logs grow and survive recreation (counts only; logs hold IPs)"
mount_src() { # service, container path -> host dir of its volume
  docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}" "$("${C[@]}" ps -q "$1")"
}
python3 deploy/scripts/log-stats.py check \
  caddy="$(mount_src caddy /var/log/caddy)" grafana="$(mount_src grafana /var/log/grafana)"

echo "==> Caddy admin API (:2019) not reachable from other containers"
# Read-only probes from inside the Grafana container: the metrics listener must
# answer (proves the client works), the admin API must not.
"${C[@]}" exec -T grafana sh -c '
  get() { if command -v wget >/dev/null 2>&1; then wget -q -T 5 -O /dev/null "$1";
          elif command -v curl >/dev/null 2>&1; then curl -sf -m 5 -o /dev/null "$1";
          else echo "no-http-client"; return 2; fi; }
  get http://caddy:9180/metrics; m=$?
  get http://caddy:2019/config/; a=$?
  echo "from_grafana: caddy:9180/metrics exit=$m caddy:2019/config exit=$a"
  [ "$m" = 0 ] && [ "$a" != 0 ] && [ "$a" != 2 ]' \
  && echo "caddy_admin_isolated=yes" \
  || { echo "::error::Caddy admin API reachable from Grafana (or probe inconclusive)"; exit 1; }

echo "==> Prometheus still scrapes Caddy metrics"
for _ in $(seq 1 12); do
  UP="$("${C[@]}" exec -T prometheus wget -qO- 'http://localhost:9090/api/v1/query?query=up%7Bjob%3D%22caddy%22%2Cinstance%3D%22caddy%3A9180%22%7D' 2>/dev/null \
    | python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "none")' 2>/dev/null || echo none)"
  [ "$UP" = 1 ] && break
  sleep 5
done
echo "prometheus_caddy_up=$UP"
[ "$UP" = 1 ] || { echo "::error::Prometheus cannot scrape caddy:9180"; exit 1; }
