// NFR-10: each Simulated hero's priority layers, isolated from full-level
// simulate() integration. Choosers only — no spawn/death/win evaluator.
// Heroes: Warrior, Elf, Mechanic, Gunner, Princess. Gunner duration (S3)
// is not a layer.
import { describe, expect, it } from "vitest";
import { chooseElfStep } from "./elf.js";
import { chooseGunnerStep } from "./gunner.js";
import { chooseMechanicStep, mechanicPriorityBetter } from "./mechanic.js";
import { azdLevel, placeAll, twoDLevel } from "./phase1-fixtures.js";
import { hpSquare } from "./phase2-fixtures.js";
import { corridorLine } from "./phase3-fixtures.js";
import { adzHeroes, mechanicSquare, shoveShortcut } from "./phase5-fixtures.js";
import {
  buildWalkGrid,
  chooseWarriorStep,
  distanceToZ,
  localToWorld,
  roomCenterLocal,
} from "./pathing.js";
import { MECHANIC_TIE_BREAK_ORDER } from "./tiles.js";
import { highestWeightRoomIds, reachableRoomIds } from "./weights.js";
import type { DungeonLayout } from "./placement.js";
import type { CellPos } from "./pathing.js";

function aSpawn(layout: DungeonLayout): { roomId: string; cell: CellPos } {
  const a = layout.rooms.find((r) => r.def.type === "A");
  if (!a) throw new Error("missing A");
  return { roomId: a.id, cell: localToWorld(a, roomCenterLocal()) };
}

function zIds(layout: DungeonLayout): string[] {
  return layout.rooms.filter((r) => r.def.type === "Z").map((r) => r.id);
}

