// Covers FR-22 (Gunner 2-arg path/fire priorities) and FR-23 (Shell).
// S3 / NFR-8: a stored third argument must not change instant-shot behavior.
import { describe, expect, it } from "vitest";
import { azdLevel, placeAll } from "./phase1-fixtures.js";
import { aezLine } from "./phase2-fixtures.js";
import { corridorLine } from "./phase3-fixtures.js";
import { adzHeroes } from "./phase5-fixtures.js";
import { parseHero } from "./loader.js";
import { createRun, simulate, stepRun } from "./simulation.js";
import { makeEwCorridorTile, paintGreen } from "./tiles.js";

function enteredRooms(events: { type: string; roomId?: string }[]): string[] {
  return events.filter((e) => e.type === "enter").map((e) => e.roomId ?? "");
}

function fires(events: { type: string }[]) {
  return events.filter((e) => e.type === "fire");
}

function shells(events: { type: string }[]) {
  return events.filter((e) => e.type === "shell");
}

describe("FR-22 Gunner fires soonest, then HP-preserving path", () => {
  it("fires north at a D monster before walking to Z", () => {
    const level = adzHeroes([{ type: "Gunner", hp: 5, shots: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = simulate(level, layout);
    expect(fires(state.events)).toHaveLength(1);
    expect(fires(state.events)[0]).toMatchObject({ dir: "up" });
    const fireAt = state.events.findIndex((e) => e.type === "fire");
    const zAt = state.events.findIndex((e) => e.type === "enter" && e.roomId === "Z:0");
    expect(fireAt).toBeGreaterThanOrEqual(0);
    expect(zAt).toBeGreaterThan(fireAt);
    expect(state.clearedMonsters.has("D:0")).toBe(true);
    expect(state.outcome).toBe("loss");
  });

  it("factors its shot so a lethal D is cleared before walking through", () => {
    const level = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 1 }]);
    const layout = corridorLine(level, ["A:0", "D:0", "Z:0"]);
    const state = simulate(level, layout);
    expect(fires(state.events)).toHaveLength(1);
    expect(state.clearedMonsters.has("D:0")).toBe(true);
    expect(enteredRooms(state.events)).toContain("Z:0");
    expect(state.heroes[0]?.hp).toBe(2);
    expect(state.heroes[0]?.dead).toBe(false);
    expect(state.outcome).toBe("loss");
  });

  it("stops after c shots (cannot invent extra ammo)", () => {
    const level = adzHeroes([{ type: "Gunner", hp: 5, shots: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = simulate(level, layout);
    expect(fires(state.events)).toHaveLength(1);
    expect(state.heroes[0]?.shotsLeft).toBe(0);
  });
});

describe("FR-22 S3 third argument is stored and unused", () => {
  it("parse-accepts duration without encoding shot-lifetime behavior", () => {
    expect(parseHero("Gunner(2, 1, 99)")).toEqual({
      type: "Gunner",
      hp: 2,
      shots: 1,
      duration: 99,
    });
    expect(parseHero("Gunner(2, ∞, ∞)")).toMatchObject({
      type: "Gunner",
      shots: "inf",
      duration: "inf",
    });
  });

  it("Gunner(2, 1, 99) fires one instant Shell, same as Gunner(2, 1)", () => {
    const heroes = [
      { type: "Gunner" as const, hp: 2, shots: 1, duration: 99 },
      { type: "Gunner" as const, hp: 2, shots: 1 },
    ];
    const results = heroes.map((hero) => {
      const level = azdLevel(5, [hero]);
      const layout = corridorLine(level, ["A:0", "D:0", "Z:0"]);
      return simulate(level, layout);
    });
    const [withDur, twoArg] = results;
    expect(fires(withDur?.events ?? [])).toHaveLength(1);
    expect(fires(twoArg?.events ?? [])).toHaveLength(1);
    expect(withDur?.heroes[0]?.hp).toBe(twoArg?.heroes[0]?.hp);
    expect(withDur?.outcome).toBe(twoArg?.outcome);
    expect(withDur?.clearedMonsters.has("D:0")).toBe(true);
  });

  it("duration inf does not block the 2-arg fire rule (duration unused)", () => {
    const level = azdLevel(5, [{ type: "Gunner", hp: 2, shots: 1, duration: "inf" }]);
    const layout = corridorLine(level, ["A:0", "D:0", "Z:0"]);
    const state = simulate(level, layout);
    expect(fires(state.events)).toHaveLength(1);
    expect(state.outcome).toBe("loss");
  });
});

describe("FR-23 Shell instant projectile", () => {
  it("clears elemental water cells and then the Gunner can walk the opened line", () => {
    const { level, layout } = aezLine(
      "water",
      [{ type: "Gunner", hp: 3, shots: 1 }],
      paintGreen(makeEwCorridorTile(), [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]),
    );
    const state = simulate(level, layout);
    expect(shells(state.events).length).toBeGreaterThan(0);
    expect(enteredRooms(state.events)).toContain("Z:0");
    expect(state.outcome).toBe("loss");
    expect(state.clearedCells.size).toBeGreaterThan(0);
  });

  it("stops at a wall and does not enter the void past the dungeon edge", () => {
    const level = azdLevel(1, [{ type: "Gunner", hp: 5, shots: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = createRun(level, layout);
    stepRun(state); // spawn
    stepRun(state); // fire up at D
    const shell = state.events.find((e) => e.type === "shell");
    expect(shell && shell.type === "shell").toBe(true);
    if (shell && shell.type === "shell") {
      for (const cell of shell.cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("deals 2 damage to a hero standing on a crossed cell", () => {
    const level = azdLevel(1, [
      { type: "Warrior", hp: 5 },
      { type: "Gunner", hp: 5, shots: 1 },
    ]);
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 0 },
        "Z:0": { x: 1, y: 0 },
        "D:0": { x: 2, y: 0 },
      },
      0,
      {
        "A:0": makeEwCorridorTile(),
        "Z:0": makeEwCorridorTile(),
        "D:0": makeEwCorridorTile(),
      },
    );
    const state = createRun(level, layout);
    stepRun(state); // warrior spawn
    const warrior = state.heroes[0];
    if (warrior?.cell) {
      // Park the warrior on the east hatch of A, in the Gunner's line of fire.
      warrior.cell = { x: 4, y: 2 };
      warrior.stuck = true;
    }
    stepRun(state); // gunner spawn
    stepRun(state); // gunner fire (D is east, through the warrior)
    expect(state.heroes[0]?.hp).toBe(3);
    expect(state.events.some((e) => e.type === "shell" && e.hitHeroIds.includes(0))).toBe(true);
  });

  it("does not cancel FR-12: entering Z is still an instant loss after a Shell crosses Z", () => {
    const level = azdLevel(1, [{ type: "Gunner", hp: 5, shots: 1 }]);
    const layout = corridorLine(level, ["A:0", "Z:0", "D:0"]);
    const state = simulate(level, layout);
    expect(state.outcome).toBe("loss");
    expect(state.clearedMonsters.has("Z:0")).toBe(false);
  });
});

describe("FR-22 / FR-31 Gunner uses Warrior tie order", () => {
  it("breaks equal walk options toward +x (right) at orientation 0 when nothing to shoot", () => {
    const level = azdLevel(0, [{ type: "Gunner", hp: 5, shots: 0 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "Z:0": { x: 1, y: 0 },
    });
    // Only one improving path (right then down). With 0 shots this is Elf/Warrior-like.
    const state = simulate(level, layout);
    const firstMove = state.events.find((e) => e.type === "move");
    expect(firstMove && firstMove.type === "move" ? firstMove.dir : "").toBe("right");
  });
});
