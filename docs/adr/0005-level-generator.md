# ADR-0005: Authored campaign first, then a Difficulté-banded generator

- Status: Accepted
- Date: 2026-09-12

## Context

Sponsor chose **authored campaign first, then generator**. Phases 0–7 plus the
Difficulté campaign browser already ship the fixture pack. A generator that
invented new room types, Gunner duration, contract gating, or a fantasy
difficulty scale would violate [[NFR-8]] and the deferred rulings (S2, S3, S4,
S6). Chat is not shared memory — the knobs and guarantees need to live next
to the code.

## Decision

- `generateLevel({ difficulty, seed?, caps? })` lives in `@zorg/engine`
  (`packages/engine/src/generator.ts`). Pure library: LevelDef +
  `serializeLevel` text + a suggested Maker layout. No UI dependency.
- Difficulté targets are the authored numeric bands **1–4** (the values that
  actually appear on green fixtures). Knobs (room / hero / spell counts, E/O
  flavour) stay inside those corpus envelopes (band 4 matches Stupidity
  Award's 9-room board). Unspecified deluxe contracts are not a generation
  band.
- Typical generated worlds are **intended solvable** under [[FR-46]] / [[NFR-4]]:
  an A → lethal D → … → Z line, first D ≥ hero HP, empty cast sequence.
  This slice does **not** emit mirror worlds or not_solvable-mirror constraints.
- Out of the generator (still legal elsewhere): `C` ([[FR-18]] / S2), Gunner
  (avoids S3 duration), Mechanic / Princess (pathing can break the corridor),
  P / T (portals and unpaid tolls), choix, contracts 11–15, [[FR-4]] gating.
- Web: authored campaign stays the default; Generate / Regenerate is additive.
  Honesty copy: generated = Simulated engine, not Live & Probed.

## Consequences

- Players can roll a practice dungeon after the campaign without a new FR.
- Proof is `packages/engine/src/generator.test.ts` — Simulated, not a production
  probe. No [[STATUS_LEDGER]] row is promoted by this decision.
- See [[PLAYER_GUIDE]], [[2026-09-12]], [[STATUS_LEDGER]].
