// Covers FR-24 (Mechanic shove power + pathing). Priority layers isolated
// per NFR-10: shortest path (ignore HP, use power) → fewest unjustified
// shoves → power as tie-break → up → right → down → left.
import { describe, expect, it } from "vitest";
import { azdLevel, placeAll } from "./phase1-fixtures.js";
import { mechanicSquare, shoveShortcut } from "./phase5-fixtures.js";
import { simulate } from "./simulation.js";
import { mechanicPriorityBetter } from "./mechanic.js";
import { MECHANIC_TIE_BREAK_ORDER, orientedMechanicTieBreak } from "./tiles.js";

function enteredRooms(events: { type: string; roomId?: string }[]): string[] {
  return events.filter((e) => e.type === "enter").map((e) => e.roomId ?? "");
}

function firstMoves(events: { type: string; dir?: string }[]): string[] {
  return events.filter((e) => e.type === "move").map((e) => (e as { dir: string }).dir);
}

function shoves(events: { type: string }[]) {
  return events.filter((e) => e.type === "shove");
}

describe("FR-24 Mechanic shortest path ignoring HP", () => {
  it("walks the lethal A–D–Z line when that is the only path and dict is empty", () => {
    const level = azdLevel(5, [{ type: "Mechanic", hp: 1, powerSteps: {} }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toEqual(["A:0", "D:0"]);
    expect(state.outcome).toBe("win");
    expect(shoves(state.events)).toHaveLength(0);
  });
});

describe("FR-24 Mechanic uses shove power to shorten the path", () => {
  it("shoves A north next to Z instead of walking through D", () => {
    const { level, layout } = shoveShortcut([
      { type: "Mechanic", hp: 5, powerSteps: { A: 1 } },
    ]);
    const state = simulate(level, layout);
    expect(shoves(state.events)).toHaveLength(1);
    expect(shoves(state.events)[0]).toMatchObject({
      type: "shove",
      roomId: "A:0",
      dir: "up",
    });
    expect(enteredRooms(state.events)).toContain("Z:0");
    expect(enteredRooms(state.events)).not.toContain("D:0");
    expect(state.outcome).toBe("loss");
  });

  it("exhausts the per-room budget and cannot shove a second time", () => {
    const { level, layout } = shoveShortcut([
      { type: "Mechanic", hp: 5, powerSteps: { A: 1 } },
    ]);
    const state = simulate(level, layout);
    expect(state.heroes[0]?.shoveLeft.get("A:0")).toBe(0);
    expect(shoves(state.events)).toHaveLength(1);
  });
});

describe("FR-24 power as a tie-break (NFR-10 layer)", () => {
  it("ranks a shove-first path above an equal-length walk-first path", () => {
    const dirs = MECHANIC_TIE_BREAK_ORDER;
    expect(
      mechanicPriorityBetter(
        { length: 3, unjustified: 0, firstIsShove: true, firstDir: "up" },
        { length: 3, unjustified: 0, firstIsShove: false, firstDir: "right" },
        dirs,
      ),
    ).toBe(true);
  });
});

describe("FR-24 fewest unjustified power uses", () => {
  it("walks A–Z rather than shoving A away when the walk is already shortest", () => {
    const level = azdLevel(1, [{ type: "Mechanic", hp: 5, powerSteps: { A: 2 } }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = simulate(level, layout);
    expect(shoves(state.events)).toHaveLength(0);
    expect(enteredRooms(state.events)).toEqual(["A:0", "Z:0"]);
    expect(state.outcome).toBe("loss");
  });
});

describe("FR-24 / FR-31 Mechanic directional tie-break", () => {
  it("uses up → right → down → left at orientation 0", () => {
    expect(MECHANIC_TIE_BREAK_ORDER).toEqual(["up", "right", "down", "left"]);
    expect(orientedMechanicTieBreak(0)).toEqual(["up", "right", "down", "left"]);
    expect(orientedMechanicTieBreak(90)).toEqual(["left", "up", "right", "down"]);
  });

  it("breaks a 2-path square toward +y (up) at orientation 0", () => {
    const { level, layout } = mechanicSquare([
      { type: "Mechanic", hp: 5, powerSteps: {} },
    ]);
    const state = simulate(level, layout);
    expect(firstMoves(state.events)[0]).toBe("up");
    expect(enteredRooms(state.events)).toContain("D:1");
    expect(enteredRooms(state.events)).not.toContain("D:0");
  });
});