describe("NFR-10 Warrior layers (FR-20 / FR-31)", () => {
  it("layer 1: first improving step is onto the unique shortest path (lethal D)", () => {
    const level = azdLevel(5, [{ type: "Warrior", hp: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const grid = buildWalkGrid(layout);
    const dist = distanceToZ(layout, grid);
    const { cell } = aSpawn(layout);
    expect(chooseWarriorStep(grid, dist, cell, 0)).toBe("right");
  });

  it("layer 1: prefers the 1-step path to Z over a detour through D", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const grid = buildWalkGrid(layout);
    const dist = distanceToZ(layout, grid);
    const { cell } = aSpawn(layout);
    expect(chooseWarriorStep(grid, dist, cell, 0)).toBe("right");
  });

  it("layer 2: equal-length square breaks right → up → left → down", () => {
    const level = twoDLevel(1, 1, [{ type: "Warrior", hp: 5 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const grid = buildWalkGrid(layout);
    const dist = distanceToZ(layout, grid);
    const { cell } = aSpawn(layout);
    expect(chooseWarriorStep(grid, dist, cell, 0)).toBe("right");
  });
});

describe("NFR-10 Elf layers (FR-21 / FR-31)", () => {
  it("layer 1: HP-preserving step takes E over D(4)", () => {
    const { layout } = hpSquare("fire", 4, [{ type: "Elf", hp: 5, immunities: [] }]);
    const { roomId, cell } = aSpawn(layout);
    const dir = chooseElfStep({
      layout,
      grid: buildWalkGrid(layout),
      from: cell,
      hp: 5,
      roomId,
      poisonVisits: new Set(),
      immunities: [],
      orientation: 0,
    });
    expect(dir).toBe("down");
  });

  it("layer 2: among equal-HP options, takes the shorter A–Z walk", () => {
    const level = twoDLevel(0, 0, [{ type: "Elf", hp: 5, immunities: [] }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
      "D:1": { x: 1, y: 1 },
    });
    const { roomId, cell } = aSpawn(layout);
    const dir = chooseElfStep({
      layout,
      grid: buildWalkGrid(layout),
      from: cell,
      hp: 5,
      roomId,
      poisonVisits: new Set(),
      immunities: [],
      orientation: 0,
    });
    expect(dir).toBe("right");
  });

  it("layer 3: equal-HP equal-length square breaks right (Warrior order)", () => {
    const level = twoDLevel(1, 1, [{ type: "Elf", hp: 5, immunities: [] }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const { roomId, cell } = aSpawn(layout);
    const dir = chooseElfStep({
      layout,
      grid: buildWalkGrid(layout),
      from: cell,
      hp: 5,
      roomId,
      poisonVisits: new Set(),
      immunities: [],
      orientation: 0,
    });
    expect(dir).toBe("right");
  });

  it("immunity changes the HP ranking (fire-immune Elf takes E over D(1))", () => {
    const { layout } = hpSquare("fire", 1, [{ type: "Elf", hp: 5, immunities: ["fire"] }]);
    const { roomId, cell } = aSpawn(layout);
    const dir = chooseElfStep({
      layout,
      grid: buildWalkGrid(layout),
      from: cell,
      hp: 5,
      roomId,
      poisonVisits: new Set(),
      immunities: ["fire"],
      orientation: 0,
    });
    expect(dir).toBe("down");
  });
});

describe("NFR-10 Mechanic layers (FR-24 / FR-31)", () => {
  it("layer 1: shortest path ignoring HP walks the lethal corridor (empty dict)", () => {
    const level = azdLevel(5, [{ type: "Mechanic", hp: 1, powerSteps: {} }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseMechanicStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        roomId,
        orientation: 0,
        targetRoomIds: zIds(layout),
        shoveLeft: new Map(),
      }),
    ).toEqual({ type: "walk", dir: "right" });
  });

  it("layer 1b: uses shove power when that shortens the path", () => {
    const { layout } = shoveShortcut([{ type: "Mechanic", hp: 5, powerSteps: { A: 1 } }]);
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseMechanicStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        roomId,
        orientation: 0,
        targetRoomIds: zIds(layout),
        shoveLeft: new Map([["A:0", 1]]),
      }),
    ).toEqual({ type: "shove", dir: "up" });
  });

  it("layer 2: fewest unjustified uses — walks A–Z rather than shoving away", () => {
    const level = azdLevel(1, [{ type: "Mechanic", hp: 5, powerSteps: { A: 2 } }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseMechanicStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        roomId,
        orientation: 0,
        targetRoomIds: zIds(layout),
        shoveLeft: new Map([["A:0", 2]]),
      }),
    ).toEqual({ type: "walk", dir: "right" });
  });

  it("layer 3: equal length + equal unjustified prefers a shove (power tie-break)", () => {
    const dirs = MECHANIC_TIE_BREAK_ORDER;
    const shoveFirst = { length: 4, unjustified: 0, firstIsShove: true, firstDir: "up" as const };
    const walkFirst = { length: 4, unjustified: 0, firstIsShove: false, firstDir: "right" as const };
    expect(mechanicPriorityBetter(shoveFirst, walkFirst, dirs)).toBe(true);
    expect(mechanicPriorityBetter(walkFirst, shoveFirst, dirs)).toBe(false);
  });

  it("layer 4: equal-length square breaks up → right → down → left", () => {
    const { layout } = mechanicSquare([{ type: "Mechanic", hp: 5, powerSteps: {} }]);
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseMechanicStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        roomId,
        orientation: 0,
        targetRoomIds: zIds(layout),
        shoveLeft: new Map(),
      }),
    ).toEqual({ type: "walk", dir: "up" });
  });
});

