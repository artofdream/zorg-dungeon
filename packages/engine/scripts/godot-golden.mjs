#!/usr/bin/env node
// Godot parity golden generator (ADR-0008). Runs the TypeScript engine on
// the levels the Godot port ships, with fixed placements, and writes
// a turn-by-turn recording the GDScript engine must reproduce exactly.
// Covers FR-5–FR-8 (placement), FR-11–FR-13 (A/Z/D), FR-20 (Warrior),
// FR-26–FR-31 (scheduler), FR-14 (fire only), FR-10 / FR-43 (dist
// constraint + win/loss).
//
// Usage (after `pnpm --filter @zorg/engine build`):
//   node packages/engine/scripts/godot-golden.mjs          # write files
//   node packages/engine/scripts/godot-golden.mjs --check  # fail on drift
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRun,
  enumerateSuppliedRooms,
  parseLevel,
  scoreLevel,
  simulate,
  stepRun,
  validateLayout,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const LEVEL_INDEX_OUT = "apps/godot/levels/index.json";

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
];

function runTurns(level, layout) {
  const state = createRun(level, layout);
  const turns = [];
  const maxSteps = 10_000;
  while (state.outcome === "in_progress" && state.stepCount < maxSteps) {
    const { events } = stepRun(state);
    if (events.length === 0) break;
    turns.push(events);
  }
  if (state.outcome === "in_progress") {
    state.outcome = "stalemate";
    turns.push([{ type: "stalemate" }]);
  }
  return { turns, outcome: state.outcome };
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
    const { turns, outcome } = runTurns(level, layout);
    // Sanity: the turn split must flatten to exactly what simulate() records.
    const flat = JSON.stringify(turns.flat());
    const sim = simulate(level, layout);
    if (flat !== JSON.stringify(sim.events) || outcome !== sim.outcome) {
      throw new Error(`turn recording for ${level.id}/${c.name} diverges from simulate()`);
    }
    const score = scoreLevel(level, layout);
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
