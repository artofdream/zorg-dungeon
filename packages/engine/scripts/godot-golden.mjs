#!/usr/bin/env node
// Godot parity golden generator (ADR-0008). Runs the TypeScript engine on
// the levels the Godot port ships, with fixed placements, and writes
// a turn-by-turn recording the GDScript engine must reproduce exactly.
// Covers FR-5–FR-8 (placement), FR-11–FR-13 (A/Z/D), FR-20 (Warrior),
// FR-26–FR-31 (scheduler), FR-14 (fire, water, ice, poison + immunity),
// FR-21 (Elf), FR-10 / FR-43 (dist + HP-floor constraints, win/loss),
// FR-32–FR-35 (Attack / Teleport casts and the FR-33 casting window),
// FR-15 (portals), FR-16 (gold) and FR-17 (tolls).
//
// Usage (after `pnpm --filter @zorg/engine build`):
//   node packages/engine/scripts/godot-golden.mjs          # write files
//   node packages/engine/scripts/godot-golden.mjs --check  # fail on drift
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canCastNow,
  castSpell,
  createRun,
  elementalTick,
  enumerateSuppliedRooms,
  evalPortalIndex,
  payToll,
  parseLevel,
  scoreLevel,
  simulate,
  stepRun,
  validateLayout,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const LEVEL_INDEX_OUT = "apps/godot/levels/index.json";
const ELEMENTS_OUT = "apps/godot/tests/golden/elements.json";
const GOLD_OUT = "apps/godot/tests/golden/gold-portals.json";

