// Covers FR-20 (Warrior shortest path, ignore HP) and FR-31 (orientation-
// relative tie-break). Priority layers are isolated per NFR-10.
import { describe, expect, it } from "vitest";
import { azdLevel, placeAll, twoDLevel } from "./phase1-fixtures.js";
import { simulate } from "./simulation.js";
import { hatchDirection, orientedTieBreak } from "./tiles.js";

function enteredRooms(events: { type: string; roomId?: string }[]): string[] {
  return events.filter((e) => e.type === "enter").map((e) => e.roomId ?? "");
}

function firstMoves(events: { type: string; dir?: string }[]): string[] {
  return events.filter((e) => e.type === "move").map((e) => (e as { dir: string }).dir);
}

describe("FR-20 Warrior shortest path, ignoring HP", () => {
  it("takes the unique shortest path even when it is lethal", () => {
    // Only path is A–D–Z. Warrior(1) still walks into D(5) and dies (FR-28).
    const level = azdLevel(5, [{ type: "Warrior", hp: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toEqual(["A:0", "D:0"]);
    expect(state.outcome).toBe("win");
  });

  it("prefers a 1-step path to Z over a longer path through D", () => {
    const level = azdLevel(2, [{ type: "Warrior", hp: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toEqual(["A:0", "Z:0"]);
    expect(state.events.some((e) => e.type === "enter" && e.roomId === "D:0")).toBe(false);
    expect(state.outcome).toBe("loss");
  });
});

describe("FR-31 / FR-20 directional tie-break relative to orientation", () => {
  it("uses right → up → left → down at orientation 0", () => {
    expect(orientedTieBreak(0)).toEqual(["right", "up", "left", "down"]);
    expect(hatchDirection(0)).toBe("right");
  });

  it("rotates the tie list with dungeon orientation (90° CCW)", () => {
    expect(orientedTieBreak(90)).toEqual(["up", "left", "down", "right"]);
    expect(orientedTieBreak(180)).toEqual(["left", "down", "right", "up"]);
    expect(orientedTieBreak(270)).toEqual(["down", "right", "up", "left"]);
  });

  it("breaks a 2-path square toward +x (right) at orientation 0", () => {
    const level = twoDLevel(1, 1, [{ type: "Warrior", hp: 5 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "D:1": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    const state = simulate(level, layout);
    expect(firstMoves(state.events)[0]).toBe("right");
    expect(enteredRooms(state.events)).toContain("D:0");
    expect(enteredRooms(state.events)).not.toContain("D:1");
  });

  it("breaks the same square toward +y (up in world) at orientation 90", () => {
    const level = twoDLevel(1, 1, [{ type: "Warrior", hp: 5 }]);
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 1 },
        "D:0": { x: 1, y: 1 },
        "D:1": { x: 0, y: 0 },
        "Z:0": { x: 1, y: 0 },
      },
      90,
    );
    const state = simulate(level, layout);
    // At 90° CCW, "right" relative to the dungeon is world +y.
    // From A, +y is blocked (no room north); next improving pick in
    // [up, left, down, right] that decreases dist is down (toward D:1).
    expect(firstMoves(state.events)[0]).toBe("down");
    expect(enteredRooms(state.events)).toContain("D:1");
    expect(enteredRooms(state.events)).not.toContain("D:0");
  });
});
