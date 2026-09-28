#!/usr/bin/env bash
# READ-ONLY Grafana audit collector (sponsor-approved 2026-09-28).
#
# Runs as root on the Lightsail host via the existing deploy SSH path.
# - Reads only: docker logs/inspect/diff, journalctl, log files, a sqlite
#   snapshot of grafana.db taken with the sqlite backup API from a mode=ro
#   connection into a private /tmp dir (deleted on exit), and Grafana HTTP
#   API GETs against the Grafana container.
# - Never restarts, writes to Grafana, or edits config.
# - Secret-bearing DB columns (password hashes, salts, tokens, encrypted
#   secure_json_data, keys) are replaced by presence/length markers before
#   anything leaves the host. The admin password is read from
#   /etc/zorg/grafana.env into memory only and fed to curl on stdin.
# - The bundle (tar.gz) is written to STDOUT only, so the caller can pipe it
#   straight into `age`. Only counts/status go to STDERR (the public log).
set -uo pipefail
umask 077

exec 3>&1 4>&2
W="$(mktemp -d /tmp/grafana-audit.XXXXXX)"
cleanup() { rm -rf "$W"; }
trap cleanup EXIT
exec 1>"$W/_collector.log" 2>&1
status() { printf 'audit: %s\n' "$*" >&4; }
mkdir -p "$W"/{meta,docker,logs,volumes,db,api,host}

COMPOSE=(docker compose -f /opt/zorg/deploy/compose.prod.yaml)

# ---------------------------------------------------------------- meta
{
  echo "collected_utc=$(date -u +%FT%TZ)"
  echo "uptime=$(uptime -s 2>/dev/null)"
  docker version --format 'docker={{.Server.Version}}' 2>/dev/null
  docker info --format 'logging_driver={{.LoggingDriver}}' 2>/dev/null
  echo "daemon_json:"; cat /etc/docker/daemon.json 2>&1
  git -c safe.directory=/opt/zorg -C /opt/zorg log -5 --format='git %H %cI %s'
  echo "git_status_porcelain:"
  GIT_OPTIONAL_LOCKS=0 git -c safe.directory=/opt/zorg -C /opt/zorg status --porcelain --untracked-files=all
  echo "grafana_env_stat:"; stat -c '%U:%G %a %s bytes mtime=%y' /etc/zorg/grafana.env 2>&1
} > "$W/meta/meta.txt"

# ---------------------------------------------------------------- docker
docker ps -a --no-trunc --format '{{json .}}' > "$W/docker/ps-a.jsonl"
"${COMPOSE[@]}" ps -a --format json > "$W/docker/compose-ps.json" 2>&1
docker volume ls --format '{{json .}}' > "$W/docker/volumes.jsonl"
docker images --digests --format '{{json .}}' > "$W/docker/images.jsonl"
# Inspect with env values redacted when the name looks secret-bearing.
docker inspect $(docker ps -aq) 2>/dev/null | python3 -c '
import json,re,sys
d=json.load(sys.stdin)
pat=re.compile(r"PASS|SECRET|TOKEN|KEY|CREDENTIAL",re.I)
for c in d:
    env=(c.get("Config") or {}).get("Env") or []
    c["Config"]["Env"]=[(e.split("=",1)[0]+"=<redacted>") if pat.search(e.split("=",1)[0]) else e for e in env]
json.dump(d,sys.stdout,indent=1)
' > "$W/docker/inspect-redacted.json"

GF_CID="$("${COMPOSE[@]}" ps -q grafana 2>/dev/null | head -1)"
CADDY_CID="$("${COMPOSE[@]}" ps -q caddy 2>/dev/null | head -1)"
PROM_CID="$("${COMPOSE[@]}" ps -q prometheus 2>/dev/null | head -1)"
echo "grafana=$GF_CID caddy=$CADDY_CID prometheus=$PROM_CID" > "$W/docker/cids.txt"

for n in grafana caddy prometheus; do
  cid="$("${COMPOSE[@]}" ps -q "$n" 2>/dev/null | head -1)"
  [ -n "$cid" ] || continue
  docker logs --timestamps "$cid" > "$W/logs/docker-$n.log" 2>&1
done
[ -n "$GF_CID" ] && docker diff "$GF_CID" > "$W/docker/diff-grafana.txt" 2>&1

