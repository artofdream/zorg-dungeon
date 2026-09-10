# Zorg's Dungeon Maker — game spec & build plan

Translated and restructured from the French design manual (`Zorg's Dungeon Maker` — base edition + Deluxe Edition + level pack). This document is the build-ready reference: game rules, functional requirements (FR), non-functional requirements (NFR), open questions in the source material, and a phased build plan.

A visual, browsable version of this same content is published here: https://claude.ai/code/artifact/6cba5160-4467-42f4-a42a-ac8ae294c20a

## 1. Game rules

Every level runs in two phases. **Construction:** the player lays out every room supplied by the level on a grid, forming one connected dungeon. **Extermination:** heroes spawn one at a time and path toward Zorg's room using fixed, deterministic priorities; the player can cast one-time spells to stop them. A level is won once every hero is dead and every stated constraint holds — lost the instant any hero reaches Zorg.

### Terminology

- **Room** — a 5×5-cell tile placed on the board grid.
- **Hero** — a scripted agent trying to reach Zorg's room by its own fixed rules.
- **Dungeon** — an arrangement using every room supplied by the level; no diagonals or overlaps.
- **dist(r, s)** — Manhattan distance between two rooms' grid positions.
- **Π / Γ / Φ** — the level's rooms / living heroes / unused spells, respectively.
- **choix(n, E)** — the player picks n distinct items from set/list E during setup (a list allows repeats).
- **Waiting room** — virtual holding area heroes occupy before spawning or after a bad teleport.
- **Mirror world** — a parallel copy of the dungeon with its own heroes/spells, resolved after the normal world.

### Rooms

| Room | Params | Effect |
|---|---|---|
| `A` | — | Spawn room. Heroes appear here. Multiple `A` rooms: player names a "main" one; any `A` a hero passes through becomes the new main. All `A` rooms must share one orientation. |
| `Z` | — | Zorg's room. A hero entering it ends the level in an instant loss. |
| `D(x)` | x: int, can be negative | Deals x damage on every entry. Negative x heals. |
| `E(elem)` | elem: fire / water / ice / poison | Green cells act per element: fire deals 1 dmg/entry; water is impassable and kills a non-immune hero who ends up on it; ice forces sliding until a wall stops the hero; poison gives +1 HP on a cell's first visit, −3 HP every visit after. Immune heroes ignore the cell entirely. |
| `P(n, f)` | n: int, f: index→index | On a hero's i-th entry (i ≤ n), teleports them to the first cell of their f(i)-th-most-recent room visit. If f(i) overshoots their history, they return to the waiting room and respawn. |
| `O(x)` | x: gold | First hero to enter takes all x gold. If that hero later dies, the gold attaches to the death room (which becomes an `O` room too). Pickup pre-empts any other effect of entering. |
| `T(x, elem)` | x: gold cost | Dark cells behave like `E(elem)`. Light cells charge the first x gold a hero has collected (FIFO, refunded to its source rooms) to cross; can't-pay heroes can't pass, and one shoved onto an unpayable cell dies instantly. |
| `C(…)` | 1–2 numeric args seen | Referenced but never defined in the supplied manual — appears only inside the "Artillery" contract. See open questions. |

### Heroes (path priorities, high → low)

