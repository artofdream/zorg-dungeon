// Covers FR-19 (every Simulated hero is a deterministic agent) and NFR-1
// (identical layout + heroes + cast sequence → identical outcomes).
// Seedless: these runs take no RNG. Generator mulberry32 is out of scope.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { azdLevel, placeAll, twoDLevel } from "./phase1-fixtures.js";
import { hpSquare } from "./phase2-fixtures.js";
import { corridorLine } from "./phase3-fixtures.js";
import { adzSpellLevel } from "./phase4-fixtures.js";
import { mechanicSquare, shoveShortcut } from "./phase5-fixtures.js";
import { simulate, type SimulationState } from "./simulation.js";

const srcDir = dirname(fileURLToPath(import.meta.url));

const HERO_PATHING_SOURCES = [
  "pathing.ts",
  "elf.ts",
  "gunner.ts",
  "mechanic.ts",
  "simulation.ts",
  "weights.ts",
  "shell.ts",
  "tiles.ts",
] as const;

function fingerprint(state: SimulationState) {
  return {
    outcome: state.outcome,
    events: state.events,
    heroes: state.heroes.map((h) => ({
      id: h.id,
      type: h.def.type,
      hp: h.hp,
      dead: h.dead,
      stuck: h.stuck,
      spawned: h.spawned,
      roomId: h.roomId,
      cell: h.cell,
      sleeping: h.sleeping,
      shotsLeft: h.shotsLeft,
      gold: h.gold,
      shoveLeft: [...h.shoveLeft.entries()].sort(([a], [b]) => a.localeCompare(b)),
    })),
  };
}

function replay(
  level: Parameters<typeof simulate>[0],
  layout: Parameters<typeof simulate>[1],
  options?: Parameters<typeof simulate>[2],
) {
  const a = fingerprint(simulate(level, layout, options));
  const b = fingerprint(simulate(level, layout, options));
  expect(a).toEqual(b);
  return a;
}

describe("FR-19 / NFR-1 same seedless inputs reproduce identical outcomes", () => {
  it("Warrior A–D–Z line replays the same path and win", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 2 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const run = replay(level, layout);
    expect(run.outcome).toBe("win");
    expect(run.events.filter((e) => e.type === "move").map((e) => e.dir)).toEqual(
      fingerprint(simulate(level, layout)).events.filter((e) => e.type === "move").map((e) => e.dir),
    );
  });

  it("Warrior 2-path square still picks right on every replay", () => {
    const level = twoDLevel(1, 1, [{ type: "Warrior", hp: 5 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const run = replay(level, layout);
    const first = run.events.find((e) => e.type === "move");
    expect(first && first.type === "move" ? first.dir : "").toBe("right");
  });

  it("Elf HP-square replays the same first step and rooms", () => {
    const { level, layout } = hpSquare("fire", 4, [{ type: "Elf", hp: 5, immunities: [] }]);
    const run = replay(level, layout);
    const first = run.events.find((e) => e.type === "move");
    expect(first && first.type === "move" ? first.dir : "").toBe("down");
    expect(run.outcome).toBe("loss");
  });

  it("Mechanic shove shortcut replays the same shove then loss", () => {
    const { level, layout } = shoveShortcut([{ type: "Mechanic", hp: 5, powerSteps: { A: 1 } }]);
    const run = replay(level, layout);
    expect(run.events.filter((e) => e.type === "shove")).toHaveLength(1);
    expect(run.outcome).toBe("loss");
  });

  it("Mechanic directional square always breaks toward up", () => {
    const { level, layout } = mechanicSquare([{ type: "Mechanic", hp: 5, powerSteps: {} }]);
    const run = replay(level, layout);
    const first = run.events.find((e) => e.type === "move");
    expect(first && first.type === "move" ? first.dir : "").toBe("up");
  });

  it("Gunner 2-arg fire-then-walk corridor replays the same Shell", () => {
    const level = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 1 }]);
    const layout = corridorLine(level, ["A:0", "D:0", "Z:0"]);
    const run = replay(level, layout);
    expect(run.events.filter((e) => e.type === "fire")).toHaveLength(1);
    expect(run.outcome).toBe("loss");
    expect(run.heroes[0]?.hp).toBe(2);
  });

  it("Princess weight camp replays the same stalemate (does not invent a new target)", () => {
    const level = azdLevel(1, [{ type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const run = replay(level, layout);
    expect(run.heroes[0]?.roomId).toBe("D:0");
    expect(run.outcome).toBe("stalemate");
  });

  it("identical Attack castScript after spawn reproduces the same win", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 5 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const options = { castScript: [{ afterSteps: 1, cast: { spellId: 0 } }] };
    const run = replay(level, layout, options);
    expect(run.outcome).toBe("win");
    expect(run.events.some((e) => e.type === "cast" && e.spellType === "Attack")).toBe(true);
    expect(run.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(false);
  });

  it("mixed Simulated heroes (Princess then Warrior pull) replay identically", () => {
    const level = azdLevel(1, [
      { type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 8 },
      { type: "Warrior", hp: 5 },
    ]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const run = replay(level, layout);
    expect(run.heroes.map((h) => h.roomId)).toEqual(["D:0", "D:0"]);
    expect(run.outcome).toBe("stalemate");
  });

  it("Gunner duration field does not change a seedless replay (S3 unused)", () => {
    const withDur = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 1, duration: 99 }]);
    const twoArg = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 1 }]);
    const layoutA = corridorLine(withDur, ["A:0", "D:0", "Z:0"]);
    const layoutB = corridorLine(twoArg, ["A:0", "D:0", "Z:0"]);
    const a = replay(withDur, layoutA);
    const b = replay(twoArg, layoutB);
    expect(a.outcome).toBe(b.outcome);
    expect(a.events.filter((e) => e.type === "fire")).toHaveLength(
      b.events.filter((e) => e.type === "fire").length,
    );
  });
});

describe("FR-19 hero pathing sources have no randomness", () => {
  it("does not call Math.random, crypto.random, or Date.now in choosers", () => {
    const banned = /\bMath\.random\s*\(|\bcrypto\.random|\bDate\.now\s*\(/;
    const hits: string[] = [];
    for (const file of HERO_PATHING_SOURCES) {
      const text = readFileSync(join(srcDir, file), "utf8");
      if (banned.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it("Gunner chooser never reads duration (S3)", () => {
    const text = readFileSync(join(srcDir, "gunner.ts"), "utf8");
    expect(text).not.toMatch(/input\.duration|def\.duration|hero\.duration/);
  });
});

describe("NFR-1 layout room-array order does not change Warrior choice", () => {
  it("shuffling placed rooms still yields the same first step", () => {
    const level = twoDLevel(1, 1, [{ type: "Warrior", hp: 5 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const reversed = { rooms: [...layout.rooms].reverse() };
    const a = fingerprint(simulate(level, layout));
    const b = fingerprint(simulate(level, reversed));
    expect(a.outcome).toBe(b.outcome);
    expect(a.events.filter((e) => e.type === "move").map((e) => e.dir)).toEqual(
      b.events.filter((e) => e.type === "move").map((e) => e.dir),
    );
  });
});
