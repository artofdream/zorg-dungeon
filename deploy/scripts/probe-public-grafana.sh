#!/usr/bin/env bash
# Probe the PUBLIC /grafana surface (run from outside the host, e.g. the
# deploy-web runner). Asserts: anonymous dashboard + data queries work; the
# login form, admin UI/API and any credentialed request are refused.
# Usage: probe-public-grafana.sh [base_url]   (default https://zorg.artof.link/grafana)
# Prints only status codes. Uses dummy credentials, never real ones.
set -uo pipefail
B="${1:-https://zorg.artof.link/grafana}"
DASH_UID="${DASH_UID:-zorg-system-overview}"
fail=0
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }
expect() { # expect <label> <allowed codes regex> <curl args...>
  local label="$1" want="$2"; shift 2
  local got; got="$(code "$@")"
  if [[ "$got" =~ ^($want)$ ]]; then echo "ok   $got $label"; else echo "FAIL $got $label (want $want)"; fail=1; fi
}
# Anonymous viewing must keep working.
expect "anon GET /api/health"                      200 "$B/api/health"
expect "anon GET dashboard JSON"                   200 "$B/api/dashboards/uid/$DASH_UID"
expect "anon GET /api/datasources"                 200 "$B/api/datasources"
DS_UID="$(curl -s -m 20 "$B/api/datasources" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["uid"])' 2>/dev/null)"
Q='{"queries":[{"refId":"A","datasource":{"type":"prometheus","uid":"'"$DS_UID"'"},"expr":"up","instant":true}],"from":"now-5m","to":"now"}'
expect "anon POST /api/ds/query"                   200 -X POST -H 'Content-Type: application/json' --data "$Q" "$B/api/ds/query"
frames="$(curl -s -m 20 -X POST -H 'Content-Type: application/json' --data "$Q" "$B/api/ds/query" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["results"]["A"].get("frames",[])))' 2>/dev/null || echo 0)"
if [ "${frames:-0}" -gt 0 ]; then echo "ok   frames=$frames anon query returns data"; else echo "FAIL frames=0 anon query returned no data"; fail=1; fi
# Admin login / admin API must not be reachable publicly.
expect "GET /login (form)"                         '403|404' "$B/login"
expect "POST /login (form submit)"                 '403|404' -X POST -H 'Content-Type: application/json' --data '{"user":"admin","password":"x"}' "$B/login"
expect "basic-auth GET /api/user"                  '401|403|404' -u 'admin:not-the-password' "$B/api/user"
expect "basic-auth GET /api/admin/settings"        '401|403|404' -u 'admin:not-the-password' "$B/api/admin/settings"
expect "bearer GET /api/serviceaccounts/search"    '401|403|404' -H 'Authorization: Bearer glsa_dummy' "$B/api/serviceaccounts/search"
expect "session-cookie GET /api/user"              '401|403|404' -H 'Cookie: grafana_session=dummy' "$B/api/user"
expect "anon POST /api/dashboards/db (write)"      '401|403|404' -X POST -H 'Content-Type: application/json' --data '{}' "$B/api/dashboards/db"
expect "anon DELETE datasource (write)"            '401|403|404' -X DELETE "$B/api/datasources/uid/$DS_UID"
expect "anon GET /admin (UI)"                      '403|404' "$B/admin"
exit $fail
