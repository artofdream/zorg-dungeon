---
name: godot-headless-verify
description: >
  Run the Godot 4.7.2 headless checks that compare the GDScript copy to the
  TypeScript engine. Use when regenerating golden recordings, running
  parity_test.gd or level_smoke_test.gd, running the web boot check, or
  explaining what the godot workflow's exit codes mean.
---

# Godot headless verify

The TypeScript engine decides outcomes. These commands check that the Godot
4.7.2 port still presents the same ones. Use the stock binary (not the .NET
build). Version string in `.github/workflows/godot.yml`: `4.7.2-stable`.

Run the commands from the repo root unless a step says `apps/godot`.

## 1. Stock binary

```bash
GODOT_VERSION=4.7.2-stable
base=https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}
mkdir -p "$HOME/godot"
curl -fsSL -o /tmp/godot.zip "$base/Godot_v${GODOT_VERSION}_linux.x86_64.zip"
unzip -q -o /tmp/godot.zip -d "$HOME/godot"
chmod +x "$HOME/godot/Godot_v${GODOT_VERSION}_linux.x86_64"
ln -sf "$HOME/godot/Godot_v${GODOT_VERSION}_linux.x86_64" "$HOME/godot/godot"
export PATH="$HOME/godot:$PATH"
godot --version
```

`godot --version` starts with `4.7.2.stable` (this run printed
`4.7.2.stable.official.ed1daf0bf`). A missing binary is the shell's
exit 127, which is not a parity result.

## 2. Golden recording

```bash
pnpm install --frozen-lockfile
pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs
node packages/engine/scripts/godot-golden.mjs --check
```

Without `--check` the script rewrites the recordings and the level JSON the
game loads. With `--check` it rebuilds that text in memory and compares.

| Exit | Meaning |
|---|---|
| 0 | Every generated file matches the TypeScript engine. Regeneration wrote the same bytes. |
| 1 | `DRIFT:` on stderr. A committed file differs. Re-run without `--check` only after a real engine change, then commit the files the script wrote. |

The script writes `apps/godot/levels/<id>.json`, `apps/godot/levels/index.json`,
`apps/godot/tests/golden/<id>.json`, `apps/godot/tests/golden/elements.json`,
and `apps/godot/tests/golden/gold-portals.json`. It does not write
`apps/godot/levels/visual-lights.json`.

CI does this in the `golden` job of `.github/workflows/godot.yml`, after
`pnpm --filter @zorg/engine build`, and only runs `--check`.

## 3. Import, parity, smoke

```bash
mkdir -p apps/godot/build && touch apps/godot/build/.gdignore
godot --headless --path apps/godot --import
godot --headless --path apps/godot --script res://tests/parity_test.gd
timeout 120 godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```

`parity_test.gd` calls `quit(0)` or `quit(1)`. `level_smoke_test.gd` does
the same. Read that process status. Godot also prints its own startup
lines; a `FAIL` or `PASS` line is the script.

| Command | Exit | Meaning |
|---|---|---|
| `--import` | 0 | Project imported. A non-zero status means later script runs are not evidence. |
| `parity_test.gd` | 0 | `parity: N/N cases match the TS engine`, and the element, toll, and portal lines have no failures. |
| `parity_test.gd` | 1 | A case, tick, toll, portal row, or golden JSON parse failed (`FAIL` or `cannot parse`). |
| `level_smoke_test.gd` | 0 | Last line is `level smoke: PASS`. |
| `level_smoke_test.gd` | 1 | Last line is `level smoke: N failure(s)`, with `FAIL` lines above it. |
| either script under `timeout 120` | 124 | `timeout` killed the process. The script did not finish. CI uses this same 120s limit. |

Headless smoke prints `SKIP real-input drag (headless; CI runs it under Xvfb)`.
That skip is expected. The GUI pass, from `apps/godot`, is:

```bash
mkdir -p build/screens
timeout 120 xvfb-run -a -s "-screen 0 1280x720x24" godot --path . --rendering-driver opengl3 \
  --script res://tests/level_smoke_test.gd -- --shot=build/screens/level.png
```

## 4. Web boot check

Needs the web export templates, a debug web export, Node 22 or newer
(`WebSocket` is global), and Chrome (`google-chrome`, or set `CHROME`).

```bash
GODOT_VERSION=4.7.2-stable
GODOT_TEMPLATE_DIR=4.7.2.stable
base=https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}
mkdir -p "$HOME/.local/share/godot/export_templates/${GODOT_TEMPLATE_DIR}" /tmp/godot-templates
curl -fsSL -o /tmp/templates.tpz "$base/Godot_v${GODOT_VERSION}_export_templates.tpz"
unzip -q -o /tmp/templates.tpz 'templates/web_nothreads_*' 'templates/version.txt' -d /tmp/godot-templates
mv /tmp/godot-templates/templates/* "$HOME/.local/share/godot/export_templates/${GODOT_TEMPLATE_DIR}/"
```

Then from `apps/godot` (the `godot` job's `working-directory`):

```bash
mkdir -p build/web
godot --headless --path . --export-debug Web build/web/index.html
grep -q 'GODOT_THREADS_ENABLED = false' build/web/index.html
grep -q '"ensureCrossOriginIsolationHeaders":false' build/web/index.html
timeout 180 node tests/web_boot_check.mjs build/web
```

`grep` exits 1 when the thread or isolation flag is missing. The boot
script's own status:

| Exit | Meaning |
|---|---|
| 0 | `web boot: PASS`. The engine started single-threaded, a canvas exists, `crossOriginIsolated` is false, and the page threw no exception. |
| 1 | `web boot: FAIL`, including `chrome did not start`. |
| 124 | `timeout 180` killed it. CI uses this same limit. |

The script serves the export to headless Chrome on the local machine only.
It takes an optional screenshot path:
`node tests/web_boot_check.mjs build/web build/screens/web.png`.

## What CI runs

Workflow: `.github/workflows/godot.yml`. It runs on pull requests that
touch `apps/godot/**`, `packages/engine/**`, or that workflow, and when
`deploy-itch.yml` calls it. It does not deploy.

1. Job `golden`: install, `pnpm --filter @zorg/engine build`, then `node packages/engine/scripts/godot-golden.mjs --check`.
2. Job `godot` (cwd `apps/godot`): download Godot `4.7.2-stable`, `godot --headless --path . --import`, `parity_test.gd`, `timeout 120` on `level_smoke_test.gd`, the Xvfb smoke, the debug exports, the two `grep`s on `build/web/index.html`, then `timeout 180 node tests/web_boot_check.mjs build/web build/screens/web.png`.

A green `godot` workflow is **Simulated** evidence. It is not a live-site probe.
