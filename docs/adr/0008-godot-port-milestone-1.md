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

Round 5 ports portals, gold and tolls (FR-15 to FR-17), including gold in
Warrior and Elf planning, and adds 4.1, 5.2, 5.5 and 5.8. FIFO toll payment
and portal formulas are also checked against TS tables, because no shipped
run that ends pays a toll.

Round 6 is a visuals pass: procedural 2.5D tiles and hero figures, one
soft-shadow sun with ambient light (shadows switch off on slow web devices),
smooth zoom, tilt and rotation, and small hit/death effects. The engine and
the goldens are unchanged.

Round 7 is a phone UX pass from a hand test: a DPI-based UI scale and one
theme (48 dp targets, 16 dp text, safe-area margins), swatch tray buttons, a
level popup, zoom/tilt/turn/fit buttons, collision-free screen-space labels,
larger heroes, and a camera that fits the dungeon. Engine and goldens are
unchanged.

Round 8 fixes the high findings of a UX audit (WCAG 2.2 AA, Material, HIG):
mobile-web scaling by CSS px, a portrait layout, a visible keyboard focus
ring, and keyboard placement with undo. Engine and goldens are unchanged.

Round 9 changes only the look. It adds a dark torch-lit atmosphere with
Low/High quality and a follow-hero camera. Everything is procedural, with
no assets. Engine and goldens are unchanged.

Round 10 replaces the placeholder shapes with CC0 low-poly models (KayKit
Dungeon Remastered and Adventurers, by Kay Lousberg), trimmed and vendored
under `apps/godot/assets/kaykit/` and listed in `apps/godot/CREDITS.md`.
Only CC0 assets are allowed. The textured models made the phone GPU-bound,
so Low also renders the 3D view at 0.75 resolution. Engine and goldens are
unchanged.

## Consequences

ADR-0002's concern is handled by the parity gate, not by trust. Each new
rule ported to GDScript needs golden cases first. The web app is unchanged.
This is **Simulated** evidence only: no ledger rows are promoted, and no real
phone has run it yet.

The web preview adds Web (single-threaded, so no COOP/COEP headers) and
Windows debug exports. `deploy-godot` publishes the web build as static
files at `/godot/` on the existing Lightsail host, next to the web game.