# Container-local Grafana log files (not on a volume; wiped on recreate).
if [ -n "$GF_CID" ]; then
  MD="$(docker inspect -f '{{.GraphDriver.Data.MergedDir}}' "$GF_CID" 2>/dev/null)"
  if [ -n "$MD" ] && [ -d "$MD/var/log/grafana" ]; then
    ls -la --time-style=full-iso "$MD/var/log/grafana" > "$W/logs/grafana-container-logdir.txt" 2>&1
    mkdir -p "$W/logs/grafana-container-files"
    find "$MD/var/log/grafana" -maxdepth 1 -type f -exec cp -p {} "$W/logs/grafana-container-files/" \;
  else
    echo "no /var/log/grafana in container fs (MergedDir=${MD:-unknown})" > "$W/logs/grafana-container-logdir.txt"
  fi
fi

# ---------------------------------------------------------------- volumes
mount_src() { docker inspect -f "{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}" "$1" 2>/dev/null; }
GF_DATA=""; CADDY_DATA=""; CADDY_CONF=""
[ -n "$GF_CID" ] && GF_DATA="$(mount_src "$GF_CID" /var/lib/grafana)"
[ -n "$CADDY_CID" ] && CADDY_DATA="$(mount_src "$CADDY_CID" /data)" && CADDY_CONF="$(mount_src "$CADDY_CID" /config)"
echo "grafana_data=$GF_DATA caddy_data=$CADDY_DATA caddy_config=$CADDY_CONF" > "$W/volumes/paths.txt"
LS='%TY-%Tm-%Td %TH:%TM:%TS %m %u %s %p\n'
[ -n "$GF_DATA" ] && find "$GF_DATA" -printf "$LS" > "$W/volumes/grafana_data-listing.txt" 2>&1
# caddy_data holds TLS private keys: listing only, never copied.
[ -n "$CADDY_DATA" ] && find "$CADDY_DATA" -printf "$LS" > "$W/volumes/caddy_data-listing.txt" 2>&1
if [ -n "$CADDY_CONF" ]; then
  find "$CADDY_CONF" -printf "$LS" > "$W/volumes/caddy_config-listing.txt" 2>&1
  [ -f "$CADDY_CONF/caddy/autosave.json" ] && cp -p "$CADDY_CONF/caddy/autosave.json" "$W/volumes/caddy-autosave.json"
fi
# Any file-based Caddy/Grafana logs anywhere on the host.
{
  ls -la --time-style=full-iso /var/log/caddy 2>&1
  for v in "$CADDY_DATA" "$CADDY_CONF" "$GF_DATA"; do [ -n "$v" ] && find "$v" -name '*.log*' -printf "$LS"; done
} > "$W/volumes/logfile-search.txt" 2>&1

# ---------------------------------------------------------------- grafana.db
DB="$GF_DATA/grafana.db"
if [ -n "$GF_DATA" ] && [ -f "$DB" ]; then
  ls -la --time-style=full-iso "$GF_DATA"/grafana.db* > "$W/db/files.txt"
  python3 - "$DB" "$W/db/snapshot.sqlite" "$W/db" <<'PY'
import sqlite3, json, sys, re, os
src_path, snap, out = sys.argv[1:4]
src = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
dst = sqlite3.connect(snap)
src.backup(dst)
src.close()
dst.row_factory = sqlite3.Row
SENS = re.compile(r"(password|passwd|salt|rands|secret|token|secure|private|^key$|_key$|encrypted|hash|signature|cert|credential)", re.I)
FULL_REDACT_TABLES = {"secrets", "data_keys", "signing_key", "kv_store", "cache_data", "session",
                      "user_external_session", "secret_migration_status", "anon_device"}
META_COLS = re.compile(r"^(id|uid|org_id|namespace|name|type|kind|created|updated|created_at|updated_at|label|active|provider|scope)$", re.I)
DS_EXTRA = {"user", "basic_auth_user", "password", "basic_auth_password"}
URLKEY = re.compile(r"(url|token|key|password|secret|webhook|integration|apikey|routing|bot|chat|user)", re.I)
from urllib.parse import urlsplit
def redact_str(v):
    if isinstance(v, bytes):
        return f"<redacted bytes len={len(v)}>"
    if v is None or v == "":
        return v
    return f"<redacted len={len(v)}>"
def json_keys_only(v):
    try:
        j = json.loads(v if isinstance(v, str) else v.decode())
        if isinstance(j, dict):
            return {"_set_keys": sorted(k for k, x in j.items() if x not in (None, ""))}
    except Exception:
        pass
    return redact_str(v)
def scrub_am(obj, parent=""):
    if isinstance(obj, dict):
        o = {}
        for k, v in obj.items():
            if k.lower() in ("securesettings", "secure_settings", "secure_fields"):
                o[k] = sorted(v.keys()) if isinstance(v, dict) else "<redacted>"
            elif isinstance(v, str) and URLKEY.search(k) and v:
                if "://" in v:
                    p = urlsplit(v); o[k] = f"{p.scheme}://{p.hostname}/<redacted>"
                else:
                    o[k] = f"<redacted len={len(v)}>"
            else:
                o[k] = scrub_am(v, k)
        return o
    if isinstance(obj, list):
        return [scrub_am(x, parent) for x in obj]
    return obj