describe("NFR-10 Gunner layers (FR-22 / FR-31, duration unused)", () => {
  it("layer 1: fires a useful Shell soonest (north at D before walking to Z)", () => {
    const level = adzHeroes([{ type: "Gunner", hp: 5, shots: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseGunnerStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        hp: 5,
        roomId,
        poisonVisits: new Set(),
        orientation: 0,
        targetRoomIds: zIds(layout),
        shotsLeft: 1,
        clearedCells: new Set(),
        clearedMonsters: new Set(),
      }),
    ).toEqual({ type: "fire", dir: "up" });
  });

  it("layer 2: factors a shot so the first action clears a lethal D", () => {
    const level = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 1 }]);
    const layout = corridorLine(level, ["A:0", "D:0", "Z:0"]);
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseGunnerStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        hp: 2,
        roomId,
        poisonVisits: new Set(),
        orientation: 0,
        targetRoomIds: zIds(layout),
        shotsLeft: 1,
        clearedCells: new Set(),
        clearedMonsters: new Set(),
      }),
    ).toEqual({ type: "fire", dir: "right" });
  });

  it("layer 2b: with 0 shots, walks the HP-preserving / Warrior path", () => {
    const level = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 0 }]);
    const layout = corridorLine(level, ["A:0", "D:0", "Z:0"]);
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseGunnerStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        hp: 2,
        roomId,
        poisonVisits: new Set(),
        orientation: 0,
        targetRoomIds: zIds(layout),
        shotsLeft: 0,
        clearedCells: new Set(),
        clearedMonsters: new Set(),
      }),
    ).toEqual({ type: "walk", dir: "right" });
  });

  it("layer 3: equal walk options with 0 shots break right on a 2-path square", () => {
    const level = twoDLevel(1, 1, [{ type: "Gunner", hp: 5, shots: 0 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const { roomId, cell } = aSpawn(layout);
    expect(
      chooseGunnerStep({
        layout,
        grid: buildWalkGrid(layout),
        from: cell,
        hp: 5,
        roomId,
        poisonVisits: new Set(),
        orientation: 0,
        targetRoomIds: zIds(layout),
        shotsLeft: 0,
        clearedCells: new Set(),
        clearedMonsters: new Set(),
      }),
    ).toEqual({ type: "walk", dir: "right" });
  });
});

describe("NFR-10 Princess layers (FR-25 / FR-31)", () => {
  it("layer 1: highest perceived-weight reachable room is D, not Z", () => {
    const level = azdLevel(1, [{ type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const { cell } = aSpawn(layout);
    const grid = buildWalkGrid(layout);
    const reachable = reachableRoomIds(layout, grid, cell);
    const viewer = {
      id: 0,
      def: { type: "Princess" as const, hp: 5, weights: { D: 5, Z: 1 }, pull: 1 },
    };
    expect(highestWeightRoomIds(layout, viewer, [], reachable)).toEqual(["D:0"]);
  });

  it("layer 2: among equal-weight rooms, HP-preserving step takes E over D(4)", () => {
    const { layout } = hpSquare("fire", 4, [
      { type: "Princess", hp: 5, weights: { D: 1, E: 1, Z: 1 }, pull: 1 },
    ]);
    const { roomId, cell } = aSpawn(layout);
    const grid = buildWalkGrid(layout);
    const reachable = reachableRoomIds(layout, grid, cell);
    const viewer = {
      id: 0,
      def: { type: "Princess" as const, hp: 5, weights: { D: 1, E: 1, Z: 1 }, pull: 1 },
    };
    const targets = highestWeightRoomIds(layout, viewer, [], reachable);
    expect(new Set(targets)).toEqual(new Set(["D:0", "E:0", "Z:0"]));
    const dir = chooseElfStep({
      layout,
      grid,
      from: cell,
      hp: 5,
      roomId,
      poisonVisits: new Set(),
      immunities: [],
      orientation: 0,
      targetRoomIds: targets,
    });
    expect(dir).toBe("down");
  });

  it("layer 3: equal-weight equal-HP square breaks right", () => {
    const level = twoDLevel(1, 1, [{ type: "Princess", hp: 5, weights: { Z: 1 }, pull: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const { roomId, cell } = aSpawn(layout);
    const dir = chooseElfStep({
      layout,
      grid: buildWalkGrid(layout),
      from: cell,
      hp: 5,
      roomId,
      poisonVisits: new Set(),
      immunities: [],
      orientation: 0,
      targetRoomIds: zIds(layout),
    });
    expect(dir).toBe("right");
  });
});
