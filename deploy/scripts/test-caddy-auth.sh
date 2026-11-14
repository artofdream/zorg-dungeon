#!/usr/bin/env bash
# Local/CI probe of the shared site login in deploy/Caddyfile.
# Starts Caddy with a throwaway test user/hash (never a production secret),
# then checks:
#   - / and /godot/ return 401 without credentials and 200 with them
#   - /grafana* and /healthz stay reachable without credentials
#   - /godot/ still sends Cache-Control: no-cache
#   - an empty hash makes Caddy refuse to start (fail-closed, not open)
# Does not print the password or the bcrypt hash.
# Prefers docker image caddy:2-alpine (same as compose.prod.yaml).
# Without Docker, uses $CADDY or `caddy` on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CADDYFILE_PROD="$ROOT/deploy/Caddyfile"
IMAGE="${CADDY_IMAGE:-caddy:2-alpine}"
# Throwaway credentials for this probe only. Not a production secret.
TEST_USER=probe
TEST_PASS=test-pass-only-for-caddy-auth-ci

need() { command -v "$1" >/dev/null 2>&1 || { echo "::error::$1 is required"; exit 1; }; }
need curl
need python3
need awk

if [ ! -f "$CADDYFILE_PROD" ]; then
  echo "::error::missing $CADDYFILE_PROD"
  exit 1
fi

# The test Caddyfile must use the same basic_auth snippet as production.
SNIPPET="$(awk '/# BEGIN site_basic_auth$/,/# END site_basic_auth$/' "$CADDYFILE_PROD")"
if ! printf '%s\n' "$SNIPPET" | grep -q 'basic_auth @site_login'; then
  echo "::error::could not extract site_basic_auth from deploy/Caddyfile"
  exit 1
fi

redact() { python3 -c 'import re,sys; print(re.sub(r"\$2[abxy]\$\d+\$[A-Za-z0-9./]+","<bcrypt-redacted>",sys.stdin.read()), end="")'; }

WORKDIR="$(mktemp -d)"
cleanup() {
  if [ -n "${CID:-}" ]; then docker rm -f "$CID" >/dev/null 2>&1 || true; fi
  if [ -n "${CPID:-}" ]; then kill "$CPID" >/dev/null 2>&1 || true; wait "$CPID" 2>/dev/null || true; fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkdir -p "$WORKDIR/godot/current" "$WORKDIR/web"
printf 'godot-ok\n' > "$WORKDIR/godot/current/index.html"
printf 'web-ok\n' > "$WORKDIR/web/index.html"

# Tiny HTTP backend that records whether Authorization was forwarded.
# Used as a stand-in for Grafana so we can check the header is stripped.
python3 - "$WORKDIR" << 'PY' &
import http.server, sys, os
root = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        auth = self.headers.get("Authorization", "")
        body = ("grafana-ok auth=" + auth).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        return
if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 0), H).server_close()
# bind explicitly and write the port
httpd = http.server.HTTPServer(("0.0.0.0", 0), H)
with open(os.path.join(root, "gf.port"), "w") as f:
    f.write(str(httpd.server_address[1]))
httpd.serve_forever()
PY
GFPY=$!
for _ in $(seq 1 50); do
  [ -s "$WORKDIR/gf.port" ] && break
  sleep 0.05
done
GF_PORT="$(cat "$WORKDIR/gf.port")"

