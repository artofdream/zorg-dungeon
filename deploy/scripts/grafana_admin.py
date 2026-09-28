#!/usr/bin/env python3
"""Host-side Grafana admin helper used by deploy-web (run as root on the host).

Talks to Grafana on its host-local port (http://127.0.0.1:3000/grafana), the
same path an admin's SSH tunnel uses; the public Caddy route refuses logins.
The admin password is read from /etc/zorg/grafana.env and is never printed.
Output is status only.

Subcommands:
  login-check   form-login as admin, confirm Grafana-admin rights, log out
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


COMMANDS = {"login-check": login_check}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        raise SystemExit(f"usage: {sys.argv[0]} {{{'|'.join(COMMANDS)}}}")
    sys.exit(COMMANDS[sys.argv[1]]())
