#!/usr/bin/env python3
"""Counts-only view of the persisted Caddy/Grafana logs (run as root on the host).

The logs contain client IPs, so this never prints log lines: only file counts,
line counts, sizes and the oldest/newest timestamps it can parse.

  log-stats.py stats NAME=DIR [NAME=DIR ...]
  log-stats.py check NAME=DIR [NAME=DIR ...]   # stats, one request, stats again;
                                               # exits 1 unless every log grew
"""
import datetime as dt
import gzip
import json
import os
import re
import sys
import time
import urllib.request

PROBE_URL = os.environ.get("LOG_PROBE_URL", "http://127.0.0.1/grafana/api/frontend/settings")
GF_TS = re.compile(r"\bt=(\S+)")


def ts_of(line):
    line = line.strip()
    if not line:
        return None
    if line.startswith("{"):  # Caddy JSON: "ts" is epoch seconds
        try:
            return dt.datetime.fromtimestamp(float(json.loads(line)["ts"]), dt.timezone.utc)
        except Exception:
            return None
    m = GF_TS.search(line)  # Grafana logfmt: t=2026-09-28T10:05:29.49Z
    if m:
        try:
            return dt.datetime.fromisoformat(m.group(1).replace("Z", "+00:00")).astimezone(dt.timezone.utc)
        except Exception:
            return None
    return None


def stats(path):
    files = sorted(f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f)))
    lines = size = 0
    first = last = None
    for f in files:
        p = os.path.join(path, f)
        size += os.path.getsize(p)
        opener = gzip.open if f.endswith(".gz") else open
        with opener(p, "rt", errors="replace") as fh:
            for line in fh:
                lines += 1
                t = ts_of(line) if (first is None or lines % 500 == 0) else None
                if t:
                    first = t if first is None or t < first else first
                    last = t if last is None or t > last else last
            t = ts_of(line) if lines else None
            if t:
                last = t if last is None or t > last else last
    fmt = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ") if t else "none"
    return {"files": len(files), "lines": lines, "bytes": size, "oldest": fmt(first), "newest": fmt(last)}


def show(label, named):
    out = {}
    for name, path in named:
        s = stats(path)
        out[name] = s
        print(f"{label} {name}: files={s['files']} lines={s['lines']} bytes={s['bytes']} oldest={s['oldest']} newest={s['newest']}")
    return out


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("stats", "check"):
        print(__doc__)
        return 2
    named = [a.split("=", 1) for a in sys.argv[2:]]
    for name, path in named:
        if not os.path.isdir(path):
            print(f"log_{name}=missing")
            return 1
    before = show("before" if sys.argv[1] == "check" else "logs", named)
    if sys.argv[1] == "stats":
        return 0
    try:
        code = urllib.request.urlopen(PROBE_URL, timeout=10).status
    except Exception as e:  # noqa: BLE001
        code = getattr(e, "code", type(e).__name__)
    print(f"probe request -> {code}")
    time.sleep(2)
    after = show("after", named)
    ok = True
    for name, _ in named:
        grew = after[name]["lines"] > before[name]["lines"]
        ok &= grew
        print(f"log_{name}_grew={'yes' if grew else 'no'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
