#!/usr/bin/env bash
# Probe the public site login from outside the host (e.g. the deploy-web
# runner). Asserts: / and /godot/ require the shared credentials; /healthz
# and /grafana/ stay reachable without them; /godot/ still sends
# Cache-Control: no-cache. Usage:
#   ZORG_AUTH_USER=... ZORG_AUTH_PASSWORD=... probe-site-auth.sh [base_url]
# Default base_url is https://zorg.artof.link. Prints only status codes.
# Never prints the password or a hash. Do not pass credentials in the URL.
set -uo pipefail
B="${1:-https://zorg.artof.link}"
B="${B%/}"
fail=0

if [ -z "${ZORG_AUTH_USER:-}" ] || [ -z "${ZORG_AUTH_PASSWORD:-}" ]; then
  echo "::error::ZORG_AUTH_USER and ZORG_AUTH_PASSWORD must be set (repo secrets). Do not invent or commit them."
  exit 1
fi

code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
expect() {
  local label="$1" want="$2"; shift 2
  local got; got="$(code "$@")"
  if [[ "$got" =~ ^($want)$ ]]; then echo "ok   $got $label"; else echo "FAIL $got $label (want $want)"; fail=1; fi
}

# Retry a bit: Caddy may still be coming back after compose up.
ready=0
for i in $(seq 1 20); do
  got="$(code "$B/healthz" || true)"
  if [ "$got" = "200" ] || [ "$got" = "401" ]; then ready=1; break; fi
  echo "waiting for site (try $i, healthz=$got)"
  sleep 6
done
if [ "$ready" != 1 ]; then
  echo "::error::$B is not reachable"
  exit 1
fi

AUTH=(-u "${ZORG_AUTH_USER}:${ZORG_AUTH_PASSWORD}")
expect "no-creds GET /"            401 "$B/"
expect "no-creds GET /godot/"      401 "$B/godot/"
expect "no-creds GET /healthz"     200 "$B/healthz"
expect "no-creds GET /grafana/api/health" 200 "$B/grafana/api/health"
expect "good-creds GET /"          200 "${AUTH[@]}" "$B/"
expect "good-creds GET /godot/"    200 "${AUTH[@]}" "$B/godot/"
expect "bad-creds GET /"           401 -u "${ZORG_AUTH_USER}:not-the-password" "$B/"

cc="$(curl -sI -m 20 "${AUTH[@]}" "$B/godot/" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
if [ "$cc" = "no-cache" ]; then
  echo "ok   /godot/ Cache-Control: no-cache"
else
  echo "FAIL /godot/ Cache-Control='$cc' (want no-cache)"
  fail=1
fi
exit $fail
