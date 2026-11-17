# zorg-dungeon

Zorg's Dungeon Maker — a two-phase dungeon-building/hero-simulation puzzle
game. Build a dungeon, then watch scripted heroes try to kill you through it.

The TypeScript engine in [`packages/engine`](./packages/engine) decides every
win, loss, score, and turn ([NFR-1](./GAME_SPEC.md), [NFR-10](./GAME_SPEC.md)).
The web Maker and the Godot 4.7.2 port only present that result. Parity tests
enforce it: [`packages/engine/scripts/godot-golden.mjs`](./packages/engine/scripts/godot-golden.mjs)
records the engine, and [`apps/godot/tests/parity_test.gd`](./apps/godot/tests/parity_test.gd)
fails if the GDScript copy disagrees. The full mechanism, the test harness,
and the CI map are in [`AGENTS.md`](./AGENTS.md) §8 and
[`apps/godot/README.md`](./apps/godot/README.md).

- **Try the Godot preview** in a PC browser at
  <https://zorg.artof.link/godot/> (the Godot 4.7.2 port, debug web export;
  see [`apps/godot/README.md`](./apps/godot/README.md#try-the-godot-preview)).
  `deploy-godot` publishes that page after a merge that touches `apps/godot/`,
  once the `production` environment is approved. The Maker at
  <https://zorg.artof.link/> and that preview share a username and password
  (set as GitHub Actions secrets; see
  [`CONTRIBUTING.md`](./CONTRIBUTING.md#site-login-shared-username-and-password)).
  `/grafana/` stays anonymous and read-only. itch.io hosts its own copy and
  is not affected.
- [`GAME_SPEC.md`](./GAME_SPEC.md) — the rules, functional/non-functional
  requirements, and build plan. Formal IDs live here. If a guide disagrees,
  the spec wins.
- [`AGENTS.md`](./AGENTS.md) — how this repo is governed (start here if
  you're an AI agent or a new contributor).
- [`docs/adr/`](./docs/adr/) — why it's built this way.
  [ADR-0002](./docs/adr/0002-typescript-monorepo-2d-to-3d.md) is the web app.
  [ADR-0008](./docs/adr/0008-godot-port-milestone-1.md) is the Godot port.
- [`docs/STATUS_LEDGER.md`](./docs/STATUS_LEDGER.md) /
  [`docs/FINDINGS.md`](./docs/FINDINGS.md) — what's actually proven, and
  what's been caught and fixed. The Godot port's evidence is **Simulated**
  (CI and headless tests). A hand-installed debug APK is not a promotion.
- [`docs/LEARNINGS-godot.md`](./docs/LEARNINGS-godot.md) — what the Godot
  port taught us, in plain English.
- [`docs/SKILL_MATRIX.md`](./docs/SKILL_MATRIX.md) — which agent skills
  apply, who loads them, why they were chosen, and
  [Keep Learning and Apply](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434)
  (AEA #434; knowledge page: `skills.html`).

## Layout

```
packages/engine/   TypeScript rules engine. Decides outcomes. No UI.
apps/web/          Maker + extermination playback. Vite + React, 2D canvas.
apps/godot/        Godot 4.7.2 port (GDScript). Presents engine outcomes.
apps/knowledge/    Static knowledge site (guide, spec, ledger, ADRs).
docs/              Specs, ADRs, journal, ledgers, Godot lessons.
scripts/           Governance checks (pnpm governance runs the same ones as CI).
```

## Rules that stay in force

- **Test harness.** Godot's tests are the custom headless scripts
  (`parity_test.gd`, `level_smoke_test.gd`) plus `web_boot_check.mjs`.
  Keep that harness. GUT and gdUnit4 stay out: the check is "GDScript
  matches the TypeScript recording", and CI runs one stock Godot 4.7.2
  binary with `--headless --script` and an exit code.
- **Later AI.** Warrior and Elf movement that already decides a run is
  engine rules ([FR-20](./GAME_SPEC.md), [FR-21](./GAME_SPEC.md), and the
  rest of FR-19–FR-31). If a Utility AI, or any other AI for heroes or
  monsters, is added later, it stays in a sandbox and off the win/loss
  path. It cannot change an outcome the engine decided (NFR-1).
- **Licensed art.** CC0 KayKit models are vendored under
  `apps/godot/assets/kaykit/` and listed in
  [`apps/godot/CREDITS.md`](./apps/godot/CREDITS.md). Licensed packs from
  Humble, Zenva, and Packt are never committed to this public repo. They
  live in a private asset store.
- **Lights.** Extra lights are cosmetic and live in
  [`apps/godot/levels/visual-lights.json`](./apps/godot/levels/visual-lights.json).
  The rules engine never reads that file. The web export uses Godot's
  Compatibility renderer. Phone and desktop builds use the Mobile renderer.

## Build and test

```
pnpm install
pnpm build          # engine, web, knowledge site
pnpm typecheck
pnpm lint
pnpm test           # Vitest. Does not run Godot.
pnpm governance
```

Godot 4.7.2 (standard build, not .NET), from the repo root:

```
pnpm --filter @zorg/engine build
node packages/engine/scripts/godot-golden.mjs --check
godot --headless --path apps/godot --script res://tests/parity_test.gd
godot --headless --path apps/godot --script res://tests/level_smoke_test.gd
```

Debug exports (Linux, Windows, web, Android APK), the web boot check, and
what each GitHub workflow runs are in [`AGENTS.md`](./AGENTS.md) §8.
Short version: `ci` and `governance` run on every pull request. `godot`
runs when the PR touches `apps/godot/` or `packages/engine/` (headless
verify, then the four debug exports). `deploy-web`, `deploy-godot`, and
`deploy-itch` wait for a person to approve the `production` environment.
`deploy-knowledge` publishes the knowledge site to GitHub Pages. Agents
do not approve deploys.
