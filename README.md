# zorg-dungeon

Zorg's Dungeon Maker — a two-phase dungeon-building/hero-simulation puzzle
game. Build a dungeon, then watch scripted heroes try to kill you through it.

- [`GAME_SPEC.md`](./GAME_SPEC.md) — the rules, functional/non-functional
  requirements, and build plan.
- [`AGENTS.md`](./AGENTS.md) — how this repo is governed (start here if
  you're an AI agent or a new contributor).
- [`docs/adr/`](./docs/adr/) — why it's built this way.
- [`docs/STATUS_LEDGER.md`](./docs/STATUS_LEDGER.md) /
  [`docs/FINDINGS.md`](./docs/FINDINGS.md) — what's actually proven, and
  what's been caught and fixed.
- [`docs/SKILL_MATRIX.md`](./docs/SKILL_MATRIX.md) — which agent skills
  apply, who loads them, why they were chosen, and how each one keeps
  learning and apply (knowledge page: `skills.html`).

## Layout

```
packages/engine/   pure TypeScript simulation engine (no UI)
apps/web/          the Maker (editor) + extermination playback, Vite + React
docs/              specs, ADRs, journal, ledgers
scripts/           governance checks CI runs (pnpm governance runs them locally)
```

## Getting started

```
pnpm install
pnpm build
pnpm test
pnpm governance
```