# Build a test Caddyfile: same auth snippet, local :80, stub backends.
# grafana_public is simplified only enough to exercise the Authorization
# rules we care about (anonymous 200, bearer 403, basic stripped).
cat > "$WORKDIR/Caddyfile" << CADDY
{
    auto_https off
    admin off
}
$SNIPPET
:80 {
    import site_basic_auth
    handle /grafana* {
        route {
            @gf_bearer header_regexp Authorization (?i)^Bearer\\s
            respond @gf_bearer 403
            @gf_session_cookie header_regexp Cookie (^|;\\s*)grafana_session=
            respond @gf_session_cookie 403
            request_header -Authorization
            reverse_proxy 127.0.0.1:$GF_PORT
        }
    }
    handle /healthz {
        respond "OK" 200
    }
    handle /healthz/ {
        respond "OK" 200
    }
    redir /godot /godot/ 308
    handle_path /godot/* {
        root * /srv/godot/current
        header Cache-Control "no-cache"
        file_server
    }
    handle /* {
        root * /srv/web
        file_server
    }
}
CADDY

hash_password() {
  # Read the password from stdin. Never put it on a command line.
  if [ "${USE_DOCKER:-}" = 1 ]; then
    docker run --rm -i "$IMAGE" caddy hash-password
  else
    "$CADDY_BIN" hash-password
  fi
}

# Detect runner.
USE_DOCKER=0
CADDY_BIN="${CADDY:-}"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  USE_DOCKER=1
  docker pull -q "$IMAGE" >/dev/null
  echo "using docker $IMAGE"
elif [ -n "$CADDY_BIN" ] && [ -x "$CADDY_BIN" ]; then
  echo "using CADDY=$CADDY_BIN"
elif command -v caddy >/dev/null 2>&1; then
  CADDY_BIN="$(command -v caddy)"
  echo "using caddy at $CADDY_BIN"
else
  echo "::error::need docker ($IMAGE) or a caddy binary (set CADDY=)"
  exit 1
fi

HASH="$(printf '%s\n' "$TEST_PASS" | hash_password | tr -d '\r\n')"
if [ "${#HASH}" -lt 40 ] || [ "${HASH#\$2}" = "$HASH" ]; then
  echo "::error::caddy hash-password did not return a bcrypt hash"
  exit 1
fi
# Never print HASH. Length only.
echo "hash_len=${#HASH}"

pick_port() {
  python3 - << 'PY'
import socket
s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()
PY
}

rewrite_caddyfile() { # src dest port workdir
  python3 - "$1" "$2" "$3" "$4" << 'PY'
import sys
src, dst, port, workdir = sys.argv[1:5]
text = open(src, encoding="utf-8").read()
text = text.replace(":80 {", f":{port} {{", 1)
text = text.replace("/srv/web", f"{workdir}/web")
text = text.replace("/srv/godot/current", f"{workdir}/godot/current")
open(dst, "w", encoding="utf-8").write(text)
PY
}

start_caddy() {
  local user="$1" hash="$2"
  local log="$WORKDIR/caddy.log"
  : > "$log"
  PORT="$(pick_port)"
  if [ "$USE_DOCKER" = 1 ]; then
    # Extra hosts so the in-container reverse_proxy can reach the host
    # Grafana stub. Hash is passed as an env value, not on docker's
    # printed command line beyond the usual -e (do not echo it).
    CID="$(docker run -d --rm \
      --add-host "host.docker.internal:host-gateway" \
      -e "ZORG_AUTH_USER=$user" \
      -e "ZORG_AUTH_HASH=$hash" \
      -v "$WORKDIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
      -v "$WORKDIR/web:/srv/web:ro" \
      -v "$WORKDIR/godot/current:/srv/godot/current:ro" \
      -p "127.0.0.1:${PORT}:80" \
      "$IMAGE")"
    # When running in Docker, point grafana proxy at the host. Rewrite
    # the Caddyfile only for this docker case.
    # (The file already has 127.0.0.1:GF_PORT, which is the host, not
    # visible inside the container.) Rebuild is handled below if needed.
  else
    export ZORG_AUTH_USER="$user" ZORG_AUTH_HASH="$hash"
    # Listen on the picked port and point file roots at the workdir
    # (Docker uses /srv/... bind mounts instead).
    rewrite_caddyfile "$WORKDIR/Caddyfile" "$WORKDIR/Caddyfile.local" "$PORT" "$WORKDIR"
    "$CADDY_BIN" run --config "$WORKDIR/Caddyfile.local" --adapter caddyfile >"$log" 2>&1 &
    CPID=$!
  fi
}

stop_caddy() {
  if [ -n "${CID:-}" ]; then docker rm -f "$CID" >/dev/null 2>&1 || true; CID=; fi
  if [ -n "${CPID:-}" ]; then kill "$CPID" >/dev/null 2>&1 || true; wait "$CPID" 2>/dev/null || true; CPID=; fi
}

# Docker cannot reach 127.0.0.1:GF_PORT inside the container. Rewrite the
# grafana upstream to host.docker.internal when using Docker.
if [ "$USE_DOCKER" = 1 ]; then
  sed -i "s#reverse_proxy 127.0.0.1:$GF_PORT#reverse_proxy host.docker.internal:$GF_PORT#" "$WORKDIR/Caddyfile"
fi

wait_http() {
  local url="$1" timeout="${2:-25}"
  local i code
  for i in $(seq 1 "$timeout"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 1 "$url" || true)"
    if [ "$code" != "000" ]; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

expect_code() {
  local label="$1" want="$2"; shift 2
  local body="$WORKDIR/body" got
  got="$(curl -s -o "$body" -w '%{http_code}' -m 5 "$@" || echo fail)"
  if [ "$got" = "$want" ]; then
    echo "ok   $got $label"
  else
    echo "FAIL $got $label (want $want) body=$(head -c 80 "$body" 2>/dev/null || true)"
    return 1
  fi
}

echo "==> start Caddy with a test hash"
start_caddy "$TEST_USER" "$HASH"
if ! wait_http "http://127.0.0.1:${PORT}/"; then
  echo "::error::Caddy did not start on 127.0.0.1:${PORT}"
  if [ "$USE_DOCKER" = 1 ] && [ -n "${CID:-}" ]; then
    docker logs "$CID" 2>&1 | redact || true
  else
    redact < "$WORKDIR/caddy.log" || true
  fi
  exit 1
fi

BASE="http://127.0.0.1:${PORT}"
AUTH=(-u "${TEST_USER}:${TEST_PASS}")
fail=0
expect_code "no-creds GET /"        401 "$BASE/" || fail=1
expect_code "no-creds GET /godot/"  401 "$BASE/godot/" || fail=1
expect_code "no-creds GET /healthz" 200 "$BASE/healthz" || fail=1
expect_code "no-creds GET /grafana/" 200 "$BASE/grafana/" || fail=1
expect_code "good-creds GET /"       200 "${AUTH[@]}" "$BASE/" || fail=1
expect_code "good-creds GET /godot/" 200 "${AUTH[@]}" "$BASE/godot/" || fail=1
expect_code "bad-creds GET /"        401 -u "${TEST_USER}:wrong" "$BASE/" || fail=1
expect_code "good-creds GET /grafana/" 200 "${AUTH[@]}" "$BASE/grafana/" || fail=1
expect_code "bearer GET /grafana/"  403 -H "Authorization: Bearer glsa_dummy" "$BASE/grafana/" || fail=1

# Site password must not be forwarded to Grafana.
gf_body="$(curl -s -m 5 "${AUTH[@]}" "$BASE/grafana/" || true)"
if [ "$gf_body" = "grafana-ok auth=" ]; then
  echo "ok   grafana did not receive Authorization"
else
  echo "FAIL grafana Authorization was not stripped (body not printed)"
  fail=1
fi

cc="$(curl -sI -m 5 "${AUTH[@]}" "$BASE/godot/" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
if [ "$cc" = "no-cache" ]; then
  echo "ok   /godot/ Cache-Control: no-cache"
else
  echo "FAIL /godot/ Cache-Control='$cc' (want no-cache)"
  fail=1
fi

echo "==> empty hash must not serve the site openly"
stop_caddy
empty_log="$WORKDIR/empty.log"
empty_started=0
if [ "$USE_DOCKER" = 1 ]; then
  set +e
  docker run --rm --name zorg-caddy-auth-empty \
    -e ZORG_AUTH_USER="$TEST_USER" \
    -e ZORG_AUTH_HASH= \
    -v "$WORKDIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
    -p "127.0.0.1:${PORT}:80" \
    "$IMAGE" >"$empty_log" 2>&1
  empty_ec=$?
  set -e
else
  export ZORG_AUTH_USER="$TEST_USER" ZORG_AUTH_HASH=
  rewrite_caddyfile "$WORKDIR/Caddyfile" "$WORKDIR/Caddyfile.empty" "$PORT" "$WORKDIR"
  set +e
  "$CADDY_BIN" run --config "$WORKDIR/Caddyfile.empty" --adapter caddyfile >"$empty_log" 2>&1
  empty_ec=$?
  set -e
fi
# Process should have exited non-zero. If something is still listening, it
# must not return 200 on / or /godot/ without credentials.
open_code="$(curl -s -o /dev/null -w '%{http_code}' -m 2 "$BASE/" || echo 000)"
godot_code="$(curl -s -o /dev/null -w '%{http_code}' -m 2 "$BASE/godot/" || echo 000)"
if [ "$open_code" = "200" ] || [ "$godot_code" = "200" ]; then
  echo "FAIL empty hash served /=$open_code /godot/=$godot_code openly"
  fail=1
elif [ "$empty_ec" -ne 0 ]; then
  echo "ok   empty hash: Caddy exited $empty_ec and did not serve openly"
else
  # Started but did not return 200 — still fail-closed as a server, but
  # unexpected. Treat as a failure so we notice a behavior change.
  echo "FAIL empty hash: Caddy stayed up (exit $empty_ec) /=$open_code /godot/=$godot_code"
  fail=1
fi
# Confirm the error mentions empty credentials, without dumping hashes.
if redact < "$empty_log" | grep -qiE 'empty or missing|cannot be empty'; then
  echo "ok   empty-hash error is fail-closed"
else
  echo "WARN empty-hash log did not mention empty credentials (exit=$empty_ec)"
fi

# Unset hash (placeholder expands to empty) — same expectation.
echo "==> unset hash must not serve the site openly"
if [ "$USE_DOCKER" = 1 ]; then
  set +e
  docker run --rm --name zorg-caddy-auth-unset \
    -e ZORG_AUTH_USER="$TEST_USER" \
    -v "$WORKDIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
    "$IMAGE" >"$WORKDIR/unset.log" 2>&1
  unset_ec=$?
  set -e
else
  unset ZORG_AUTH_HASH
  export ZORG_AUTH_USER="$TEST_USER"
  set +e
  "$CADDY_BIN" run --config "$WORKDIR/Caddyfile.empty" --adapter caddyfile >"$WORKDIR/unset.log" 2>&1
  unset_ec=$?
  set -e
fi
if [ "$unset_ec" -ne 0 ]; then
  echo "ok   unset hash: Caddy exited $unset_ec"
else
  echo "FAIL unset hash: Caddy exited 0"
  fail=1
fi

kill "$GFPY" >/dev/null 2>&1 || true

if [ "$fail" -ne 0 ]; then
  echo "::error::Caddy basic_auth probes failed"
  exit 1
fi
echo "caddy auth probes passed"
