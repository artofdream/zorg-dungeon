#!/usr/bin/env python3
"""Host-side Grafana admin helper used by deploy-web (run as root on the host).

Talks to Grafana on its host-local port (http://127.0.0.1:3000/grafana), the
same path an admin's SSH tunnel uses; the public Caddy route refuses logins.
The admin password is read from /etc/zorg/grafana.env and is never printed.
Output is status only.

Subcommands:
  login-check     form-login as admin, confirm Grafana-admin rights, log out
  stored-secrets  count secrets Grafana stores encrypted with secret_key
                  (datasource/app-plugin secureJsonFields, contact-point secure
                  settings); exits 1 if any exist or the check is incomplete.
                  Run BEFORE switching GF_SECURITY_SECRET_KEY.
  rotate-keys     after a secret_key switch: rotate the envelope data keys and
                  re-encrypt stored secrets with the new key
"""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("GRAFANA_LOCAL_URL", "http://127.0.0.1:3000/grafana")
ENV_FILE = os.environ.get("GRAFANA_ENV_FILE", "/etc/zorg/grafana.env")


def env_value(name, path=ENV_FILE):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith(name + "="):
                return line.rstrip("\n").split("=", 1)[1]
    return None


class Session:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(BASE + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with self.opener.open(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else None)
        except urllib.error.HTTPError as err:
            return err.code, None

    def login(self):
        password = env_value("GF_SECURITY_ADMIN_PASSWORD")
        if not password:
            raise SystemExit("admin_login=FAIL reason=no-admin-password-in-env-file")
        status, _ = self.call("POST", "/login", {"user": "admin", "password": password})
        return status

    def logout(self):
        # GET /logout revokes the session token server-side.
        self.call("GET", "/logout")


def login_check():
    s = Session()
    status = s.login()
    if status != 200:
        print(f"admin_login=FAIL http={status}")
        return 1
    ustatus, user = s.call("GET", "/api/user")
    is_admin = bool(user and user.get("isGrafanaAdmin"))
    s.logout()
    print(f"admin_login=ok http={status} api_user_http={ustatus} grafana_admin={str(is_admin).lower()}")
    return 0 if is_admin else 1


def _admin_session():
    s = Session()
    status = s.login()
    if status != 200:
        raise SystemExit(f"admin_login=FAIL http={status}")
    return s


def stored_secrets():
    """Counts only; never prints secret values or field contents."""
    s = _admin_session()
    counts, incomplete = {}, []
    try:
        st, dss = s.call("GET", "/api/datasources")
        if st != 200 or dss is None:
            incomplete.append(f"datasources:{st}")
            dss = []
        n = 0
        for ds in dss:
            st, full = s.call("GET", f"/api/datasources/uid/{ds['uid']}")
            if st != 200 or full is None:
                incomplete.append(f"datasource:{st}")
                continue
            n += sum(1 for v in (full.get("secureJsonFields") or {}).values() if v)
        counts["datasource_secure_fields"] = n
        counts["datasources"] = len(dss)

        st, cps = s.call("GET", "/api/v1/provisioning/contact-points")
        if st != 200 or cps is None:
            incomplete.append(f"contact-points:{st}")
            cps = []
        counts["contact_point_secure_fields"] = sum(
            1 for cp in cps for v in (cp.get("settings") or {}).values() if v == "[REDACTED]")

        st, plugins = s.call("GET", "/api/plugins?type=app")
        if st != 200 or plugins is None:
            incomplete.append(f"plugins:{st}")
            plugins = []
        n = 0
        for p in plugins:
            st, ps = s.call("GET", f"/api/plugins/{p['id']}/settings")
            if st == 200 and ps:
                n += sum(1 for v in (ps.get("secureJsonFields") or {}).values() if v)
        counts["app_plugin_secure_fields"] = n
    finally:
        s.logout()
    total = sum(v for k, v in counts.items() if k.endswith("_secure_fields"))
    print("stored_secrets " + " ".join(f"{k}={v}" for k, v in sorted(counts.items()))
          + f" total={total}" + (f" incomplete={','.join(incomplete)}" if incomplete else ""))
    return 0 if total == 0 and not incomplete else 1


def rotate_keys():
    s = _admin_session()
    try:
        r1, _ = s.call("POST", "/api/admin/encryption/rotate-data-keys")
        r2, _ = s.call("POST", "/api/admin/encryption/reencrypt-secrets")
    finally:
        s.logout()
    ok = r1 in (200, 204) and r2 in (200, 204)
    print(f"rotate_data_keys_http={r1} reencrypt_secrets_http={r2} result={'ok' if ok else 'FAIL'}")
    return 0 if ok else 1


COMMANDS = {"login-check": login_check, "stored-secrets": stored_secrets, "rotate-keys": rotate_keys}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        raise SystemExit(f"usage: {sys.argv[0]} {{{'|'.join(COMMANDS)}}}")
    sys.exit(COMMANDS[sys.argv[1]]())
