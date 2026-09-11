// Covers FR-17 (Tax Room T(x, elem): dark cells like E(elem), FIFO gold
// toll on light cells, instant death on a forced unpayable crossing).
// See src/gold.ts, src/tiles.ts, src/pathing.ts, src/simulation.ts.
import { describe, expect, it } from "vitest";
import { aotzLevel, corridorLine, makeLevel, oneLightCorridor, placeAll } from "./phase3-fixtures.js";
import { buildWalkGrid, localToWorld, resolveStep } from "./pathing.js";
import { simulate } from "./simulation.js";
import { validateLayout } from "./placement.js";
import {
  DEFAULT_TOLL_TILE,
  makeEwCorridorTile,
  paintDark,
  paintGreen,
  paintLight,
} from "./tiles.js";

describe("FR-17 light cells: FIFO toll, block, forced death", () => {
  it("lets a warrior pay one gold to cross, refunding the coin to its source O", () => {
    const level = aotzLevel(1, 1, "ice");
    const layout = corridorLine(level, ["A:0", "O:0", "T:0", "Z:0"], {
      "T:0": oneLightCorridor(),
    });
    expect(validateLayout(level, layout).ok).toBe(true);

    const state = simulate(level, layout);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "pickup", heroId: 0, roomId: "O:0", amount: 1 }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "toll",
        heroId: 0,
        amount: 1,
        gold: 0,
        refunds: [{ roomId: "O:0", amount: 1 }],
      }),
    );
    expect(state.roomGold.get("O:0")).toBe(1);
    expect(state.outcome).toBe("loss");
  });

  it("treats an unpaid light cell as a blocked voluntary step", () => {
    const level = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "T", cost: 1, element: "ice" },
      ],
      [{ type: "Warrior", hp: 5 }],
    );
    const layout = corridorLine(level, ["A:0", "T:0", "Z:0"], {
      "T:0": oneLightCorridor(),
    });
    const grid = buildWalkGrid(layout);
    const t = layout.rooms.find((r) => r.id === "T:0");
    if (!t) throw new Error("missing T");
    const from = localToWorld(t, { x: 1, y: 2 });
    expect(resolveStep(grid, from, "right", [], layout, 0)).toBeUndefined();
    expect(resolveStep(grid, from, "right", [], layout, 1)?.[0]).toEqual(localToWorld(t, { x: 2, y: 2 }));

    const state = simulate(level, layout);
    expect(state.outcome).toBe("stalemate");
    expect(state.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(false);
  });

  it("counts a destination-room pile toward a voluntary light hatch (FR-16)", () => {
    const level = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "T", cost: 1, element: "ice" },
      ],
      [{ type: "Warrior", hp: 5 }],
    );
    const layout = corridorLine(level, ["A:0", "T:0", "Z:0"], {
      "T:0": paintLight(makeEwCorridorTile(), [{ x: 0, y: 2 }]),
    });
    const grid = buildWalkGrid(layout);
    const a = layout.rooms.find((r) => r.id === "A:0");
    const t = layout.rooms.find((r) => r.id === "T:0");
    if (!a || !t) throw new Error("missing rooms");
    const from = localToWorld(a, { x: 4, y: 2 });
    expect(resolveStep(grid, from, "right", [], layout, 0)).toBeUndefined();
    expect(resolveStep(grid, from, "right", [], layout, 0, new Map([["T:0", 1]]))?.[0]).toEqual(
      localToWorld(t, { x: 0, y: 2 }),
    );
  });

  it("lets a later hero pick up a T death pile before paying the light hatch", () => {
    const level = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "O", gold: 2 },
        { type: "T", cost: 1, element: "fire" },
      ],
      [
        { type: "Warrior", hp: 1 },
        { type: "Warrior", hp: 1 },
      ],
    );
    const layout = corridorLine(level, ["A:0", "O:0", "T:0", "Z:0"], {
      "T:0": DEFAULT_TOLL_TILE,
    });
    expect(validateLayout(level, layout).ok).toBe(true);

    const state = simulate(level, layout);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "gold_drop", heroId: 0, roomId: "T:0", amount: 1 }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "pickup", heroId: 1, roomId: "T:0", amount: 1 }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "toll", heroId: 1, amount: 1 }),
    );
    expect(state.heroes[1]?.dead).toBe(true);
    expect(state.outcome).toBe("win");
  });

  it("kills a hero shoved onto an unpayable light cell (ice slide)", () => {
    const corridor = makeEwCorridorTile();
    const level = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "E", element: "ice" },
        { type: "T", cost: 1, element: "fire" },
      ],
      [{ type: "Warrior", hp: 5 }],
    );
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 0 },
        "E:0": { x: 1, y: 0 },
        "T:0": { x: 2, y: 0 },
        "Z:0": { x: 3, y: 0 },
      },
      0,
      {
        "A:0": corridor,
        "E:0": paintGreen(corridor, [{ x: 3, y: 2 }]),
        "T:0": paintLight(corridor, [{ x: 2, y: 2 }]),
        "Z:0": corridor,
      },
    );
    const state = simulate(level, layout);
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.outcome).toBe("win");
    expect(state.events.some((e) => e.type === "loss")).toBe(false);
    expect(state.events.some((e) => e.type === "toll")).toBe(false);
  });
});

