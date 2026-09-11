// Covers FR-25: Princess weight-pull, including that every hero (not only
// princesses) is subject to perceived weights. HP-preserving shortest path
// to the highest-weight reachable room; standard Warrior tie order.
import { describe, expect, it } from "vitest";
import { azdLevel, placeAll, twoDLevel } from "./phase1-fixtures.js";
import { hpSquare } from "./phase2-fixtures.js";
import { perceivedWeight } from "./weights.js";
import { simulate } from "./simulation.js";

function enteredRooms(events: { type: string; roomId?: string }[]): string[] {
  return events.filter((e) => e.type === "enter").map((e) => e.roomId ?? "");
}

function firstMoves(events: { type: string; dir?: string }[]): string[] {
  return events.filter((e) => e.type === "move").map((e) => (e as { dir: string }).dir);
}

describe("FR-25 Princess default {Z:1} heads for Z", () => {
  it("walks A–Z like an Elf when only Z has weight", () => {
    const level = azdLevel(2, [{ type: "Princess", hp: 5, weights: { Z: 1 }, pull: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
    });
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toEqual(["A:0", "Z:0"]);
    expect(state.outcome).toBe("loss");
  });
});

describe("FR-25 Princess prefers the highest perceived-weight room", () => {
  it("camps a higher-weight D and waits rather than walking into Z", () => {
    const level = azdLevel(1, [{ type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 1 }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toContain("D:0");
    expect(enteredRooms(state.events)).not.toContain("Z:0");
    expect(state.heroes[0]?.roomId).toBe("D:0");
    expect(state.heroes[0]?.stuck).toBe(true);
    expect(state.outcome).toBe("stalemate");
  });
});

describe("FR-25 among equal-weight targets, HP-preserving shortest path", () => {
  it("takes E over D(4) when both rooms share the same weight", () => {
    const { level, layout } = hpSquare("fire", 4, [
      { type: "Princess", hp: 5, weights: { D: 1, E: 1, Z: 1 }, pull: 1 },
    ]);
    const state = simulate(level, layout);
    expect(firstMoves(state.events)[0]).toBe("down");
    expect(enteredRooms(state.events)).toContain("E:0");
    expect(enteredRooms(state.events)).not.toContain("D:0");
  });
});

describe("FR-25 / FR-31 standard tie order", () => {
  it("breaks equal-HP equal-length equal-weight paths toward +x (right)", () => {
    const level = twoDLevel(1, 1, [{ type: "Princess", hp: 5, weights: { Z: 1 }, pull: 1 }]);
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
});

describe("FR-25 every hero is pulled by princess weights", () => {
  it("averages another princess's pull into a room she occupies", () => {
    const weight = perceivedWeight(
      "D:0",
      "D",
      { id: 1, def: { type: "Warrior", hp: 3 } },
      [
        {
          id: 0,
          def: { type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 4 },
          dead: false,
          spawned: true,
          roomId: "D:0",
        },
        { id: 1, def: { type: "Warrior", hp: 3 }, dead: false, spawned: true, roomId: "A:0" },
      ],
    );
    // Viewer default for D is 0; other princess pull 4 → average 2.
    expect(weight).toBe(2);
  });

  it("pulls a later Warrior toward the room the stuck Princess occupies", () => {
    const level = azdLevel(1, [
      { type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 8 },
      { type: "Warrior", hp: 5 },
    ]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(state.heroes[0]?.roomId).toBe("D:0");
    expect(state.heroes[0]?.stuck).toBe(true);
    expect(state.heroes[1]?.roomId).toBe("D:0");
    expect(enteredRooms(state.events).filter((id) => id === "Z:0")).toEqual([]);
    expect(state.outcome).toBe("stalemate");
  });
});
