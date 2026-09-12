# Honesty ledger

> "A status word is a claim. Probe it, or write Unknown." — adapted from the
> AEA framework's Honesty Gate (architecture.artof.link/comparison.html).

Every FR-xx / NFR-xx defined in `GAME_SPEC.md` gets exactly one row here.
`scripts/check-honesty-ledger.mjs` (run by `.github/workflows/governance.yml`
on every PR) fails the build if:

- a row is missing or an ID doesn't exist in `GAME_SPEC.md` (stale/orphaned row),
- the `Status` value isn't one of the five allowed words below, or
- `Status` is anything but `Unknown`/`Planned` and `Evidence` is empty.

`scripts/check-requirements-trace.mjs` additionally fails the build if a row
says `Simulated`, `Probed (date)`, or `Live & Probed` but no test file under
`packages/**` or `apps/**` actually references that ID — closing a ticket, or
writing a table row, is not proof.

## Allowed statuses

| Status | Meaning |
|---|---|
| `Unknown` | Not verified. Default for everything not yet built. |
| `Planned` | Scheduled (e.g. tied to a build-plan phase) but not started. |
| `Simulated` | Proven by an automated, deterministic test — no live/physical run yet. |
| `Probed (YYYY-MM-DD)` | Verified against a real build/device/server on that date. |
| `Live & Probed` | Verified in production and still actively monitored. |

## Ledger

| ID | Status | Evidence |
|---|---|---|
| FR-1 | Simulated | packages/engine/src/loader.test.ts |
| FR-2 | Simulated | packages/engine/src/loader.test.ts |
| FR-3 | Simulated | packages/engine/src/loader.test.ts |
| FR-4 | Unknown | |
| FR-5 | Simulated | packages/engine/src/placement.test.ts |
| FR-6 | Simulated | packages/engine/src/placement.test.ts |
| FR-7 | Simulated | packages/engine/src/placement.test.ts |
| FR-8 | Simulated | packages/engine/src/placement.test.ts |
| FR-9 | Simulated | packages/engine/src/mirrors.test.ts |
| FR-10 | Simulated | packages/engine/src/geometry.test.ts |
| FR-11 | Simulated | packages/engine/src/rooms.test.ts |
| FR-12 | Simulated | packages/engine/src/rooms.test.ts |
| FR-13 | Simulated | packages/engine/src/rooms.test.ts |
| FR-14 | Simulated | packages/engine/src/elements.test.ts |
| FR-15 | Simulated | packages/engine/src/portals.test.ts |
| FR-16 | Simulated | packages/engine/src/gold.test.ts |
| FR-17 | Simulated | packages/engine/src/tolls.test.ts |
| FR-18 | Unknown | |
| FR-19 | Simulated | packages/engine/src/determinism.test.ts |
| FR-20 | Simulated | packages/engine/src/warrior.test.ts |
| FR-21 | Simulated | packages/engine/src/elf.test.ts |
| FR-22 | Simulated | packages/engine/src/gunner.test.ts |
| FR-23 | Simulated | packages/engine/src/gunner.test.ts |
| FR-24 | Simulated | packages/engine/src/mechanic.test.ts |
| FR-25 | Simulated | packages/engine/src/princess.test.ts |
| FR-26 | Simulated | packages/engine/src/scheduler.test.ts |
| FR-27 | Simulated | packages/engine/src/scheduler.test.ts |
| FR-28 | Simulated | packages/engine/src/scheduler.test.ts |
| FR-29 | Simulated | packages/engine/src/scheduler.test.ts |
| FR-30 | Simulated | packages/engine/src/scheduler.test.ts |
| FR-31 | Simulated | packages/engine/src/warrior.test.ts |
| FR-32 | Simulated | packages/engine/src/spells.test.ts |
| FR-33 | Simulated | packages/engine/src/spells.test.ts |
| FR-34 | Simulated | packages/engine/src/spells.test.ts |
| FR-35 | Simulated | packages/engine/src/spells.test.ts |
| FR-36 | Simulated | packages/engine/src/spells.test.ts |
| FR-37 | Simulated | packages/engine/src/spells.test.ts |
| FR-38 | Simulated | packages/engine/src/spells.test.ts |
| FR-39 | Simulated | packages/engine/src/spells.test.ts |
| FR-40 | Simulated | packages/engine/src/spells.test.ts |
| FR-41 | Simulated | packages/engine/src/spells.test.ts |
| FR-42 | Simulated | packages/engine/src/spells.test.ts |
| FR-43 | Simulated | packages/engine/src/constraints.test.ts |
| FR-44 | Simulated | packages/engine/src/constraints.test.ts |
| FR-45 | Simulated | packages/engine/src/mirrors.test.ts |
| FR-46 | Simulated | packages/engine/src/solvability.test.ts |
| NFR-1 | Simulated | packages/engine/src/determinism.test.ts |
| NFR-2 | Simulated | packages/engine/src/base-classic-corpus.test.ts |
| NFR-3 | Unknown | |
| NFR-4 | Simulated | packages/engine/src/solvability.test.ts |
| NFR-5 | Simulated | packages/engine/src/level-pack-corpus.test.ts |
| NFR-6 | Unknown | |
| NFR-7 | Unknown | |
| NFR-8 | Unknown | |
| NFR-9 | Simulated | packages/engine/src/base-classic-corpus.test.ts |
| NFR-10 | Simulated | packages/engine/src/hero-layers.test.ts |

## Generator slice (2026-09-12)

`generateLevel` is a post-campaign tool, not a new FR. Automated proof lives
in `packages/engine/src/generator.test.ts` (parse, [[FR-5]]–[[FR-8]] placement,
[[FR-46]] / [[NFR-4]] solvability, seed stability). The generator itself does
not close [[FR-4]], [[FR-18]], [[FR-43]], or live-probe any NFR. Generated
play is Simulated engine output, not Live & Probed. See
[[0005-level-generator]] and [[2026-09-12]].

A later honesty slice promoted [[FR-19]], [[NFR-1]], and [[NFR-10]] to
`Simulated` from chooser replay / per-layer tests — not from `generateLevel`.

A later `scoreLevel` slice promoted [[FR-43]] and [[FR-44]] to `Simulated`
from grounded constraint tests — not from `generateLevel`. Opaque authored
prose stays unevaluated. See [[0006-grounded-constraint-evaluation]].