| Hero | HP / params | Priorities |
|---|---|---|
| `Warrior(x)` | x HP | Shortest path to Z, ignoring HP loss → ties: right, up, left, down. |
| `Elf(x, elems)` | x HP, immune to elems | Shortest path to Z among those preserving the most HP → ties: right, up, left, down. |
| `Gunner(x, c[, dur])` | x HP, up to c shots | Path that lets it fire soonest → then HP-preserving shortest path (factoring its shots), up to c shots limited by shot duration → ties: right, up, left, down. Can fire a Shell cardinally onto an adjacent cell if the shot isn't of infinite duration. |
| `Shell` (Gunner's projectile, not a hero) | — | Flies straight until a wall or the dungeon edge; resolves instantly (all other action pauses); clears elemental cells and D/Z monsters; hits every hero it crosses for 2 dmg. |
| `Mechanic(x, dict)` | x HP, dict: room→steps | Shortest path to Z (ignoring HP, using its power) → fewest "unjustified" power uses, using power itself as a tie-break → ties: up, right, down, left. From a listed room it can shove that room (with contents) into an adjacent empty cell for dict[room] steps. |
| `Princess(x, dict, b)` | x HP, dict: room→weight, b: pull | Heads for the reachable room with the highest perceived weight (own dict, default {Z:1}) → among equal targets, the HP-preserving shortest path → ties: right, up, left, down. A room's perceived weight = average of its default weight for her and every other princess's pull b standing in it; **every** hero, not just princesses, is pulled by weights this way. |

Shared rules: heroes activate one at a time in spawn order — a hero can't act while an earlier one is alive and not stuck, and a freed "stuck" hero blocks everyone spawned after it. Heroes never collide and ignore each other's presence. A hero at ≤0 HP dies instantly and stops planning as if it never could die. Heroes see the whole map at all times except: other heroes, remaining spells, and the consequences of death. With no better path available, a hero simply waits.

### Spells (all single-use)

| Spell | Effect | Under Selection |
|---|---|---|
| `Attack(x)` | x damage to every living hero. | x damage to the chosen heroes only. |
| `Teleport(n)` | Active hero → first cell of their n-th-most-recent room visit (or the waiting room if history is too short). | Each selected hero teleports independently by the same rule. |
| `Move()` | Instantly relocates the active hero's room (with contents) onto an empty grid cell. | Several distinct rooms move to distinct empty cells at once. |
| `Swap()` | Swaps the active hero's room with one other room (contents travel with it). | Cyclic swap across the selected heroes' rooms plus one extra room. |
| `Selection(allow_corpses)` | Meta-spell: pick heroes + one other unused spell, apply it to all of them at once. `allow_corpses` permits targeting the dead. | — |
| `Sleep()` | Chosen awake hero can't act until woken or its HP changes. | — |
| `Wake()` | Chosen sleeping hero wakes up. | — |
| `Banality` | Chosen hero becomes a Warrior, keeping current HP. | — |

A spell can be cast the instant a hero finishes an action (a move, a spawn) but never mid-action — e.g. not while a portal teleport is still resolving. Casting a hero-targeted spell with no active hero is illegal.

### Constraints, variables & mirror worlds

- **Additional constraints** — level-specific win conditions layered on top of "everyone's dead": positional (`dist` equations), ordering of deaths, HP floors, gold-at-death rules.
- **Bonuses** — optional constraints tracked separately; multiple bonuses on one level don't need to be met together.
- **Variables** — player-chosen values (`choix`) reused across a level's rooms, heroes, spells and constraints.
- **Mirror worlds** — (M′), (M″)… share the constructed dungeon's shape, but each world substitutes its own room list 1:1 by declaration order, and has its own heroes/spells. Worlds resolve normal → M′ → M″ …, each going inactive once nothing changes in it or its Z is reached.
- **Solvability** — a world is "solvable" if some spell-cast sequence lets its heroes all die before reaching Z; "not solvable" is the impossibility of any such sequence. Both are used as constraints on mirror worlds and bonuses.
- **Contracts** — levels are grouped into point-costed contracts (10 fully specified, 5 stubbed as "Blabla") that gate access as the player progresses.

## 2. Functional requirements

### Level & content model
- **FR-1** — Represent a level as data: a room list (with multiplicities), an ordered hero spawn list, an optional one-time spell list, zero or more constraints and bonuses, and zero or more variables.
- **FR-2** — Support `choix(n, E)` variables chosen by the player at setup from a stated domain (ℕ, ℝ, a finite set, or a repeats-allowed list), substituted everywhere they're referenced in that level.
- **FR-3** — Let the "choose n from E" mechanic also capture the order/orientation the player picks items in, where a level's constraints depend on it.
- **FR-4** — Group levels into point-costed contracts; contract access is gated by accumulated points (see open questions for the exact gating rule).

### Dungeon construction — "the Maker"
- **FR-5** — Let the player place every supplied room exactly once on a grid: no diagonals, no overlaps, every room's own 5×5 grid aligned to the board.
- **FR-6** — Enforce that connected rooms share a full side, wall segment meeting wall segment and open cell meeting open cell across it.
- **FR-7** — Enforce one shared orientation for every room, anchored to the common orientation of all `A` rooms (matching wall-hatch direction); reject disagreeing layouts.
- **FR-8** — Block the transition to the extermination phase until FR-5–FR-7 all hold for every supplied room.
- **FR-9** — Support mirror-world levels: one shared room graph, with the level's Nth room swapped 1:1 for the Nth room of each mirror world's own room list.
- **FR-10** — Answer `dist(r, s)` queries (Manhattan distance between placed rooms) for constraint evaluation.

### Room behaviors
- **FR-11** — Spawn Room (`A`): heroes spawn from the current main `A`; a designated main at setup, auto-replaced by any `A` room a hero visits.
- **FR-12** — Zorg's Room (`Z`): any hero entering ends the run in immediate loss.
- **FR-13** — Damage Room (`D(x)`): apply x damage per entry, x possibly negative (healing).
- **FR-14** — Elemental Room (`E`): implement all four elements' distinct per-cell rules (fire/water/ice/poison) and full immunity bypass.
- **FR-15** — Portal Room (`P(n,f)`): teleport on the i-th entry per f(i), with waiting-room fallback when history is too short.
- **FR-16** — Gold Room (`O(x)`): first-entrant pickup, gold reattaching to a hero's death room, pickup taking priority over other move consequences.
- **FR-17** — Tax Room (`T(x,elem)`): elemental dark cells plus a FIFO gold toll on light cells, with instant death for an unpayable forced crossing.
- **FR-18** — Add a `C` room type once its rules are specified — currently undefined in the source.

### Heroes & AI
- **FR-19** — Model every hero as a fully deterministic agent — no randomness anywhere in movement, targeting or tie-breaks.
- **FR-20** — Warrior: shortest path to Z regardless of HP; ties right→up→left→down.
- **FR-21** — Elf: shortest, HP-maximizing path to Z; immune to its listed elements; same tie order as Warrior.
- **FR-22** — Gunner: prioritizes firing soonest, then HP-preserving path length factoring its shots, up to c shots limited by shot duration; same tie order. (Third parameter's exact semantics — see open questions.)
- **FR-23** — Shell: straight-line instant projectile stopped by a wall or the dungeon edge; clears elemental cells and D/Z monsters; deals 2 damage per hero crossed; freezes all other action while resolving.
- **FR-24** — Mechanic: shortest path ignoring HP but using its power; prefers fewer unjustified power uses, using power itself as a tie-break; tie order up→right→down→left.
- **FR-25** — Princess: pathing driven by per-room "attraction" weights (own dict, default {Z:1}), averaged with other princesses' pull when co-located; every hero (not only princesses) is subject to this weight-based pull; HP-preserving shortest path to target; standard tie order.
- **FR-26** — Enforce single-active-hero turn order: spawn/act only when every earlier hero is dead or stuck; a freed stuck hero blocks everyone after it.
- **FR-27** — Heroes never collide and act as if alone, aside from turn order and spells explicitly targeting several.
- **FR-28** — Instant death at ≤0 HP; heroes plan as though they can never die.
- **FR-29** — Give heroes full live map knowledge except: other heroes, remaining spells, and death's consequences.
- **FR-30** — A hero with no improving path waits, re-evaluating as state changes.
- **FR-31** — Fall back to each type's fixed directional tie-break, relative to dungeon orientation, whenever priorities don't distinguish paths.

### Spells
- **FR-32** — Every spell is consumed permanently on cast.
- **FR-33** — Allow casting only when a spell's preconditions hold, and only between completed hero actions, never mid-action.
- **FR-34** — `Attack(x)`: damage to all living heroes, or a Selection subset.
- **FR-35** — `Teleport(n)`: active (or selected) hero to their n-th-most-recent room, waiting-room fallback.
- **FR-36** — `Move()`: relocate the active hero's room onto an empty cell; Selection variant moves several at once.
- **FR-37** — `Swap()`: exchange the active hero's room with another; Selection variant performs a cyclic swap.
- **FR-38** — Re-validate FR-6's border rules after any Move or Swap.
- **FR-39** — `Selection(allow_corpses)`: apply one other unused spell to multiple chosen heroes at once, optionally including corpses.
- **FR-40** — `Sleep()`: target hero can't act until woken or its HP changes.
- **FR-41** — `Wake()`: wakes the target hero.
- **FR-42** — `Banality`: converts the target hero to a Warrior, keeping its HP.

### Win/loss, constraints & mirror worlds
- **FR-43** — Win once every hero across every active world is dead and every stated constraint holds; lose instantly on any Z entry in any world.
- **FR-44** — Support arbitrary blocking constraints and separately-tracked, non-blocking bonuses.
- **FR-45** — Resolve mirror worlds in declared order, each retiring once idle or once its Z is reached.
- **FR-46** — Provide a solvability check: does any spell-cast sequence let a given world's heroes all die before reaching Z — required to validate solvable/not-solvable constraints.

## 3. Non-functional requirements

- **NFR-1 — Determinism.** Identical layout + heroes + cast sequence must always reproduce identical outcomes.
- **NFR-2 — Data-driven content.** Levels/rooms/heroes/spells defined as structured data, not per-level code, so ~130 existing levels (and future ones) need no engine changes to author.
- **NFR-3 — Extensibility.** Pluggable room/hero/spell types; the source itself marks Gunner, Shell, Princess and several spells "(incoming)" and adds an undocumented room type later, so new content is the norm, not the exception.
- **NFR-4 — Search performance.** The solvability check (FR-46) must explore spell-cast sequences fast enough to stay usable as heroes and spells per level grow.
- **NFR-5 — Regression coverage.** Treat the ~130 authored levels as an acceptance suite; every engine change should be checked against their expected outcomes.
- **NFR-6 — Editor clarity.** Wall-hatch direction and room orientation must be visually unambiguous while placing rooms, since FR-7 is otherwise easy to break unknowingly.
- **NFR-7 — Localization.** Source rules are French while level/contract names are already English; shipping in English needs a complete, consistent terminology pass (this document is a first draft of one).
- **NFR-8 — Spec completeness gate.** Known gaps (undefined room, drifting Gunner signature, a flagged bug, stub contracts) must be resolved or explicitly deferred before the engine encodes behavior for them, never silently guessed.
- **NFR-9 — Authoring ergonomics.** The level format must make dense notation (Π, dist, choix, per-level variables) easy to write and validate without ambiguity.
- **NFR-10 — AI testability.** Each hero's layered priority rules need unit tests per priority layer, independent of full-level integration runs.

## 4. Open questions in the source

- **Undefined room (blocks FR-18).** Room type `C` is used in the Artillery contract (`C(1)`, `C(2)`, `C(∞,2)`) but no chapter defines what it does.
- **Drifting signature (affects FR-22).** The manual defines Gunner as `Gunner(x, c)`, but Artillery-contract levels use a third argument (e.g. `Gunner(1, 3, 2)`, `Gunner(2, ∞, ∞)`) that reads as a shot-duration limit — never formally specified.
- **Author-flagged bug (affects base Level 11).** "Dream Trap" is marked in the source as having a known problem, with no fix given.
- **Unwritten contracts (affects FR-4 scope).** Contracts 11–15 (Inventory, Celebrity, Fortune, Necromancy, Awareness) are placeholders with no level content.
- **Malformed level data (affects level import).** A few entries are incomplete as written — e.g. base Level 18's room list has an unbalanced `choix(...)` expression, and Deluxe 10.7 lists a literal placeholder hero, `Gunner(_)`.
- **Unspecified progression gate (affects FR-4).** Contracts carry a point cost, but the source never states how points are earned or what "spending" them to unlock a contract means mechanically.

## 5. Build plan

Two things get built on one shared model: a **simulation engine** that owns the rules above, and **the Maker** — the construction-phase editor — plus a thin runner that plays the extermination phase out. Keep the engine a pure library with no UI dependency so the same rules drive the editor's validation, the hero simulation, and the solvability search.

**Core engine (library)**
- Level data model: rooms, heroes, spells, variables, constraints (FR-1–FR-4).
- Grid/room graph + border and orientation validator (FR-5–FR-10).
- Room-effect handlers, one per type, unit-testable in isolation (FR-11–FR-18).
- Deterministic hero-turn scheduler + per-type pathfinder (FR-19–FR-31).
- Spell resolver, including Selection's meta-dispatch (FR-32–FR-42).
- Win/loss evaluator + mirror-world runner + solvability search (FR-43–FR-46).

**The Maker (editor) + runner**
- Grid canvas for placing supplied rooms; live FR-6/FR-7 validation as feedback, not just a final gate.
- Orientation/hatch-direction indicator per NFR-6.
- Spell tray + "cast now" controls during extermination playback.
- Playback view driven entirely by engine events — no game logic in the UI layer.
- Level browser grouped by contract, showing solved/unsolved/bonus state.

**Phased roadmap**

| Phase | Focus | Covers |
|---|---|---|
| 0 | Data model & level loader — parse every base-edition level without error. | FR-1–FR-3, NFR-2, NFR-9 |
| 1 | Maker MVP + Warrior — grid placement, adjacency/orientation validation, rooms A/Z/D. | FR-5–FR-8, FR-11–FR-13, FR-20, FR-26–FR-31 |
| 2 | Elements & the Elf. | FR-14, FR-21 |
| 3 | Portals, gold & tolls — the trickiest state-tracking rooms. | FR-15–FR-17 |
| 4 | Spellbook — all eight spells, including Selection's meta-dispatch. | FR-32–FR-42 |
| 5 | Remaining heroes — Mechanic, Gunner + Shell (resolve the duration question first), Princess's weight-pull system. | FR-22–FR-25 |
| 6 | Mirror worlds & solvability search. | FR-9, FR-45, FR-46, NFR-4 |
| 7 | Content & regression — import the ~130-level pack as fixtures; settle contract progression/gating. | FR-4, NFR-5 |

Stack-agnostic by design — nothing above assumes a language or renderer. The one hard constraint is NFR-1: whatever you pick, the simulation must stay deterministic and UI-free so the Maker and the solvability search can both drive it honestly.
