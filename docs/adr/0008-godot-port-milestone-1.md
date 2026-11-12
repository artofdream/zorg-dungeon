# ADR-0008: Godot 4 port, starting with one parity-checked level

- Status: Proposed
- Date: 2026-11-12

## Context

The sponsor wants a 3D, mobile-playable Zorg and has Godot courses. ADR-0002
chose TypeScript and warned that game engines blur simulation and
presentation, which makes deterministic tests (NFR-1, NFR-10) harder.

## Decision

Add `apps/godot`, a Godot 4.7.2 project written only in GDScript. It ships a
pure-logic GDScript engine (no nodes) that ports only what one Warrior-only
level needs: placement (FR-5 to FR-8), rooms A, Z and D (FR-11 to FR-13),
Warrior pathing (FR-20, FR-26 to FR-31) and the dist rule (FR-10, FR-43).
Anything else fails closed (NFR-8). `packages/engine` stays the reference.
`packages/engine/scripts/godot-golden.mjs` records the TS engine
turn by turn, and the `godot` workflow fails if that recording is stale or
the GDScript replay differs. The scenes only replay engine events. The
project stays in this repo until it stands alone or needs Git LFS.
Distribution starts with sideloaded debug APKs, then itch.io, then the Play
Store only if wanted. See `apps/godot/README.md`.

Round 2 (stacked on milestone 1) adds levels 1.1 and 1.3. The only new rule
it ports is the fire room (FR-14, fire only), and it comes with its own
golden cases.

Round 3 (stacked on round 2) ports water, ice and poison with immunities
(FR-14) and the Elf (FR-21), plus the "∃s ∈ Π" distance rule. It adds levels
2.2, 2.4 and 2.5. Poison has no qualifying fixture, so it is checked against
a TS tick table.

Round 4 ports Attack(x) and Teleport(n), the FR-33 casting window, and the
HP-floor rule. It adds 1.4, 2.1 and 4.3. The level screen now steps the
engine live and casts from a spell bar. Golden cases carry the cast script,
each cast's result and the per-turn cast window. Selection and the other
spells stay refused.

## Consequences

ADR-0002's concern is handled by the parity gate, not by trust. Each new
rule ported to GDScript needs golden cases first. The web app is unchanged.
This is **Simulated** evidence only: no ledger rows are promoted, and no real
phone has run it yet.
