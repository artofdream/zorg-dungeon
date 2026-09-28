#!/usr/bin/env python3
"""Back up Grafana's SQLite DB on the host before (re)deploying Grafana.

Run as root on the host. Uses SQLite's online backup API from a read-only
connection, so it is consistent even while Grafana is running. Copies go to
/var/backups/zorg-grafana/ (dir 0700, files 0600, root):

  grafana.db.<UTC ts>                       every deploy, newest 5 kept
  grafana.db.<UTC ts>.pre-<old>-to-<new>    when the Grafana image changes,
                                            newest 3 kept (upgrade rollback)

  backup-grafana-db.py <path to grafana.db> <running image> <target image>

Prints names, sizes and integrity only.
"""
import datetime as dt
import os
import re
import sqlite3
import sys

DEST = os.environ.get("GRAFANA_BACKUP_DIR", "/var/backups/zorg-grafana")
KEEP_ROUTINE, KEEP_UPGRADE = 5, 3


def tag(image):
    return re.sub(r"[^A-Za-z0-9._-]", "_", image.rsplit(":", 1)[-1] if ":" in image else image or "none")


def prune(pattern, keep):
    files = sorted(f for f in os.listdir(DEST) if re.fullmatch(pattern, f))
    for f in files[:-keep]:
        os.remove(os.path.join(DEST, f))
        print(f"pruned {f}")


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    src, running, target = sys.argv[1:]
    if not os.path.isfile(src):
        print(f"grafana_db_backup=skipped (no DB at {src}; first deploy?)")
        return 0
    os.makedirs(DEST, mode=0o700, exist_ok=True)
    os.chmod(DEST, 0o700)
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    upgrade = bool(running) and running != target
    name = f"grafana.db.{ts}" + (f".pre-{tag(running)}-to-{tag(target)}" if upgrade else "")
    out = os.path.join(DEST, name)
    tmp = out + ".partial"
    old_umask = os.umask(0o077)
    try:
        s = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=30)
        d = sqlite3.connect(tmp)
        with d:
            s.backup(d)
        ok = d.execute("PRAGMA integrity_check").fetchone()[0]
        d.close()
        s.close()
    finally:
        os.umask(old_umask)
    if ok != "ok":
        os.remove(tmp)
        print(f"::error::grafana.db backup failed integrity_check ({ok}); aborting deploy")
        return 1
    os.chmod(tmp, 0o600)
    os.replace(tmp, out)
    print(f"grafana_db_backup=ok file={name} bytes={os.path.getsize(out)} integrity=ok upgrade={'yes' if upgrade else 'no'}")
    prune(r"grafana\.db\.\d{8}T\d{6}Z", KEEP_ROUTINE)
    prune(r"grafana\.db\.\d{8}T\d{6}Z\.pre-.+", KEEP_UPGRADE)
    kept = sorted(f for f in os.listdir(DEST) if f.startswith("grafana.db."))
    print(f"backups kept ({len(kept)}): " + " ".join(kept))
    return 0


if __name__ == "__main__":
    sys.exit(main())
