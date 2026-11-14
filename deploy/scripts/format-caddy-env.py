#!/usr/bin/env python3
"""Write or check a Compose-safe /etc/zorg/caddy.env (no values printed).

Docker Compose interpolates `$` in env_file values by default. A bcrypt
hash such as `$2a$14$salt...` can be truncated, so the real password never
matches. The `caddy-auth` job used to inject the hash with `docker run -e`,
which does not interpolate, and missed this.

This script writes `ZORG_AUTH_USER` and `ZORG_AUTH_HASH` as single-quoted
Compose env_file values (literal; no `$` interpolation). Do not also set
`format: raw` on the compose `env_file` entry: that parser keeps the quotes
as part of the value.

Usage:
  ZORG_AUTH_USER=... ZORG_AUTH_HASH=... format-caddy-env.py
      write KEY='value' lines to stdout
  format-caddy-env.py --check /etc/zorg/caddy.env
      print lengths only; exit 1 if user or hash is missing or the hash
      is not a bcrypt string
  format-caddy-env.py --self-test
      check quoting against a Compose-like interpolator (no Docker)
"""
from __future__ import annotations

import os
import re
import sys

# bcrypt: $2a$ / $2b$ / $2x$ / $2y$ plus cost and 53 chars of salt+digest
BCRYPT_RE = re.compile(r"^\$2[abxy]\$\d{2}\$[A-Za-z0-9./]{53}$")


def compose_single_quote(value: str) -> str:
    """Quote a value the way Compose's interpolating env_file parser expects."""
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def unquote_env_value(raw: str) -> str:
    """Undo Compose env_file single or double quotes (no interpolation)."""
    if len(raw) >= 2 and raw[0] == raw[-1] == "'":
        inner = raw[1:-1]
        out: list[str] = []
        i = 0
        while i < len(inner):
            if inner[i] == "\\" and i + 1 < len(inner):
                out.append(inner[i + 1])
                i += 2
            else:
                out.append(inner[i])
                i += 1
        return "".join(out)
    if len(raw) >= 2 and raw[0] == raw[-1] == '"':
        return raw[1:-1]
    return raw


def format_env(user: str, password_hash: str) -> str:
    return (
        f"ZORG_AUTH_USER={compose_single_quote(user)}\n"
        f"ZORG_AUTH_HASH={compose_single_quote(password_hash)}\n"
    )


def parse_env_file(path: str) -> dict[str, str]:
    vals: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, raw = line.partition("=")
            vals[key] = unquote_env_value(raw)
    return vals


def compose_interpolate(value: str, env: dict[str, str] | None = None) -> str:
    """Approximate Compose env_file interpolation for unquoted values.

    Variable names are [_a-zA-Z][_a-zA-Z0-9]*. `$$` becomes `$`.
    Unknown variables become empty. This matches the truncation of a
    bcrypt hash (see Docker Compose interpolation docs).
    """
    env = env or {}
    out: list[str] = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == "$":
            if i + 1 < len(value) and value[i + 1] == "$":
                out.append("$")
                i += 2
                continue
            m = re.match(r"\$([_a-zA-Z][_a-zA-Z0-9]*)", value[i:])
            if m:
                out.append(env.get(m.group(1), ""))
                i += m.end()
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def write_stdout() -> int:
    user = os.environ.get("ZORG_AUTH_USER", "")
    password_hash = os.environ.get("ZORG_AUTH_HASH", "")
    if not user or not password_hash:
        sys.stderr.write(
            "format-caddy-env: ZORG_AUTH_USER and ZORG_AUTH_HASH must be set\n"
        )
        return 1
    sys.stdout.write(format_env(user, password_hash))
    return 0


def check(path: str) -> int:
    try:
        vals = parse_env_file(path)
    except OSError as exc:
        sys.stderr.write(f"::error::cannot read {path}: {exc}\n")
        return 1
    user = vals.get("ZORG_AUTH_USER") or ""
    password_hash = vals.get("ZORG_AUTH_HASH") or ""
    user_len = len(user)
    hash_len = len(password_hash)
    # Lengths only — never print the user or the hash.
    print(f"caddy.env: user_len={user_len} hash_len={hash_len}")
    if user_len < 1 or hash_len < 20:
        sys.stderr.write(
            "::error::ZORG_AUTH_USER or ZORG_AUTH_HASH is empty in "
            f"{path}; not starting Caddy.\n"
        )
        return 1
    if not BCRYPT_RE.match(password_hash):
        sys.stderr.write(
            "::error::ZORG_AUTH_HASH in "
            f"{path} is not a bcrypt hash; not starting Caddy.\n"
        )
        return 1
    return 0


def self_test() -> int:
    # Salt starts with a letter so an unquoted `$` would be interpolated
    # (the case Compose warnings name: "The \"yYt\" variable is not set").
    sample_hash = "$2a$14$yYt.xTmFGzgxePglx4ENZOrY1hLqb1Cpt5Aw5.2exzJqcZvbW8NES"
    user = "probe"
    formatted = format_env(user, sample_hash)
    parsed = {}
    for line in formatted.splitlines():
        key, _, raw = line.partition("=")
        parsed[key] = raw
    if parsed["ZORG_AUTH_HASH"] == sample_hash:
        sys.stderr.write("FAIL hash was written unquoted\n")
        return 1
    recovered_hash = unquote_env_value(parsed["ZORG_AUTH_HASH"])
    recovered_user = unquote_env_value(parsed["ZORG_AUTH_USER"])
    if recovered_hash != sample_hash or recovered_user != user:
        sys.stderr.write("FAIL unquote did not restore the original values\n")
        return 1
    # Interpolating the raw unquoted hash *would* truncate it. The
    # written file is single-quoted, so Compose leaves the hash intact
    # and unquote_env_value restores it (already checked above).
    mangled = compose_interpolate(sample_hash)
    if mangled == sample_hash:
        sys.stderr.write("FAIL expected unquoted bcrypt hash to be mangled\n")
        return 1
    if "yYt" in mangled:
        sys.stderr.write("FAIL interpolator did not drop $yYt\n")
        return 1
    # A value that needs escaping
    tricky = "it's $2a$14$abc"
    if unquote_env_value(compose_single_quote(tricky)) != tricky:
        sys.stderr.write("FAIL escaped single quote did not survive\n")
        return 1
    print("format-caddy-env self-test passed")
    return 0


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        return self_test()
    if len(argv) == 3 and argv[1] == "--check":
        return check(argv[2])
    if len(argv) == 1:
        return write_stdout()
    sys.stderr.write(
        "usage: format-caddy-env.py [--check PATH | --self-test]\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