tables = [r[0] for r in dst.execute("select name from sqlite_master where type='table' order by name")]
summary = {}
for t in tables:
    cols = [r[1] for r in dst.execute(f'pragma table_info("{t}")')]
    n = dst.execute(f'select count(*) from "{t}"').fetchone()[0]
    summary[t] = {"rows": n, "cols": cols}
    if t in ("cache_data",):
        continue
    rows = []
    for r in dst.execute(f'select * from "{t}" limit 20000'):
        d = {}
        for c in cols:
            v = r[c]
            if isinstance(v, (int, float)) or v is None:
                d[c] = v; continue
            if t in FULL_REDACT_TABLES and not META_COLS.match(c):
                d[c] = redact_str(v); continue
            if c in ("secure_json_data", "secure_settings"):
                d[c] = json_keys_only(v); continue
            if t == "data_source" and c in DS_EXTRA:
                d[c] = redact_str(v); continue
            if SENS.search(c):
                d[c] = redact_str(v); continue
            if t.startswith("alert_configuration") and c == "alertmanager_configuration":
                try:
                    d[c] = scrub_am(json.loads(v)); continue
                except Exception:
                    d[c] = redact_str(v); continue
            if isinstance(v, bytes):
                try:
                    v = v.decode()
                except Exception:
                    d[c] = f"<bytes len={len(v)}>"; continue
            d[c] = v
        rows.append(d)
    with open(os.path.join(out, f"table-{t}.json"), "w") as f:
        json.dump(rows, f, indent=1, default=str)
with open(os.path.join(out, "summary.json"), "w") as f:
    json.dump(summary, f, indent=1)
dst.close()
os.remove(snap)
PY
  echo "db_rc=$?" >> "$W/db/files.txt"
  rm -f "$W/db/snapshot.sqlite"
else
  echo "grafana.db not found (GF_DATA=${GF_DATA:-unknown})" > "$W/db/files.txt"
fi

# ---------------------------------------------------------------- Grafana API (GET only)
API_OK=0; API_FAIL=0; API_AUTH="skipped"
GF_IP=""
[ -n "$GF_CID" ] && GF_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$GF_CID" | awk '{print $1}')"
PW="$(sed -n 's/^GF_SECURITY_ADMIN_PASSWORD=//p' /etc/zorg/grafana.env 2>/dev/null | head -1)"
if [ -n "$GF_IP" ] && [ -n "$PW" ] && command -v curl >/dev/null; then
  PW_ESC="${PW//\\/\\\\}"; PW_ESC="${PW_ESC//\"/\\\"}"
  gf_get() { # $1 path, $2 outfile ; GET only, creds via curl config on stdin
    local code
    code="$(printf 'user = "admin:%s"\n' "$PW_ESC" | curl -sS -m 30 -K - -X GET -o "$W/api/$2" -w '%{http_code}' "http://$GF_IP:3000/grafana$1" 2>>"$W/api/_errors.txt")"
    echo "$code GET $1" >> "$W/api/_index.txt"
    if [ "${code:-0}" -ge 200 ] 2>/dev/null && [ "$code" -lt 300 ]; then API_OK=$((API_OK+1)); else API_FAIL=$((API_FAIL+1)); fi
  }
  curl -sS -m 10 -o "$W/api/health.json" "http://$GF_IP:3000/grafana/api/health"
  gf_get /api/user user.json
  if grep -q '"login"' "$W/api/user.json" 2>/dev/null; then
    API_AUTH="ok"
    gf_get /api/user/auth-tokens user-auth-tokens.json
    gf_get "/api/users?perpage=1000" users.json
    gf_get /api/orgs orgs.json
    gf_get /api/org org.json
    gf_get /api/org/users org-users.json
    gf_get "/api/teams/search?perpage=1000" teams.json
    gf_get "/api/serviceaccounts/search?perpage=1000" serviceaccounts.json
    gf_get /api/auth/keys api-keys.json
    gf_get /api/datasources datasources.json
    gf_get /api/datasources/correlations correlations.json
    gf_get "/api/search?limit=5000" search.json
    gf_get /api/folders folders.json
    gf_get "/api/library-elements?perPage=500" library-elements.json
    gf_get /api/dashboards/public-dashboards public-dashboards.json
    gf_get /api/dashboard/snapshots snapshots.json
    gf_get /api/playlists playlists.json
    gf_get /api/plugins plugins.json
    gf_get /api/admin/stats admin-stats.json
    gf_get /api/admin/settings admin-settings.json
    gf_get /api/v1/provisioning/contact-points contact-points.json
    gf_get /api/v1/provisioning/policies policies.json
    gf_get /api/v1/provisioning/alert-rules alert-rules.json
    gf_get /api/v1/provisioning/mute-timings mute-timings.json
    gf_get /api/v1/provisioning/templates templates.json
    gf_get /api/v1/ngalert/admin_config ngalert-admin-config.json
    gf_get /api/alertmanager/grafana/api/v2/silences silences.json
    gf_get /api/ruler/grafana/api/v1/rules ruler-rules.json
    for id in $(python3 -c 'import json,sys; [print(u["id"]) for u in json.load(open(sys.argv[1]))]' "$W/api/users.json" 2>/dev/null); do
      gf_get "/api/admin/users/$id/auth-tokens" "admin-user-$id-auth-tokens.json"
    done
    for id in $(python3 -c 'import json,sys; [print(s["id"]) for s in json.load(open(sys.argv[1])).get("serviceAccounts",[])]' "$W/api/serviceaccounts.json" 2>/dev/null); do
      gf_get "/api/serviceaccounts/$id/tokens" "sa-$id-tokens.json"
    done
  else
    API_AUTH="failed"
  fi
  # Scrub any secure-looking values that an API might return unredacted.
  python3 - "$W/api" <<'PY'
