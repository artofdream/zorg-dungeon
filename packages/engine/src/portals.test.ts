// Covers FR-15 (Portal Room P(n, f): i-th entry teleport, waiting-room
// fallback when f(i) overshoots visit history). See src/portals.ts and
// src/simulation.ts.
import { describe, expect, it } from "vitest";
import { evalPortalIndex, lookupVisit } from "./portals.js";
import { apzLevel, corridorLine } from "./phase3-fixtures.js";
import { createRun, simulate, stepRun } from "./simulation.js";
import { validateLayout } from "./placement.js";

describe("FR-15 portal formula f(i)", () => {
  it("evaluates constants, identity, and linear maps used in the corpus", () => {
    expect(evalPortalIndex("1", 3)).toBe(1);
    expect(evalPortalIndex("5", 1)).toBe(5);
    expect(evalPortalIndex("i->i", 2)).toBe(2);
    expect(evalPortalIndex("i->i-1", 1)).toBe(0);
    expect(evalPortalIndex("x↦7x-6", 1)).toBe(1);
    expect(evalPortalIndex("x↦7x-6", 2)).toBe(8);
  });

  it("reads k-th-most-recent visit; overshoot is undefined", () => {
    const visits = [
      { roomId: "A:0", firstCell: { x: 2, y: 2 } },
      { roomId: "D:0", firstCell: { x: 5, y: 2 } },
    ];
    expect(lookupVisit(visits, 1)?.roomId).toBe("D:0");
    expect(lookupVisit(visits, 2)?.roomId).toBe("A:0");
    expect(lookupVisit(visits, 3)).toBeUndefined();
    expect(lookupVisit(visits, 0)).toBeUndefined();
  });
});

describe("FR-15 P(n, f) teleport on entry", () => {
  it("P(1, 1) sends the hero to their previous room, then lets them pass", () => {
    const level = apzLevel({ type: "P", entries: 1, formula: "1" });
    const layout = corridorLine(level, ["A:0", "P:0", "Z:0"]);
    expect(validateLayout(level, layout).ok).toBe(true);

    const state = simulate(level, layout);
    const teleports = state.events.filter((e) => e.type === "teleport");
    expect(teleports).toEqual([
      expect.objectContaining({ type: "teleport", heroId: 0, fromRoomId: "P:0", toRoomId: "A:0" }),
    ]);
    const pEnters = state.events.filter((e) => e.type === "enter" && e.roomId === "P:0");
    expect(pEnters.length).toBe(2);
    expect(state.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(true);
    expect(state.outcome).toBe("loss");
  });

  it("P(1, 5) overshoots a short history and returns the hero to the waiting room", () => {
    const level = apzLevel({ type: "P", entries: 1, formula: "5" });
    const layout = corridorLine(level, ["A:0", "P:0", "Z:0"]);
    const state = createRun(level, layout);
    stepRun(state); // spawn A
    let guard = 0;
    while (state.outcome === "in_progress" && !state.events.some((e) => e.type === "wait_room") && guard++ < 40) {
      stepRun(state);
    }
    expect(state.events.some((e) => e.type === "wait_room" && e.heroId === 0)).toBe(true);
    expect(state.heroes[0]?.spawned).toBe(false);
    expect(state.heroes[0]?.cell).toBeNull();

    const finished = simulate(level, layout);
    expect(finished.events.filter((e) => e.type === "wait_room")).toHaveLength(1);
    expect(finished.events.filter((e) => e.type === "spawn")).toHaveLength(2);
    expect(finished.outcome).toBe("loss");
    expect(finished.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(true);
  });

  it("stops teleporting after n entries (P becomes a normal room)", () => {
    const level = apzLevel({ type: "P", entries: 1, formula: "1" });
    const layout = corridorLine(level, ["A:0", "P:0", "Z:0"]);
    const state = simulate(level, layout);
    expect(state.events.filter((e) => e.type === "teleport")).toHaveLength(1);
    expect(state.events.filter((e) => e.type === "wait_room")).toHaveLength(0);
  });
});
