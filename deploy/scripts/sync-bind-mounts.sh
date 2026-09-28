#!/usr/bin/env bash
# Recreate services whose single-file bind mounts changed on the host.
# `git reset --hard` replaces files (new inode), but a Docker single-file bind
# mount keeps pointing at the old inode, so a running container would keep
# serving the old config until it is recreated. Runs as root in /opt/zorg.
set -euo pipefail
cd /opt/zorg
C=(docker compose -f deploy/compose.prod.yaml)
check() { # <service> <host file> <path in container>
  local svc="$1" host="$2" inner="$3" cid want have
  cid="$("${C[@]}" ps -q "$svc" 2>/dev/null || true)"
  if [ -z "$cid" ]; then echo "$svc: not running"; return 0; fi
  want="$(sha256sum "$host" | cut -d' ' -f1)"
  have="$(docker exec "$cid" cat "$inner" 2>/dev/null | sha256sum | cut -d' ' -f1)"
  if [ "$want" != "$have" ]; then
    echo "$svc: $inner changed -> recreate"
    "${C[@]}" up -d --force-recreate --no-deps "$svc"
  else
    echo "$svc: $inner unchanged"
  fi
}
check caddy deploy/Caddyfile /etc/caddy/Caddyfile
check prometheus deploy/prometheus/prometheus.yml /etc/prometheus/prometheus.yml
