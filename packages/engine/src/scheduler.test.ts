// Covers FR-26–FR-31 scheduling / knowledge / death / wait for Warrior-only
// levels. See src/simulation.ts and src/pathing.ts.
import { describe, expect, it } from "vitest";
import { azdLevel, makeLevel, placeAll } from "./phase1-fixtures.js";
import {
  buildWalkGrid,
  chooseWarriorStep,
  distanceToZ,
  roomCenterLocal,
  localToWorld,
} from "./pathing.js";
import { createRun, simulate, stepRun } from "./simulation.js";
import { DEFAULT_ROOM_TILE, sealSide } from "./tiles.js";

function sealedAZ() {
  const level = makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 3 }]);
  const layout = placeAll(
    level,
    {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    },
    0,
    {
      "A:0": sealSide(DEFAULT_ROOM_TILE, "east"),
      "Z:0": sealSide(DEFAULT_ROOM_TILE, "west"),
    },
  );
  return { level, layout };
}

describe("FR-26 single-active-hero turn order", () => {
  it("keeps the second warrior in the waiting room until the first is dead", () => {
    const level = azdLevel(5, [
      { type: "Warrior", hp: 1 },
      { type: "Warrior", hp: 1 },
    ]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = createRun(level, layout);
    while (state.outcome === "in_progress" && !state.heroes[0]?.dead) {
      stepRun(state);
    }
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.heroes[1]?.spawned).toBe(false);
    expect(state.heroes[1]?.cell).toBeNull();

    const after = simulate(level, layout);
    expect(after.heroes[1]?.dead).toBe(true);
    expect(after.outcome).toBe("win");
    const spawns = after.events.filter((e) => e.type === "spawn");
    expect(spawns).toHaveLength(2);
    const firstDeathAt = after.events.findIndex((e) => e.type === "death" && e.heroId === 0);
    const secondSpawnAt = after.events.findIndex((e) => e.type === "spawn" && e.heroId === 1);
    expect(firstDeathAt).toBeGreaterThanOrEqual(0);
    expect(secondSpawnAt).toBeGreaterThan(firstDeathAt);
  });

  it("lets a later hero act while an earlier one is stuck", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }],
      [
        { type: "Warrior", hp: 2 },
        { type: "Warrior", hp: 2 },
      ],
    );
    const layout = placeAll(
      level,
      { "A:0": { x: 0, y: 0 }, "Z:0": { x: 1, y: 0 } },
      0,
      {
        "A:0": sealSide(DEFAULT_ROOM_TILE, "east"),
        "Z:0": sealSide(DEFAULT_ROOM_TILE, "west"),
      },
    );
    const state = createRun(level, layout);
    stepRun(state); // hero 0 spawn
    stepRun(state); // hero 0 wait → stuck
    expect(state.heroes[0]?.stuck).toBe(true);
    expect(state.heroes[0]?.dead).toBe(false);
    stepRun(state); // hero 1 may spawn (FR-26)
    expect(state.heroes[1]?.spawned).toBe(true);
  });
});

describe("FR-27 heroes never collide", () => {
  it("lets two living heroes occupy the same spawn cell", () => {
    const { level, layout } = sealedAZ();
    const two = makeLevel(
      [{ type: "A" }, { type: "Z" }],
      [
        { type: "Warrior", hp: 2 },
        { type: "Warrior", hp: 2 },
      ],
    );
    const state = createRun(two, layout);
    stepRun(state);
    stepRun(state);
    stepRun(state);
    expect(state.heroes[0]?.cell).toEqual(state.heroes[1]?.cell);
    expect(state.heroes[0]?.cell).not.toBeNull();
  });

  it("paths as if other heroes are absent (occupied cells are not an input)", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const grid = buildWalkGrid(layout);
    const dist = distanceToZ(layout, grid);
    const a = layout.rooms.find((r) => r.id === "A:0");
    if (!a) throw new Error("missing A");
    const from = localToWorld(a, roomCenterLocal());
    const dir = chooseWarriorStep(grid, dist, from, 0);
    expect(dir).toBe("right");
  });
});

describe("FR-28 instant death at ≤0 HP; planning ignores death", () => {
  it("kills the hero the moment HP reaches 0 and stops them", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 2 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(state.heroes[0]?.hp).toBe(0);
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(false);
  });

  it("still plans the lethal shortest path as if the hero cannot die", () => {
    const level = azdLevel(9, [{ type: "Warrior", hp: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(state.events.some((e) => e.type === "enter" && e.roomId === "D:0")).toBe(true);
    expect(state.outcome).toBe("win");
  });
});

describe("FR-29 map knowledge (no other heroes / spells / death)", () => {
  it("computes dist-to-Z from the walkable grid alone", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const grid = buildWalkGrid(layout);
    const dist = distanceToZ(layout, grid);
    const a = layout.rooms.find((r) => r.id === "A:0");
    if (!a) throw new Error("missing A");
    const from = localToWorld(a, roomCenterLocal());
    expect(dist.get(`${from.x},${from.y}`)).toBeGreaterThan(0);
    expect(dist.get(`${from.x},${from.y}`)).toBeLessThan(Number.POSITIVE_INFINITY);
  });
});

describe("FR-30 wait when no improving path", () => {
  it("waits (then stalemates) when Z is not walkable", () => {
    const { level, layout } = sealedAZ();
    const state = simulate(level, layout);
    expect(state.events.some((e) => e.type === "wait")).toBe(true);
    expect(state.outcome).toBe("stalemate");
    expect(state.events.some((e) => e.type === "loss")).toBe(false);
  });
});

describe("FR-8 gate is enforced at run creation", () => {
  it("refuses to start a run on an invalid layout", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    layout.rooms = layout.rooms.filter((r) => r.id !== "D:0");
    expect(() => createRun(level, layout)).toThrow(/FR-8/);
  });
});

describe("determinism of a Phase 1 run", () => {
  it("replays an identical event sequence for the same layout", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 2 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const a = simulate(level, layout);
    const b = simulate(level, layout);
    expect(a.events).toEqual(b.events);
    expect(a.outcome).toBe(b.outcome);
  });
});
