// Covers FR-14 (E(elem) fire / water / ice / poison + immunity bypass).
// See src/elements.ts, src/pathing.ts, src/simulation.ts.
import { describe, expect, it } from "vitest";
import { elementalTick, heroImmunities } from "./elements.js";
import { aezLine, makeLevel, oneGreen, placeAll } from "./phase2-fixtures.js";
import { buildWalkGrid, localToWorld, resolveStep } from "./pathing.js";
import { createRun, simulate, stepRun } from "./simulation.js";
import { DEFAULT_ROOM_TILE, makeEwCorridorTile, paintGreen } from "./tiles.js";

function damageEvents(events: { type: string; amount?: number; hp?: number }[]) {
  return events.filter((e) => e.type === "damage");
}

describe("FR-14 fire: 1 damage per green-cell entry", () => {
  it("deals 1 HP when a warrior steps on the single green fire cell", () => {
    const { level, layout } = aezLine("fire", [{ type: "Warrior", hp: 5 }]);
    const state = simulate(level, layout);
    expect(damageEvents(state.events)).toEqual([
      expect.objectContaining({ type: "damage", amount: 1, hp: 4 }),
    ]);
    expect(state.outcome).toBe("loss");
    expect(state.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(true);
  });

  it("kills a 1-HP warrior on the fire cell before Z", () => {
    const { level, layout } = aezLine("fire", [{ type: "Warrior", hp: 1 }]);
    const state = simulate(level, layout);
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.outcome).toBe("win");
    expect(state.events.some((e) => e.type === "loss")).toBe(false);
  });
});

describe("FR-14 water: impassable; forced landing is death", () => {
  it("does not treat a water cell as a voluntary step", () => {
    const { layout } = aezLine("water", [{ type: "Warrior", hp: 5 }]);
    const grid = buildWalkGrid(layout);
    const e = layout.rooms.find((r) => r.id === "E:0");
    if (!e) throw new Error("missing E");
    const from = localToWorld(e, { x: 2, y: 3 });
    expect(resolveStep(grid, from, "down", [], layout)).toBeUndefined();
    expect(resolveStep(grid, from, "left", [], layout)).toBeDefined();
  });

  it("kills a non-immune hero whose ice slide ends on water", () => {
    const corridor = makeEwCorridorTile();
    const level = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "E", element: "ice" },
        { type: "E", element: "water" },
      ],
      [{ type: "Warrior", hp: 5 }],
    );
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 0 },
        "E:0": { x: 1, y: 0 },
        "E:1": { x: 2, y: 0 },
        "Z:0": { x: 3, y: 0 },
      },
      0,
      {
        "A:0": corridor,
        "E:0": paintGreen(corridor, [{ x: 3, y: 2 }]),
        "E:1": paintGreen(corridor, [{ x: 2, y: 2 }]),
        "Z:0": corridor,
      },
    );
    const state = simulate(level, layout);
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.outcome).toBe("win");
    expect(state.events.some((e) => e.type === "loss")).toBe(false);
  });
});

describe("FR-14 ice: slide until a wall (or Z) stops the hero", () => {
  it("keeps sliding through walkable cells after entering ice", () => {
    const { layout } = aezLine("ice", [{ type: "Warrior", hp: 5 }], oneGreen(2, 2));
    const grid = buildWalkGrid(layout);
    const e = layout.rooms.find((r) => r.id === "E:0");
    if (!e) throw new Error("missing E");
    const from = localToWorld(e, { x: 1, y: 2 });
    const path = resolveStep(grid, from, "right", [], layout);
    expect(path?.length).toBeGreaterThan(1);
    expect(path?.[0]).toEqual(localToWorld(e, { x: 2, y: 2 }));
  });

  it("resolves the whole slide as one scheduler action", () => {
    const { level, layout } = aezLine("ice", [{ type: "Warrior", hp: 5 }], oneGreen(2, 2));
    const state = createRun(level, layout);
    stepRun(state);
    const grid = buildWalkGrid(layout);
    let guard = 0;
    while (state.outcome === "in_progress" && state.heroes[0]?.cell && guard++ < 40) {
      const cell = state.heroes[0].cell;
      const next = resolveStep(grid, cell, "right", [], layout);
      const hitsIce = next?.some((p) => grid.cells.get(`${p.x},${p.y}`)?.element === "ice");
      if (hitsIce) break;
      stepRun(state);
    }
    const before = state.stepCount;
    const { events } = stepRun(state);
    expect(events.filter((e) => e.type === "move").length).toBeGreaterThan(1);
    expect(state.stepCount).toBe(before + 1);
  });
});