// Fixed placements (room grid coordinates, orientation 0 unless stated).
// Room ids come from enumerateSuppliedRooms (A:0, Z:0, D:0, D:1, …, E:0).
const LEVELS = [
  {
    source: "packages/engine/fixtures/contracts/1.1-foundations.txt",
    why: "First level of contract 1: A, Z, D(2), one fire room, Warrior(5), no rule.",
    cases: [
      {
        name: "win-around",
        note: "A–D(2)–E(fire)–Z: 2 damage plus 3 fire cells kill the Warrior(5) one cell before Z.",
        positions: { "A:0": [0, 0], "D:0": [0, 1], "E:0": [0, 2], "Z:0": [1, 2] },
      },
      {
        name: "loss-direct",
        note: "Z right next to A: the shortest path skips D and E entirely.",
        positions: { "A:0": [0, 0], "Z:0": [1, 0], "D:0": [0, 1], "E:0": [0, 2] },
      },
      {
        name: "loss-fire-only",
        note: "A–E(fire)–Z: 3 fire damage is not enough for Warrior(5).",
        positions: { "A:0": [0, 0], "E:0": [1, 0], "Z:0": [2, 0], "D:0": [0, 1] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/1.2-contractual-obligation.txt",
    why: "A/Z/D only, one Warrior, no spells, one dist rule (milestone 1).",
    cases: [
      {
        name: "win-line",
        note: "A–D(1)–D(2)–D(3)–Z in a row; Warrior(6) takes 1+2+3 and dies before Z; dist(D(1),D(3)) = 2 holds.",
        positions: { "A:0": [0, 0], "D:0": [1, 0], "D:1": [2, 0], "D:2": [3, 0], "Z:0": [4, 0] },
      },
      {
        name: "constraint-fails",
        note: "Same row with D(2) and D(1) swapped: hero dies but dist(D(1),D(3)) = 1, so the level is not won.",
        positions: { "A:0": [0, 0], "D:1": [1, 0], "D:0": [2, 0], "D:2": [3, 0], "Z:0": [4, 0] },
      },
      {
        name: "loss-tiebreak",
        note: "2×2 square plus a tail; two equal paths, the right-first tie-break picks one and the Warrior reaches Z alive.",
        positions: { "A:0": [0, 1], "D:0": [1, 1], "D:1": [0, 0], "Z:0": [1, 0], "D:2": [2, 1] },
      },
      {
        name: "rotated-90",
        note: "Same square at orientation 90°: the tie order rotates (FR-31).",
        orientation: 90,
        positions: { "A:0": [0, 1], "D:0": [1, 1], "D:1": [0, 0], "Z:0": [1, 0], "D:2": [2, 1] },
      },
      {
        name: "invalid-disconnected",
        note: "D(3) floats away from the rest: FR-5 rejects it before extermination.",
        positions: { "A:0": [0, 0], "D:0": [1, 0], "D:1": [2, 0], "D:2": [5, 5], "Z:0": [3, 0] },
      },
      {
        name: "invalid-overlap-missing",
        note: "Z placed on top of A and D(3) left in the tray: overlap + missing.",
        positions: { "A:0": [0, 0], "D:0": [1, 0], "D:1": [2, 0], "Z:0": [0, 0] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/1.3-around-the-bush.txt",
    why: "A, Z, 2×D(1), one fire room, Warrior(5), rule dist(A, Z) = 2 (same distance form as 1.2).",
    cases: [
      {
        name: "win-around-the-bush",
        note: "Z two rooms from A, but the only path goes around: D(1), D(1), then 3 fire cells.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [1, 0], "D:1": [1, 1], "E:0": [1, 2] },
      },
      {
        name: "constraint-fails",
        note: "A long row kills the Warrior, but dist(A, Z) = 4, so the level is not won.",
        positions: { "A:0": [0, 0], "D:0": [1, 0], "D:1": [2, 0], "E:0": [3, 0], "Z:0": [4, 0] },
      },
      {
        name: "loss-straight",
        note: "dist(A, Z) = 2 straight through one D(1): the Warrior walks in with HP to spare.",
        positions: { "A:0": [0, 0], "D:0": [1, 0], "Z:0": [2, 0], "D:1": [0, 1], "E:0": [1, 1] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/2.2-elemental-sanctuary.txt",
    why: "Smallest Elf level: A, Z, fire, water, ice rooms; Elf(3,{water}) and Elf(3,{ice}); rule dist(A, Z) != 2.",
    cases: [
      {
        name: "win-sanctuary",
        note: "The water-immune Elf slides off the ice into fire and burns; the ice-immune Elf walks over the ice and burns too. dist(A, Z) = 3.",
        positions: { "A:0": [0, 0], "Z:0": [1, 2], "E:0": [0, 2], "E:1": [1, 0], "E:2": [0, 1] },
      },
      {
        name: "loss-elves",
        note: "The water-immune Elf slides through water into fire and dies; the ice-immune Elf walks over the ice into Z.",
        positions: { "A:0": [0, 0], "Z:0": [1, 1], "E:0": [1, 2], "E:1": [0, 2], "E:2": [0, 1] },
      },
      {
        name: "loss-keeps-hp",
        note: "Fire and water both touch Z. Through fire is just as short but costs HP, so the water-immune Elf walks through water and reaches Z (FR-21).",
        positions: { "A:0": [0, 0], "Z:0": [1, 1], "E:0": [1, 0], "E:1": [0, 1], "E:2": [0, 2] },
      },
      {
        name: "stalemate-water",
        note: "The water-immune Elf crosses water, slides on ice and burns; the ice-immune Elf cannot cross water and waits.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "E:0": [1, 2], "E:1": [1, 0], "E:2": [1, 1] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/2.4-cross-with-the-constraint-watered-down.txt",
    why: "Warrior(4) with A, Z, 2×D(1), fire and water: water blocks the short way; rule ∃s ∈ Π, dist(s,A) = dist(s,Z) = 1.",
    cases: [
      {
        name: "win-around-the-water",
        note: "Water sits between A and Z, so the Warrior goes round through D(1), D(1) and fire and dies.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [1, 0], "D:1": [1, 1], "E:0": [1, 2], "E:1": [0, 1] },
      },
      {
        name: "constraint-fails",
        note: "Same walk, but the water room moves away: no room is 1 from both A and Z.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [1, 0], "D:1": [1, 1], "E:0": [1, 2], "E:1": [2, 0] },
      },
      {
        name: "stalemate-no-path",
        note: "Water cuts the only way to Z: the Warrior has no reachable Z and waits.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [1, 0], "D:1": [1, 1], "E:0": [2, 0], "E:1": [0, 1] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/2.5-cross-with-the-constraint.txt",
    why: "Same as 2.4 with ice instead of water: the Warrior slides across the ice room.",
    cases: [
      {
        name: "win-ice-slide",
        note: "The Warrior steps on ice and slides into D(1); three fire cells then finish it before Z.",
        positions: { "A:0": [0, 0], "Z:0": [1, 1], "D:0": [0, 2], "D:1": [2, 1], "E:0": [1, 2], "E:1": [0, 1] },
      },
      {
        name: "loss-slide-into-z",
        note: "Fire takes 3 HP, then an ice slide carries the Warrior into Z with 1 HP left.",
        positions: { "A:0": [0, 0], "Z:0": [1, 2], "D:0": [0, 1], "D:1": [0, 2], "E:0": [1, 0], "E:1": [1, 1] },
      },
      {
        name: "constraint-fails",
        note: "D(1), then an ice slide into fire kills the Warrior, but no room is 1 from both A and Z.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [1, 0], "D:1": [2, 0], "E:0": [1, 2], "E:1": [1, 1] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/1.4-low-blow.txt",
    why: "Smallest spell level: A, Z, D(2), Warrior(4), one Attack(3), no rule.",
    cases: [
      {
        name: "win-attack-after-spawn",
        note: "A–D(2)–Z in a row. Attack(3) right after the spawn leaves 1 HP, and D(2) finishes the Warrior.",
        positions: { "A:0": [0, 0], "D:0": [0, 1], "Z:0": [0, 2] },
        casts: [{ afterSteps: 1, spellId: 0 }],
      },
      {
        name: "loss-no-cast",
        note: "Same row without the spell: D(2) leaves 2 HP and the Warrior walks into Z.",
        positions: { "A:0": [0, 0], "D:0": [0, 1], "Z:0": [0, 2] },
      },
      {
        name: "refused-casts",
        note: "FR-33/FR-32: a cast before any action is refused; the real cast works; casting the same spell again is refused (consumed); Z next to A still loses.",
        positions: { "A:0": [0, 0], "Z:0": [0, 1], "D:0": [0, 2] },
        casts: [
          { afterSteps: 0, spellId: 0 },
          { afterSteps: 1, spellId: 0 },
          { afterSteps: 2, spellId: 0 },
        ],
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/2.1-fire-immunity.txt",
    why: "A, Z, fire room; Elf(1, {fire}) then Warrior(1); one Attack(1). Attack also hits heroes still in the waiting room.",
    cases: [
      {
        name: "win-last-moment",
        note: "A–E(fire)–Z. The fire-immune Elf walks through the fire; Attack(1) one action before Z kills it and the Warrior still waiting.",
        positions: { "A:0": [0, 0], "E:0": [0, 1], "Z:0": [0, 2] },
        casts: [{ afterSteps: 8, spellId: 0 }],
      },
      {
        name: "refused-too-late",
        note: "The same cast one action later: the Elf is already in Z, so the cast is refused (run over).",
        positions: { "A:0": [0, 0], "E:0": [0, 1], "Z:0": [0, 2] },
        casts: [{ afterSteps: 9, spellId: 0 }],
      },
      {
        name: "loss-no-cast",
        note: "Z next to A and no spell: the Elf walks straight in.",
        positions: { "A:0": [0, 0], "Z:0": [0, 1], "E:0": [0, 2] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/4.3-fake-reset.txt",
    why: "A, Z, D(11), poison; Warrior(20); 2×Teleport(2); rule: no hero below 0 HP. The only real poison level without portals or other spells.",
    cases: [
      {
        name: "win-two-teleports",
        note: "Poison heals 1, then two Teleport(2) casts walk the Warrior back over poison cells it already visited (−3 each); D(11) ends it at exactly 0 HP.",
        positions: { "A:0": [0, 0], "Z:0": [1, 2], "D:0": [0, 2], "E:0": [0, 1] },
        casts: [
          { afterSteps: 5, spellId: 0 },
          { afterSteps: 11, spellId: 1 },
        ],
      },
      {
        name: "constraint-fails-waiting-room",
        note: "Teleport(2) right after the spawn has no 2nd room to go back to, so the Warrior returns to the waiting room; it dies later, but below 0 HP.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [0, 1], "E:0": [1, 0] },
        casts: [
          { afterSteps: 1, spellId: 0 },
          { afterSteps: 5, spellId: 1 },
        ],
      },
      {
        name: "loss-no-cast",
        note: "No spells: D(11) leaves 9 HP and the Warrior reaches Z.",
        positions: { "A:0": [0, 0], "Z:0": [0, 2], "D:0": [0, 1], "E:0": [1, 0] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/4.1-teleportation-station.txt",
    why: "Smallest portal level: A, Z, poison, P(1, 1); Warrior(6), no spells, no rule.",
    cases: [
      {
        name: "win-poison-twice",
        note: "A–E(poison)–P–Z in a row. Poison heals 3, then P sends the Warrior back to the first cell of the poison room, and the second pass (−3 per cell) kills it.",
        positions: { "A:0": [0, 0], "E:0": [1, 0], "P:0": [2, 0], "Z:0": [3, 0] },
      },
      {
        name: "loss-portal-spent",
        note: "A–P–Z: the first entry sends the Warrior back to A's centre; P(1, 1) only works once, so the second entry is a normal room and the Warrior walks on into Z.",
        positions: { "A:0": [0, 0], "P:0": [1, 0], "Z:0": [2, 0], "E:0": [3, 0] },
      },
      {
        name: "loss-direct",
        note: "Z next to A: the Warrior never touches the portal.",
        positions: { "A:0": [0, 0], "Z:0": [1, 0], "E:0": [2, 0], "P:0": [3, 0] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/5.2-wealth-frontier.txt",
    why: "Smallest gold + toll level: A, Z, D(1), O(1), T(1, fire); Warrior(5), no rule.",
    cases: [
      {
        name: "win-toll-wall",
        note: "T(1, fire) is the only way to Z and the Warrior has no gold, so Z is out of reach; with every room tied at weight 0 it bounces between A and D(1) until D kills it (FR-17 blocks the light cell).",
        positions: { "A:0": [0, 0], "D:0": [0, 1], "T:0": [1, 0], "O:0": [1, 1], "Z:0": [2, 0] },
      },
      {
        name: "stalemate-one-coin",
        note: "The Warrior picks up O's coin, but crossing T means paying at both light hatches (2 gold), so there is no payable path to Z and it waits.",
        positions: { "A:0": [0, 0], "O:0": [0, 1], "T:0": [1, 0], "D:0": [1, 1], "Z:0": [2, 0] },
      },
      {
        name: "loss-carries-gold",
        note: "A–O–Z–D in a row: the Warrior takes the coin on the way and walks into Z holding it.",
        positions: { "A:0": [0, 0], "O:0": [1, 0], "Z:0": [2, 0], "D:0": [3, 0], "T:0": [0, 1] },
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/5.5-counting-the-riches.txt",
    why: "Portal + gold + toll: A, Z, fire, P(2, x↦7x-6), O(1), T(1, water); Warrior(21); one Teleport(4).",
    cases: [
      {
        name: "loss-second-entry-waits",
        note: "A–P–Z: the 1st entry (f(1) = 1) sends the Warrior back to A's centre; the 2nd (f(2) = 8) finds no 8th visit, so it goes back to the waiting room; the 3rd entry is past n = 2 and the Warrior walks on into Z.",
        positions: { "A:0": [0, 0], "P:0": [1, 0], "Z:0": [2, 0], "E:0": [0, 1], "O:0": [1, 1], "T:0": [2, 1] },
      },
      {
        name: "loss-portal-then-gold",
        note: "Same two portal entries, then the spent P leads through O (pickup) into Z with the coin.",
        positions: { "A:0": [0, 0], "P:0": [0, 1], "O:0": [1, 1], "Z:0": [2, 1], "T:0": [1, 0], "E:0": [2, 0] },
      },
      {
        name: "loss-teleport-into-portal",
        note: "After the waiting room, Teleport(4) puts the Warrior on P's first cell with no room effect, so the portal doesn't fire; it walks through the fire room (−3) and O into Z.",
        positions: { "A:0": [0, 0], "T:0": [1, 0], "Z:0": [2, 0], "E:0": [1, -1], "P:0": [0, -1], "O:0": [2, -1] },
        casts: [{ afterSteps: 8, spellId: 0 }],
      },
    ],
  },
  {
    source: "packages/engine/fixtures/contracts/5.8-vault-break.txt",
    why: "Elf gold + toll level: A, Z, D(1), O(1), T(1, fire), T(1, water); Elf(1, {fire}) then Elf(13, {water}).",
    cases: [
      {
        name: "loss-gold-moves",
        note: "The first Elf takes O's coin and dies in D(1); its coin stays in D. The second Elf finds O empty, picks the coin up in D (pickup before damage, FR-16) and reaches Z.",
        positions: { "A:0": [0, 0], "O:0": [1, 0], "D:0": [2, 0], "Z:0": [2, 1], "T:0": [0, 1], "T:1": [1, 1] },
      },
      {
        name: "stalemate-tolls",
        note: "Z sits behind T(1, fire) and nobody holds gold: no Elf can pay a light cell, so Z is unreachable and both Elves wait in A.",
        positions: { "A:0": [0, 0], "D:0": [0, 1], "T:0": [1, 0], "O:0": [1, 1], "Z:0": [2, 0], "T:1": [2, 1] },
      },
      {
        name: "loss-with-coin",
        note: "A–O–Z: the first Elf takes the coin and walks into Z with it.",
        positions: { "A:0": [0, 0], "O:0": [1, 0], "Z:0": [2, 0], "D:0": [0, 1], "T:0": [1, 1], "T:1": [2, 1] },
      },
    ],
  },
];

// FR-33 refusals, named by the TS SpellCastError message they come from.
function refusalCode(message) {
  if (message.startsWith("FR-33: cannot cast after the run is")) return "run_over";
  if (message.startsWith("FR-33: cannot cast before a hero action")) return "before_first_action";
  if (message.startsWith("FR-33: casting a hero-targeted spell with no active hero")) return "no_active_hero";
  if (message.startsWith("FR-33: cannot cast mid-action")) return "mid_action";
  if (message.startsWith("FR-32: no spell with id")) return "no_spell";
  if (message.includes("is already consumed")) return "consumed";
  throw new Error(`unmapped cast refusal: ${message}`);
}

// Same loop as simulate() with a castScript, except that a refused cast is
// logged instead of thrown, and afterSteps 0 (before any action) is tried
// too. Each successful cast is its own turn (first event "cast").
function runTurns(level, layout, casts = []) {
  const state = createRun(level, layout);
  const turns = [];
  const castLog = [];
  const castWindow = [canCastNow(state)];
  const maxSteps = 10_000;
  const tryCast = (c) => {
    try {
      const { events } = castSpell(state, { spellId: c.spellId });
      turns.push(events);
      castWindow.push(canCastNow(state));
      castLog.push({ afterSteps: c.afterSteps, spellId: c.spellId, result: "ok" });
    } catch (err) {
      castLog.push({ afterSteps: c.afterSteps, spellId: c.spellId, result: refusalCode(err.message) });
    }
  };
  for (const c of casts) if (c.afterSteps === 0) tryCast(c);
  while (state.outcome === "in_progress" && state.stepCount < maxSteps) {
    const before = state.stepCount;
    const { events } = stepRun(state);
    if (events.length > 0) {
      turns.push(events);
      castWindow.push(canCastNow(state));
    }
    const due = state.stepCount > before ? casts.filter((c) => c.afterSteps === state.stepCount) : [];
    for (const c of due) tryCast(c);
    if (due.length > 0) continue;
    if (events.length === 0) break;
  }
  if (state.outcome === "in_progress") {
    state.outcome = "stalemate";
    turns.push([{ type: "stalemate" }]);
    castWindow.push(false);
  }
  return { turns, outcome: state.outcome, castLog, castWindow };
}

function buildLevel(spec) {
  const sourceText = readFileSync(join(repo, spec.source), "utf8");
  const level = parseLevel(sourceText);
  const supplied = enumerateSuppliedRooms(level);
  const levelOut = `apps/godot/levels/${level.id}.json`;
  const goldenOut = `apps/godot/tests/golden/${level.id}.json`;
  const levelFile = {
    generatedBy: "packages/engine/scripts/godot-golden.mjs",
    source: spec.source,
    sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
    supplied,
    level,
  };

  const cases = spec.cases.map((c) => {
    const orientation = c.orientation ?? 0;
    const layout = {
      rooms: supplied
        .filter((s) => c.positions[s.id])
        .map((s) => ({
          id: s.id,
          def: s.def,
          position: { x: c.positions[s.id][0], y: c.positions[s.id][1] },
          orientation,
        })),
    };
    const report = validateLayout(level, layout);
    const out = {
      name: c.name,
      note: c.note,
      orientation,
      placements: layout.rooms.map((r) => ({ id: r.id, x: r.position.x, y: r.position.y })),
      validation: { ok: report.ok, codes: report.issues.map((i) => i.code) },
    };
    if (!report.ok) return out;
    const casts = c.casts ?? [];
    const { turns, outcome, castLog, castWindow } = runTurns(level, layout, casts);
    // Sanity: the turn split must flatten to exactly what simulate() records
    // with the casts that succeeded.
    const castScript = castLog
      .filter((r) => r.result === "ok")
      .map((r) => ({ afterSteps: r.afterSteps, cast: { spellId: r.spellId } }));
    const flat = JSON.stringify(turns.flat());
    const sim = simulate(level, layout, { castScript });
    if (flat !== JSON.stringify(sim.events) || outcome !== sim.outcome) {
      throw new Error(`turn recording for ${level.id}/${c.name} diverges from simulate()`);
    }
    const score = scoreLevel(level, layout, { castScripts: { normal: castScript } });
    if (casts.length > 0) {
      out.casts = casts;
      out.castLog = castLog;
      out.castWindow = castWindow;
    }
    out.runOutcome = outcome;
    out.turns = turns;
    out.score = {
      outcome: score.outcome,
      constraints: score.constraints.map((k) => ({ id: k.id, kind: k.kind, status: k.status })),
    };
    return out;
  });

  const golden = { generatedBy: "packages/engine/scripts/godot-golden.mjs", levelId: level.id, levelFile: levelOut, cases };
  return {
    entry: { id: level.id, name: level.name, file: `res://levels/${level.id}.json`, golden: `res://tests/golden/${level.id}.json`, why: spec.why },
    files: {
      [levelOut]: JSON.stringify(levelFile, null, 2) + "\n",
      [goldenOut]: JSON.stringify(golden, null, 2) + "\n",
    },
  };
}

function build() {
  const files = {};
  const index = [];
  for (const spec of LEVELS) {
    const built = buildLevel(spec);
    index.push(built.entry);
    Object.assign(files, built.files);
  }
  // Picker order: contract, then level number (1.4 before 2.1 before 4.3).
  const num = (id) => id.replace(/^\D+/, "").split(".").map(Number);
  index.sort((a, b) => num(a.id)[0] - num(b.id)[0] || num(a.id)[1] - num(b.id)[1]);
  // FR-14 tick table: every element × immune/not × poison seen/not. No
  // shipped fixture has poison, so this is its only parity check.
  const ticks = [];
  for (const element of ["fire", "water", "ice", "poison"]) {
    for (const immunities of [[], [element], ["fire", "water", "ice", "poison"].filter((e) => e !== element)]) {
      for (const visited of [false, true]) {
        ticks.push({ element, immunities, visited, tick: elementalTick(element, immunities, visited) });
      }
    }
  }
  files[ELEMENTS_OUT] = JSON.stringify({ generatedBy: "packages/engine/scripts/godot-golden.mjs", ticks }, null, 2) + "\n";
  // FR-17 FIFO toll table (gold.ts payToll) and FR-15 portal formulas
  // (portals.ts evalPortalIndex). With the default T tile a cost-1 toll is
  // paid twice to cross, and no shipped level holds 2 coins, so no shipped
  // run that ends ever pays one: this table is the toll's parity check.
  const tolls = [];
  const purses = [[], ["O:0"], ["O:0", "O:1"], ["O:1", "O:0", "O:0"], ["D:0", "O:0", "O:1"]];
  for (const purse of purses) {
    for (const cost of [0, 1, 2, 3]) {
      const piles = new Map([["O:0", 0], ["O:1", 2]]);
      const left = purse.map((sourceRoomId) => ({ sourceRoomId }));
      const paid = payToll(piles, left, cost);
      tolls.push({ purse, cost, paid, purseAfter: left.map((u) => u.sourceRoomId), pilesAfter: Object.fromEntries(piles) });
    }
  }
  // Every formula in the real fixtures, plus the other forms portals.ts reads.
  const portals = [];
  for (const formula of ["1", "2", "5", "6", "x↦3x-2", "x↦7x-6", "x↦5-2x", "x↦1+2*⌊1/x⌋", "∞", "i->i-1", "n => 2n+1", "-x"]) {
    for (const i of [1, 2, 3]) {
      let value = null;
      try {
        value = evalPortalIndex(formula, i);
      } catch {
        value = "unsupported";
      }
      portals.push({ formula, i, value });
    }
  }
  files[GOLD_OUT] = JSON.stringify({ generatedBy: "packages/engine/scripts/godot-golden.mjs", tolls, portals }, null, 2) + "\n";
  files[LEVEL_INDEX_OUT] = JSON.stringify({ generatedBy: "packages/engine/scripts/godot-golden.mjs", levels: index }, null, 2) + "\n";
  return files;
}

const check = process.argv.includes("--check");
const files = build();
let drift = 0;
for (const [rel, text] of Object.entries(files)) {
  const abs = join(repo, rel);
  if (check) {
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : "";
    if (current !== text) {
      drift += 1;
      console.error(`DRIFT: ${relative(repo, abs)} differs from the TS engine output. Re-run without --check and commit.`);
    } else {
      console.log(`ok: ${rel} matches the TS engine`);
    }
  } else {
    writeFileSync(abs, text);
    console.log(`wrote ${rel}`);
  }
}
process.exit(drift ? 1 : 0);
