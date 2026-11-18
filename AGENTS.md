# Agent instructions

This file is the single source of truth for any AI collaborator on this
repo — Claude, Codex, or anything else. Tool-specific files (`CLAUDE.md`,
etc.) exist only so that tool finds its entry point; they must never
diverge from this one. If you're an agent and a tool-specific file
contradicts this file, this file wins.

The rules below are this repo's adaptation of the **Adaptive Experience
Architecture (AEA)** framework (architecture.artof.link) to a solo/small-team
game project. Citations point at the pages the rule is drawn from.

## 1. Knowledge First

> "Read committed shared memory before doing new work. Shared memory is
> [the repo's default branch]. Chat is not shared memory."
> — architecture.artof.link/comparison.html

Before changing anything, read in this order: this file, `GAME_SPEC.md`
(the rules + FR/NFR), `docs/adr/` (why things are the way they are),
`docs/STATUS_LEDGER.md` (what's actually proven vs. claimed). A prior chat
session's context does not exist for the next agent or the next person —
if it mattered, it's in one of these files, or it didn't happen.

## 2. Honesty

> "A status word is a claim. Probe it, or write Unknown."
> — architecture.artof.link/glossary.html ("Probe")

Never mark an FR/NFR, a PR description, or a commit message as "done",
"implemented", "working", or similar without evidence a reviewer (human or
CI) can check. Use `docs/STATUS_LEDGER.md`'s five-word vocabulary
(`Unknown`, `Planned`, `Simulated`, `Probed (date)`, `Live & Probed`) — see
that file for the exact rules. Closing an issue is not proof.

Archify 3.x ignores `meta.views`, so status wording must live in a diagram's
components or cards, never only in its chapter notes. The `governance` check
runs `scripts/check-archify-honesty.mjs` (word list:
`scripts/archify-honesty.config.json`) to enforce that.

## Keep Learning and Apply

> When the build teaches something, write it into the harness (skill,
> sensor, guide, matrix row, or ADR) before the next loop — so the next
> agent inherits it instead of rediscovering the failure.
> — AEA [Keep Learning and Apply](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434)
> (GitLab work item #434; sponsor reports
> [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513)
> merged and #434 closed — Documented on AEA main. Pages still
> **Unknown** until probed. GitLab sign-in from this agent is not a
> content probe.)

This complements **Honesty** (§2) and **Knowledge First** (§1). It is
**not** Antifragility (§3). Antifragility is the second-miss → sensor
gate. This principle is the first-loop write: if the build taught
something, commit a skill, guide, [[SKILL_MATRIX]] row, or ADR before
the next agent starts — a chat note is not apply.

AEA cites (same GitLab project):
- Skill matrix (merged [!512](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/512), closes [#433](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/433)): [`research/random-thoughts/2026-09-12-session-memory-log-aea-grok-skill-matrix.md`](https://gitlab.com/artof-group/adaptive-experience-architecture/-/blob/main/research/random-thoughts/2026-09-12-session-memory-log-aea-grok-skill-matrix.md)
- Principle (sponsor reports merged [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513); [#434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434) closed). Documented on AEA main. Pages **Unknown** until probed.

Status in zorg-dungeon: **Documented; zorg knowledge Pages Probed**
(2026-09-13 HTTP 200:
[skills](https://knowledge.zorg.artof.link/skills.html),
[aea](https://knowledge.zorg.artof.link/aea.html),
[findings](https://knowledge.zorg.artof.link/findings.html)).
[GitLab #434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434)
is the **stable formal principle**. Café App cites #434 and filed
[#214](https://github.com/artofdream/aea-interactive-design/issues/214)
(`keep-learning-and-apply`). Café Knowledge cites #434 on
[#213](https://github.com/artofdream/aea-interactive-design/issues/213)
/ the matrix PR. Also zorg
[#53](https://github.com/artofdream/zorg-dungeon/issues/53), logify
[#24](https://github.com/artofdream/logify/issues/24)
(closed; [PR #25](https://github.com/artofdream/logify/pull/25) merged
on logify `main`, cites #434 — **Documented**). Café MRC
is COMMENT-only. The apply map is [[SKILL_MATRIX]]: historical pain →
skill / matrix row / finding sensor. **AEA** Knowledge Pages for this
principle remain **Unknown** until AEA probes them. Not `Live & Probed`
for game FRs; not a [[STATUS_LEDGER]] promotion. GitLab sign-in from
this agent is not a merge probe.

The skill map is [[SKILL_MATRIX]] (columns: Skill | Scope | Why? | What).
Shared Grok skills (sand-workflow slugs `pr-train-rebase`,
`honesty-ledger-gate`, `companion-plain-docs`,
`persona-journey-validation`, `corpus-quarantine-honesty`) are
adopted here — tracked by
[#50](https://github.com/artofdream/zorg-dungeon/issues/50).
Quarantine evidence: [#52](https://github.com/artofdream/zorg-dungeon/issues/52).
Kid learn page stays Planned: [#51](https://github.com/artofdream/zorg-dungeon/issues/51).
Cross-project ack: Café MRC is **COMMENT-only** (skills on the Café
train; no self-merge on one-issue PRs). **New Bot** squash-merges
Café skill PRs when MRC is **CLEAN**. Café App is **Documented
until probed** (cites #434; Grok skill
[#214](https://github.com/artofdream/aea-interactive-design/issues/214)
(`keep-learning-and-apply`); shared four via
[#206](https://github.com/artofdream/aea-interactive-design/issues/206);
created [#207](https://github.com/artofdream/aea-interactive-design/issues/207)–[#212](https://github.com/artofdream/aea-interactive-design/issues/212);
matrix [#205](https://github.com/artofdream/aea-interactive-design/issues/205)
→ `knowledge/skills-matrix.md` / `skills-matrix.html`). Café Knowledge
is **Documented until probed** (cites #434 on
[#213](https://github.com/artofdream/aea-interactive-design/issues/213)
/ the matrix PR + `knowledge-pages-ratchet`
[#203](https://github.com/artofdream/aea-interactive-design/issues/203)
/ [#204](https://github.com/artofdream/aea-interactive-design/issues/204)).
AEA is **Documented** on AEA main (skill matrix [!512](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/512)
/ [#433](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/433);
principle sponsor-reports [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513)
merged / [#434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434)
closed; Pages **Unknown**; shared four referenced, no dup). logify Keep
Learning is **Documented** on logify `main`
([#24](https://github.com/artofdream/logify/issues/24) closed,
[PR #25](https://github.com/artofdream/logify/pull/25) merged, cites
#434). logify skills stay **Documented / Simulated**
([#22](https://github.com/artofdream/logify/issues/22)
`pr-train-parallel-merge`,
[#23](https://github.com/artofdream/logify/issues/23)
`tagged-release-cut`); companion / personas N/A. ctos is N/A (docker
smoke is a repo script). 3DX Lab is **Documented until probed**
([#7](https://github.com/artofdream/3dx-lab/issues/7) honesty,
[#8](https://github.com/artofdream/3dx-lab/issues/8) infra-apply,
[#9](https://github.com/artofdream/3dx-lab/issues/9) lab-vs-factory,
[#10](https://github.com/artofdream/3dx-lab/issues/10) Keep Learning
gap; skills `3dx-lab-honesty`, `3dx-lab-infra-apply`,
`3dx-lab-lab-vs-factory`; draft
[PR #11](https://github.com/artofdream/3dx-lab/pull/11) awaiting
sponsor merge). This agent got 404 on that repo — URLs are
sponsor-reported, not probed here. Shared PR-train / companion /
personas are N/A there. Other-lane skills are **Documented / Simulated**
until probed. Not Live. Not a ledger promotion.

## 3. Antifragility

> "The same miss twice is a missing sensor or gate, not a missing
> paragraph." — architecture.artof.link/schema.html

Log every discrepancy you find or cause as a CF-NNN entry in
`docs/FINDINGS.md`. If something breaks the same way twice, the fix is not
allowed to be "be more careful" — it has to change `.github/workflows/**`
or add a test. See that file for the enforced rule.

## 4. Traceability (the "graph")

Every functional/non-functional requirement in `GAME_SPEC.md` has a stable
ID (FR-xx / NFR-xx, never renumbered — "ID Freeze",
architecture.artof.link/glossary.html). Code and tests that implement one
should say so in a comment (see `packages/engine/src/geometry.ts` for the
pattern). `scripts/check-requirements-trace.mjs` fails CI on orphaned IDs
(referenced in code but not defined) and on ledger entries claiming proof
with no matching test. Docs cross-reference each other with `[[wikilinks]]`
(checked by `scripts/check-docs-graph.mjs`) — this repo's docs are its
second brain; keep them linked, not siloed.

## 5. Collaboration ground rules (agent-neutral & multi-agent)

This repository is designed for concurrent, asynchronous collaboration across
diverse AI assistants and human contributors, including:
- **Anthropic Claude** (entrypoint: `CLAUDE.md`)
- **Google Antigravity / Gemini** (entrypoint: `GEMINI.md`)
- **OpenAI / Codex / ChatGPT** (entrypoints: `CODEX.md`, `OPENAI.md`)
- **xAI Grok** (entrypoint: `GROK.md`)
- **GitHub Copilot** (entrypoint: `.github/copilot-instructions.md`)
- **Moonshot Kimi** (entrypoint: `KIMI.md`)
- **DeepSeek** (entrypoint: `DEEPSEEK.md`)
- **Cursor** (entrypoint: `.cursorrules`)

All tool-specific entrypoints are minimal pointers that redirect to this file.
To ensure clean collaboration between different agents:

- **One codebase, any agent:** don't assume a specific AI tool's quirks in
  committed files — no tool-specific formatting, no instructions only one
  tool would understand.
- **No shared chat memory:** An agent has zero visibility into another agent's
  prior chat sessions. The committed default branch and files (`GAME_SPEC.md`,
  `docs/STATUS_LEDGER.md`, `docs/FINDINGS.md`, `docs/journal/`, `docs/adr/`)
  are the sole shared memory. If it matters, write it to docs or code;
  otherwise, it does not exist for the next agent.
- **Branch isolation:** Each task, finding, or requirement gets its own branch
  off `main` using the pattern `agent/<agent-family>/<task-slug>` (e.g.
  `agent/claude/phase-0-loader`, `agent/copilot/fr-10-geometry`). Never rebase
  over another agent's active in-flight branch.
- **A producer does not merge its own change:** Every PR requires passing `ci`
  and `governance` checks plus a peer review (human or peer agent) before
  merging — see `CONTRIBUTING.md`.
- **Atomic ledger updates:** When updating `docs/STATUS_LEDGER.md` or
  `docs/FINDINGS.md`, touch only the rows related to your task to minimize
  rebase friction with peer branches.
- **Dev journal handoffs:** Use `docs/journal/YYYY-MM-DD.md` to summarize
  shipped changes, active investigations, and pending decisions for the next
  agent.
- **Cross-platform hygiene:** Line endings are normalized to LF via
  `.gitattributes` across Windows, macOS, and Linux/container environments.
See `docs/adr/0003-multi-agent-collaboration.md` for the full rationale.

## 6. Repo shape

- `packages/engine` — pure TypeScript simulation. No DOM, no UI framework.
  It decides win, loss, score, and every turn ([[NFR-1]], [[NFR-10]]).
  The web app and the Godot port present those outcomes. See §8.
- `apps/web` — the Maker (construction-phase editor) and the extermination
  playback view. Still a 2D canvas app (Vite + React).
  [[0002-typescript-monorepo-2d-to-3d]] keeps a later 3D pass, and a
  Capacitor Android shell of this web app, as the plan for `apps/web`.
  The 3D game you can run today is `apps/godot`.
- `apps/godot` — Godot 4.7.2, GDScript only
  ([[0008-godot-port-milestone-1]]). Thirteen levels, a GDScript copy of
  the engine slice those levels need, and the 3D view. Evidence is
  **Simulated**: the `godot` workflow and the headless scripts. A debug
  APK installed by hand is not a ledger promotion. Play and export notes
  live in `apps/godot/README.md`. Lessons live in [[LEARNINGS-godot]].
- `apps/knowledge` — the static knowledge site. Build it with
  `node apps/knowledge/scripts/build.mjs` (also part of `pnpm build`).
  The `deploy-knowledge` workflow (`.github/workflows/knowledge.yml`)
  publishes `apps/knowledge/dist` to GitHub Pages.
- `docs/adr` — why we built it this way. `docs/journal` — what happened,
  day by day (the "second brain"). `docs/STATUS_LEDGER.md` and
  `docs/FINDINGS.md` — the honesty/antifragility ledgers above.
  `docs/PLAYER_GUIDE.md` — plain-English + diagram companion to
  `GAME_SPEC.md` (published as `guide.html`). Formal IDs stay in the spec;
  if they disagree, the spec wins. `docs/LEARN.md` — kid-facing rules
  (published as `learn.html`). `docs/PLAYER_JOURNEYS.md` — persona UX
  validation cases (published as `journeys.html`). Not a rules rewrite.
  `docs/LEARNINGS-godot.md` — plain-English lessons from the Godot port
  (parity, debug APKs, caching, deploy approvals, adb, UI scale, keyboard,
  itch.io, the shared site login, and board lighting).
  `docs/SKILL_MATRIX.md` — which agent skills apply, who must load them,
  why they were chosen after the 2026-09 build, and how each row
  **Keep Learning and Apply**
  ([#434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434) /
  [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513);
  AEA matrix [!512](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/512))
  (published as `skills.html`). See [[SKILL_MATRIX]]. Compose with
  persona-journey / kid-rules pages; do not rewrite that copy here.
  `.cursor/skills/<name>/SKILL.md` — the short recipes for the Godot
  loop and for opening a PR (§9). Load the file. The matrix says why.
- `scripts/*.mjs` — the governance checks, runnable locally
  (`pnpm governance`) exactly as CI runs them.

## 7. Local commands

```
pnpm install
pnpm build            # engine (tsc), web (Vite), knowledge site
pnpm typecheck        # workspaces that define it (engine, web)
pnpm lint             # workspaces that define it
pnpm test             # Vitest in engine and web. Does not run Godot.
pnpm governance       # requirements trace, honesty ledger, findings,
                      # docs graph, archify honesty
```

Godot 4.7.2 (the standard build, not .NET), from the repo root:

```
pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs --check
godot --headless --path apps/godot --script res://tests/parity_test.gd
godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```

`pnpm test` does not start Godot. The `ci` workflow does not either. The
`godot` workflow does, on pull requests that touch `apps/godot/**`,
`packages/engine/**`, or `.github/workflows/godot.yml`. Exports and the
web boot check are in §8. Exit codes, the stock 4.7.2 binary, and the
web boot check are the `godot-headless-verify` skill in §9.

## 8. Godot port

### Outcomes

The TypeScript engine in `packages/engine` decides game outcomes. Godot
only presents them. The parity tests enforce that.

Godot ships a GDScript copy, `apps/godot/engine/zorg_engine.gd`
(`ZorgEngine`), so a build can step without Node.
`apps/godot/scripts/engine_node.gd` steps that copy one action at a time.
The parity test drives the same copy through `run_turns`. Scenes draw the events
the copy returns. They do not pick a path, a score, or a winner. A rule
the copy does not implement fails closed ([[NFR-8]]).

The copy is checked against a recording from the TypeScript engine:

1. `packages/engine/scripts/godot-golden.mjs` loads the thirteen fixture
   texts named in that script, parses them with the TypeScript engine, and
   runs each fixed placement. A case records validation codes. A valid
   layout also records every turn's events, `runOutcome`, and `score`.
   Spell cases also record `casts` (`afterSteps`, `spellId`), `castLog`
   (`ok` or the refusal code), and `castWindow` (whether a cast would be
   allowed after every turn). A successful cast is its own turn, and
   `cast` is its first event. Before writing, the script checks that the
   turns flatten to the same events `simulate()` returns.
2. It writes `apps/godot/levels/<id>.json` and
   `apps/godot/levels/index.json` (what the game loads),
   `apps/godot/tests/golden/<id>.json` (43 cases),
   `apps/godot/tests/golden/elements.json` (24 ticks: fire, water, ice,
   and poison, each with three immunity sets, visited and not, from
   `elementalTick`), and `apps/godot/tests/golden/gold-portals.json`
   (20 toll rows from `payToll`, 36 portal rows from `evalPortalIndex`).
   It does not write `apps/godot/levels/visual-lights.json`.
3. `--check` rebuilds that text in memory and exits 1 if a committed file
   differs. The `godot` workflow's `golden` job runs this after
   `pnpm --filter @zorg/engine build`.
4. `apps/godot/tests/parity_test.gd` is a headless `SceneTree`
   (`godot --headless --script`). It replays each case through
   `ZorgEngine` and fails unless validation codes, turns, outcome, and
   score match the recording. Spell cases also check the cast log and the
   cast window. It then checks the tick table (`elemental_tick`) and the
   toll and portal tables (`pay_toll`, `portal_index`). The process exits
   1 on any miss.

After a change to `packages/engine`, run the golden script without
`--check` and commit the files it writes, then run the parity script.
The history row is `engine-parity-goldens` in [[SKILL_MATRIX]]. The
commands and exit codes are `.cursor/skills/godot-headless-verify/SKILL.md`.

### Test harness

Keep this custom headless harness. GUT and gdUnit4 stay out of the repo.

`parity_test.gd` and `level_smoke_test.gd` are `SceneTree` scripts. CI
starts them with `godot --headless --script` and reads the exit code.
The smoke script also runs once under Xvfb, with
`--rendering-driver opengl3`, so a real GUI drag is exercised, and it
can save a screenshot. `apps/godot/tests/web_boot_check.mjs` serves the
web export to headless Chrome and passes only if the export boots
single-threaded, with `crossOriginIsolated === false` and no page
exception.

The oracle is JSON the TypeScript engine already wrote. One stock Godot
4.7.2 binary and an exit code compare the GDScript copy to it. The
`godot` workflow downloads that binary and does not install a test addon.
GUT or gdUnit4 would add a second runner beside that compare.
[[0002-typescript-monorepo-2d-to-3d]] treats engine-native test frameworks
as extra weight on headless CI and on the requirements trace. This
harness keeps the check next to the golden files.

### Heroes, monsters, and any later AI

Movement that is already a rule lives in `packages/engine` and is part of
the outcome ([[FR-19]] through [[FR-31]], including Warrior [[FR-20]] and
Elf [[FR-21]]). The Godot copy ports Warrior and Elf for the shipped
levels. Anything else fails closed ([[NFR-8]]).

If a Utility AI, or any other AI for heroes or monsters, is added later,
it stays in a sandbox and off the win/loss path. It cannot change an
outcome the engine decided ([[NFR-1]]).

### Renderers, lights, assets

`apps/godot/project.godot` sets `renderer/rendering_method` to `mobile`
and `renderer/rendering_method.web` to `gl_compatibility`. The web export
uses the Compatibility renderer (WebGL 2). Android, Linux, and Windows
use the Mobile renderer.

Extra lights are cosmetic. They live in
`apps/godot/levels/visual-lights.json`, which `scripts/atmos.gd` reads.
Damage rooms (type D) get a brazier from `byRoomType`. A `byRoom` entry
keyed `levelId/roomId` replaces that room's type list. Low quality (the
default on phones and on the web) uses at most 6 omni lights, no shadows,
and draws the 3D view at 0.75 scale. High (the desktop default) allows 8
omni lights, the Compatibility per-object cap. The rules engine never
reads this file, and the golden script never writes it.

The models in the repo are the CC0 KayKit files under
`apps/godot/assets/kaykit/`, listed in `apps/godot/CREDITS.md`.
[[0008-godot-port-milestone-1]] allows only CC0 files to be vendored.
Licensed packs from Humble, Zenva, and Packt are never committed to this
public repo. They live in a private asset store.

### CI and exports

| Workflow | When it runs | What it does |
|---|---|---|
| `ci` (`.github/workflows/ci.yml`) | every pull request, and every push to `main` | `pnpm install --frozen-lockfile`, `build`, `typecheck`, `lint`, `test`, then Playwright journey probes. A second job probes Caddy basic auth. Ubuntu 24.04, Node 20. Does not run Godot. |
| `governance` | every pull request, and every push to `main` | the scripts behind `pnpm governance`. No `pnpm install`. |
| `godot` | pull requests that touch `apps/godot/**`, `packages/engine/**`, or the workflow; also `workflow_dispatch` and `workflow_call` | Godot 4.7.2-stable. `golden` job: `godot-golden.mjs --check`. Then import, parity, headless smoke, Xvfb smoke, and debug exports for Linux, Windows, Web, and the Android APK. Then `web_boot_check.mjs`. Read-only: no deploy. Artifacts: `zorg-godot-linux-x86_64`, `zorg-godot-windows-x86_64`, `zorg-godot-web`, `zorg-godot-android-debug-apk`, screenshots. |
| `deploy-web` | push to `main` that touches `apps/web/**`, `packages/engine/**`, the root manifests (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`), `deploy/**`, or the workflow, or by hand | `production` environment (a person approves). Publishes the Maker and Grafana. Agents do not approve. |
| `deploy-godot` | push to `main` that touches `apps/godot/**` or the workflow, or by hand | `production` environment. Publishes the web export at `https://zorg.artof.link/godot/` on the existing host. Same shared site login as the Maker. |
| `deploy-itch` | push to `main` that touches `apps/godot/**` or the workflow, or by hand | Calls the `godot` workflow, then butler pushes `html5`, `windows`, `linux`, and `android`. `production` environment. The itch.io page stays a draft. |
| `deploy-knowledge` | push to `main` that touches `docs/**`, `GAME_SPEC.md`, `AGENTS.md`, `apps/knowledge/**`, or the workflow, or by hand | Builds the knowledge site and deploys GitHub Pages. |

Debug exports use the same flags as CI, from `apps/godot`, after
`godot --headless --path . --import`. The Android export needs
`GODOT_ANDROID_KEYSTORE_DEBUG_PATH`, `GODOT_ANDROID_KEYSTORE_DEBUG_USER`,
and `GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD`. CI creates a throwaway debug
keystore for that run and discards it. Android then reports a signature
mismatch if `link.artof.zorg` is already installed. Uninstall that
package only, then install again. Steps:
`.cursor/skills/debug-apk-reinstall/SKILL.md`. There is no release
keystore in this repo.

```
godot --headless --path . --export-debug Linux build/linux/zorg.x86_64
godot --headless --path . --export-debug Windows build/windows/zorg.exe
godot --headless --path . --export-debug Web build/web/index.html
godot --headless --path . --export-debug Android build/android/zorg-debug.apk
```

The web preset turns thread support off, so the export does not need
COOP/COEP headers. CI checks that `build/linux/zorg.sh` is absent (the
apostrophe in the product name made that wrapper a shell error) and that
`build/web/index.html` has threads disabled. The boot check, from
`apps/godot`, needs Node 22 and Chrome:

```
node tests/web_boot_check.mjs build/web
```

## 9. Repo skills

Load the `SKILL.md` before re-deriving the commands. [[SKILL_MATRIX]]
keeps the longer history (including `engine-parity-goldens` and
`adb-phone-test`). These four files are the recipes that kept getting
rewritten into PR bodies and into §7–§8.

| Skill | Scope | Why? | What |
|---|---|---|---|
| `godot-headless-verify` | Godot 4.7.2 headless checks and the `godot` workflow | Rounds [#84](https://github.com/artofdream/zorg-dungeon/pull/84)–[#98](https://github.com/artofdream/zorg-dungeon/pull/98) and the [#113](https://github.com/artofdream/zorg-dungeon/pull/113) docs refresh each restated the golden script, `parity_test.gd`, `level_smoke_test.gd`, and the web boot check. Exit codes lived in the scripts and in `.github/workflows/godot.yml`, so the next agent re-derived them. | [`.cursor/skills/godot-headless-verify/SKILL.md`](.cursor/skills/godot-headless-verify/SKILL.md). Stock `4.7.2-stable` binary. Regenerate or `--check` the recording. Run the two `SceneTree` scripts and `web_boot_check.mjs`. Read the same exit codes CI reads. |
| `debug-apk-reinstall` | Android debug APK from the `godot` workflow | CI discards the debug key every run. Phone rounds [#92](https://github.com/artofdream/zorg-dungeon/pull/92)–[#95](https://github.com/artofdream/zorg-dungeon/pull/95) and [[LEARNINGS-godot]] kept hitting the update refusal. The package name lived only in `apps/godot/export_presets.cfg`. | [`.cursor/skills/debug-apk-reinstall/SKILL.md`](.cursor/skills/debug-apk-reinstall/SKILL.md). Download `zorg-godot-android-debug-apk`, record its SHA-256, install it, and `adb uninstall link.artof.zorg` only after `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. |
| `godot-cosmetic-lights` | `apps/godot/levels/visual-lights.json` | [#112](https://github.com/artofdream/zorg-dungeon/pull/112), CF-013, and the 2026-11-15 journal: the dark board was the light setup. Braziers went in that JSON. The rules engine and the golden files stayed as they were. [#113](https://github.com/artofdream/zorg-dungeon/pull/113) had to say again that the golden script never writes the file. | [`.cursor/skills/godot-cosmetic-lights/SKILL.md`](.cursor/skills/godot-cosmetic-lights/SKILL.md). Edit the JSON for an extra brazier or omni. Leave `packages/engine`, the GDScript rules, and the golden files alone. Re-run the headless smoke test. |
| `zorg-pr` | Pull requests on this repo | Grok rounds [#84](https://github.com/artofdream/zorg-dungeon/pull/84)–[#113](https://github.com/artofdream/zorg-dungeon/pull/113) each used `agent/grok/<task>`, a small diff, and a "do not merge" line. [#91](https://github.com/artofdream/zorg-dungeon/pull/91), [#93](https://github.com/artofdream/zorg-dungeon/pull/93), [#95](https://github.com/artofdream/zorg-dungeon/pull/95), [#98](https://github.com/artofdream/zorg-dungeon/pull/98), and [#104](https://github.com/artofdream/zorg-dungeon/pull/104) were separate Bugbot follow-ups. [#107](https://github.com/artofdream/zorg-dungeon/pull/107) and [#113](https://github.com/artofdream/zorg-dungeon/pull/113) still had to say the PR does not approve `production` deploys. | [`.cursor/skills/zorg-pr/SKILL.md`](.cursor/skills/zorg-pr/SKILL.md). Branch `agent/grok/<task>`. Keep the PR small. When Godot or the engine changes, parity exits 0 and the debug APK artifact is on the run. Leave merge and deploy approval to the owner. |
