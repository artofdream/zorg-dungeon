// Covers FR-11 (A spawn / main replacement), FR-12 (Z instant loss),
// FR-13 (D(x) damage / heal on entry). See src/simulation.ts.
import { describe, expect, it } from "vitest";
import { azdLevel, placeAll, twoALevel } from "./phase1-fixtures.js";
import { createRun, simulate, stepRun } from "./simulation.js";

describe("FR-11 spawn room A", () => {
  it("spawns the warrior from the designated main A", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = createRun(level, layout);
    expect(state.mainAId).toBe("A:0");
    const { events } = stepRun(state);
    expect(events[0]).toMatchObject({ type: "spawn", heroId: 0, roomId: "A:0" });
    expect(events.some((e) => e.type === "enter" && e.roomId === "A:0")).toBe(true);
  });

  it("replaces the main A when the hero visits another A", () => {
    const level = twoALevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "A:1": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    const enters = state.events.filter((e) => e.type === "enter");
    expect(enters.map((e) => e.roomId)).toContain("A:1");
    expect(state.mainAId).toBe("A:1");
  });
});

describe("FR-12 Zorg room Z", () => {
  it("ends the run in immediate loss when a hero enters Z", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 5 }]);
    // A adjacent to Z — shortest path never needs D.
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = simulate(level, layout);
    expect(state.outcome).toBe("loss");
    expect(state.events.some((e) => e.type === "loss" && e.heroId === 0)).toBe(true);
    expect(state.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(true);
  });
});

describe("FR-13 damage room D(x)", () => {
  it("applies x damage on every entry; lethal D kills before Z", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 2 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    const dmg = state.events.find((e) => e.type === "damage");
    expect(dmg).toMatchObject({ type: "damage", amount: 2, hp: 0 });
    expect(state.events.some((e) => e.type === "death")).toBe(true);
    expect(state.outcome).toBe("win");
    expect(state.events.some((e) => e.type === "loss")).toBe(false);
  });

  it("heals when x is negative", () => {
    const level = azdLevel(-3, [{ type: "Warrior", hp: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    const dmg = state.events.find((e) => e.type === "damage");
    expect(dmg).toMatchObject({ type: "damage", amount: -3, hp: 4 });
    // Healed warrior still reaches Z → loss (FR-12).
    expect(state.outcome).toBe("loss");
  });
});