import json, os, re, sys
d = sys.argv[1]
K = re.compile(r"(password|secret|token|apikey|api_key|^key$|privatekey|client_secret)", re.I)
def s(o):
    if isinstance(o, dict):
        return {k: ("<redacted>" if (K.search(k) and isinstance(v, str) and v not in ("", "[REDACTED]")) else s(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [s(x) for x in o]
    return o
for f in os.listdir(d):
    if f.endswith(".json"):
        p = os.path.join(d, f)
        try:
            j = json.load(open(p))
        except Exception:
            continue
        json.dump(s(j), open(p, "w"), indent=1)
PY
fi
unset PW PW_ESC

# ---------------------------------------------------------------- host logs
{
  echo "journal_first=$(journalctl --no-pager -q -o short-iso 2>/dev/null | head -1)"
  echo "journal_last=$(journalctl --no-pager -q -o short-iso -n 1 2>/dev/null)"
  journalctl --list-boots --no-pager 2>&1
  journalctl --disk-usage 2>&1
} > "$W/host/journal-range.txt"
journalctl -u docker --no-pager -o short-iso > "$W/host/journal-docker.log" 2>&1
journalctl -u ssh -u sshd --no-pager -o short-iso > "$W/host/journal-ssh.log" 2>&1
ls -la --time-style=full-iso /var/log > "$W/host/varlog-listing.txt" 2>&1
( for f in /var/log/auth.log*; do [ -f "$f" ] || continue; echo "## $f"; zgrep -hE 'sshd\[[0-9]+\]: (Accepted|Invalid user|Failed password)|sudo: .*COMMAND' "$f"; done ) > "$W/host/auth-ssh-sudo.log" 2>&1
last -F -w > "$W/host/last.txt" 2>&1
ls -la --time-style=full-iso /etc/zorg > "$W/host/etc-zorg-listing.txt" 2>&1

# ---------------------------------------------------------------- summary (counts only)
cnt() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo 0; }
jlen() { python3 -c 'import json,sys
try:
  j=json.load(open(sys.argv[1])); print(len(j) if isinstance(j,list) else len(j.get(sys.argv[2],[])) if sys.argv[2] else 1)
except Exception: print("n/a")' "$1" "${2:-}"; }
status "containers=$(cnt "$W/docker/ps-a.jsonl") grafana_log_lines=$(cnt "$W/logs/docker-grafana.log") caddy_log_lines=$(cnt "$W/logs/docker-caddy.log")"
status "db_tables=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$W/db/summary.json" 2>/dev/null || echo n/a) db_users=$(jlen "$W/db/table-user.json") db_sessions=$(jlen "$W/db/table-user_auth_token.json") db_api_keys=$(jlen "$W/db/table-api_key.json") db_datasources=$(jlen "$W/db/table-data_source.json") db_dashboards=$(jlen "$W/db/table-dashboard.json") db_alert_rules=$(jlen "$W/db/table-alert_rule.json")"
status "api_auth=$API_AUTH api_ok=$API_OK api_fail=$API_FAIL grafana_data_entries=$(cnt "$W/volumes/grafana_data-listing.txt") auth_log_lines=$(cnt "$W/host/auth-ssh-sudo.log")"

exec 1>&- 2>/dev/null
tar -C "$W" -czf - . >&3 2>/dev/null
rc=$?
status "bundle_tar_rc=$rc"
exit $rc