describe("FR-14 poison: +1 first visit, −3 after; global cell memory", () => {
  it("heals on the first entry and damages a later hero on the same cell", () => {
    const { level, layout } = aezLine("poison", [
      { type: "Warrior", hp: 2 },
      { type: "Warrior", hp: 2 },
    ]);
    // Lethal D is not present; first warrior reaches Z and loses the run
    // before the second can act. Use a line that kills after the poison cell
    // via fire-sized HP: walk poison then Z — first loses. So use two
    // sequential runs on the same layout after the first dies on a 1-HP
    // fire? Instead: poison then they still reach Z.
    //
    // Two warriors only if the first dies. Fire-kill after poison: use
    // default interior? Keep it simple — unit tick + one simulate visit.
    const first = elementalTick("poison", [], false);
    expect(first).toEqual({ hpDelta: 1, die: false, recordPoisonVisit: true, ignored: false });
    const later = elementalTick("poison", [], true);
    expect(later).toEqual({ hpDelta: -3, die: false, recordPoisonVisit: true, ignored: false });

    const one = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "E", element: "poison" },
        { type: "D", damage: 9 },
      ],
      [
        { type: "Warrior", hp: 1 },
        { type: "Warrior", hp: 3 },
      ],
    );
    const dungeon = placeAll(
      one,
      {
        "A:0": { x: 0, y: 0 },
        "E:0": { x: 1, y: 0 },
        "D:0": { x: 2, y: 0 },
        "Z:0": { x: 3, y: 0 },
      },
      0,
      { "E:0": oneGreen() },
    );
    const state = simulate(one, dungeon);
    const dmg = damageEvents(state.events);
    expect(dmg.some((e) => e.amount === -1)).toBe(true);
    expect(dmg.some((e) => e.amount === 3)).toBe(true);
    expect(state.poisonVisits.size).toBe(1);
  });
});

describe("FR-14 immunity: ignore the cell entirely", () => {
  it("records no fire damage for an Elf immune to fire", () => {
    const { level, layout } = aezLine("fire", [
      { type: "Elf", hp: 5, immunities: ["fire"] },
    ]);
    expect(heroImmunities({ type: "Elf", hp: 5, immunities: ["fire"] })).toEqual(["fire"]);
    const state = simulate(level, layout);
    expect(damageEvents(state.events)).toEqual([]);
    expect(state.heroes[0]?.hp).toBe(5);
    expect(state.outcome).toBe("loss");
  });

  it("lets an water-immune Elf step onto a water cell", () => {
    const { layout } = aezLine("water", [{ type: "Elf", hp: 5, immunities: ["water"] }]);
    const grid = buildWalkGrid(layout);
    const e = layout.rooms.find((r) => r.id === "E:0");
    if (!e) throw new Error("missing E");
    const from = localToWorld(e, { x: 2, y: 3 });
    expect(resolveStep(grid, from, "down", ["water"], layout)).toEqual([
      localToWorld(e, { x: 2, y: 2 }),
    ]);
  });

  it("does not slide an ice-immune Elf", () => {
    const { layout } = aezLine("ice", [{ type: "Elf", hp: 5, immunities: ["ice"] }]);
    const grid = buildWalkGrid(layout);
    const e = layout.rooms.find((r) => r.id === "E:0");
    if (!e) throw new Error("missing E");
    const from = localToWorld(e, { x: 1, y: 2 });
    const path = resolveStep(grid, from, "right", ["ice"], layout);
    expect(path).toEqual([localToWorld(e, { x: 2, y: 2 })]);
  });

  it("skips poison entirely when immune", () => {
    expect(elementalTick("poison", ["poison"], false)).toEqual({
      hpDelta: 0,
      die: false,
      recordPoisonVisit: false,
      ignored: true,
    });
  });
});
