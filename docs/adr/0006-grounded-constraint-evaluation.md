# ADR-0006: Grounded constraint evaluation, refuse opaque prose

- Status: Accepted
- Date: 2026-09-12

## Context

[[FR-43]] and [[FR-44]] sit on top of the Phase 6 runner: worlds already
resolve normal → M′ → M″ ([[FR-45]]), and [[FR-46]] can ask whether a world
is solvable. The loader already stores Constraints / Bonuses / Variante as
prose `expression` strings. GAME_SPEC names the extra win-condition
categories — positional `dist` equations, death order, HP floors,
gold-at-death, solvability of mirror worlds — but it does **not** define a
constraint language. Authored fixtures mix those categories with layout
shape, counterfactuals, visit-set comparisons, and setup variants.

Inventing evaluators for the opaque lines would violate [[NFR-8]] (never
silently guess) the same way inventing room `C` or Gunner duration would.

## Decision

- `scoreLevel` in `packages/engine/src/constraints.ts` is the [[FR-43]] /
  [[FR-44]] layer. It calls `resolveWorlds` (FR-45 order), then aggregates:
  any world Z-entry is a loss; a win requires every hero in every world
  dead **and** every blocking constraint held.
- Bonuses (and source Variante lines) are evaluated the same way but never
  block the aggregate outcome.
- Only authored patterns that map onto GAME_SPEC categories **and** an
  existing engine sensor are classified:
  - solvability of named worlds → `checkSolvability` (budget ⇒ unsupported,
    not a proof)
  - `dist` equations / ∃-adjacent / ∃-D-pair → [[FR-10]] Manhattan
  - HP-floor / gold-at-death / reverse death-order prose → simulation events
- Every other line is `UnsupportedConstraint`. An unsupported **blocking**
  constraint refuses a win claim (`unresolved`). The engine does not guess
  “square dungeon”, spell-usage, distinct death rooms, immunity
  counterfactuals, or C / Gunner duration / [[FR-4]].
- Per-world `simulate` still reports the scheduler outcome only. Maker
  playback is unchanged.

## Consequences

- [[FR-43]] / [[FR-44]] can be `Simulated` for the grounded subset. Opaque
  corpus lines stay unevaluated — that is a documented gap, not a silent
  pass.
- Adding a new evaluator requires a GAME_SPEC hook or an existing sensor,
  plus a test. See [[STATUS_LEDGER]], [[2026-09-12]], [[PLAYER_GUIDE]].