describe("FR-17 dark cells behave like E(elem)", () => {
  it("deals 1 fire damage on a dark cell and ignores it when the Elf is immune", () => {
    const corridor = makeEwCorridorTile();
    const dark = paintDark(corridor, [{ x: 2, y: 2 }]);
    const warriorLevel = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "T", cost: 0, element: "fire" },
      ],
      [{ type: "Warrior", hp: 5 }],
    );
    const warriorLayout = corridorLine(warriorLevel, ["A:0", "T:0", "Z:0"], { "T:0": dark });
    const burned = simulate(warriorLevel, warriorLayout);
    expect(burned.events.filter((e) => e.type === "damage")).toEqual([
      expect.objectContaining({ type: "damage", amount: 1, hp: 4 }),
    ]);
    expect(burned.outcome).toBe("loss");

    const elfLevel = makeLevel(
      [
        { type: "A" },
        { type: "Z" },
        { type: "T", cost: 0, element: "fire" },
      ],
      [{ type: "Elf", hp: 5, immunities: ["fire"] }],
    );
    const elfLayout = corridorLine(elfLevel, ["A:0", "T:0", "Z:0"], { "T:0": dark });
    const immune = simulate(elfLevel, elfLayout);
    expect(immune.events.some((e) => e.type === "damage")).toBe(false);
    expect(immune.outcome).toBe("loss");
  });

  it("matches A-room hatches: default T dark/light cells are open for FR-6", () => {
    const level = aotzLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "O:0": { x: 1, y: 0 },
      "T:0": { x: 2, y: 0 },
      "Z:0": { x: 3, y: 0 },
    });
    expect(layout.rooms.find((r) => r.id === "T:0")).toBeTruthy();
    expect(DEFAULT_TOLL_TILE[2]?.[2]).toBe("dark");
    expect(DEFAULT_TOLL_TILE[2]?.[0]).toBe("light");
    expect(validateLayout(level, layout).ok).toBe(true);
  });
});

describe("FR-16 / FR-17 Warrior routes through O to open a toll", () => {
  it("detours pickup so the only path through T is payable", () => {
    const level = aotzLevel(1, 1, "ice");
    const layout = corridorLine(level, ["A:0", "O:0", "T:0", "Z:0"], {
      "T:0": oneLightCorridor(),
    });
    const finished = simulate(level, layout);
    expect(finished.events.some((e) => e.type === "pickup" && e.roomId === "O:0")).toBe(true);
    expect(finished.events.some((e) => e.type === "toll")).toBe(true);
    expect(finished.roomGold.get("O:0")).toBe(1);
    expect(finished.outcome).toBe("loss");
  });
});
