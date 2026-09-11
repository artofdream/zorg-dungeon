// Covers FR-21 (Elf HP-preserving shortest path + immunities + Warrior
// tie order). Priority layers are isolated per NFR-10.
import { describe, expect, it } from "vitest";
import { aezLine, hpSquare } from "./phase2-fixtures.js";
import { twoDLevel, placeAll } from "./phase1-fixtures.js";
import { simulate } from "./simulation.js";
import { DEFAULT_ELEMENTAL_TILE } from "./tiles.js";

function enteredRooms(events: { type: string; roomId?: string }[]): string[] {
  return events.filter((e) => e.type === "enter").map((e) => e.roomId ?? "");
}

function firstMoves(events: { type: string; dir?: string }[]): string[] {
  return events.filter((e) => e.type === "move").map((e) => (e as { dir: string }).dir);
}

describe("FR-21 Elf prefers the path that preserves the most HP", () => {
  it("takes E over D(4) on an equal-length square (can skirt a single fire cell)", () => {
    const { level, layout } = hpSquare("fire", 4, [{ type: "Elf", hp: 5, immunities: [] }]);
    const state = simulate(level, layout);
    expect(firstMoves(state.events)[0]).toBe("down");
    expect(enteredRooms(state.events)).toContain("E:0");
    expect(enteredRooms(state.events)).not.toContain("D:0");
    // One green cell is avoidable; 5 HP left is still strictly better than D(4).
    expect(state.heroes[0]?.hp).toBe(5);
    expect(state.outcome).toBe("loss");
  });

  it("still plans a lethal path when every route spends more HP than it has", () => {
    // Default E interior is 3×3 green fire — crossing E costs at least 3 HP.
    const { level, layout } = aezLine(
      "fire",
      [{ type: "Elf", hp: 1, immunities: [] }],
      DEFAULT_ELEMENTAL_TILE,
    );
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toContain("E:0");
    expect(state.outcome).toBe("win");
    expect(state.heroes[0]?.dead).toBe(true);
  });
});

describe("FR-21 among equal-HP options, Elf takes the shortest path", () => {
  it("walks A–Z rather than the detour through D when both cost 0 HP", () => {
    const level = twoDLevel(0, 0, [{ type: "Elf", hp: 5, immunities: [] }]);
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
      "D:0": { x: 0, y: 1 },
      "D:1": { x: 1, y: 1 },
    });
    const state = simulate(level, layout);
    expect(enteredRooms(state.events)).toEqual(["A:0", "Z:0"]);
    expect(enteredRooms(state.events)).not.toContain("D:0");
    expect(state.outcome).toBe("loss");
  });
});

describe("FR-21 / FR-31 directional tie-break (same as Warrior)", () => {
  it("breaks equal-HP equal-length paths toward +x (right) at orientation 0", () => {
    const level = twoDLevel(1, 1, [{ type: "Elf", hp: 5, immunities: [] }]);
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

describe("FR-21 Elf immunity changes the HP ranking", () => {
  it("takes fire (0 after immunity) over D(1) on the same square", () => {
    const { level, layout } = hpSquare("fire", 1, [
      { type: "Elf", hp: 5, immunities: ["fire"] },
    ]);
    const state = simulate(level, layout);
    expect(firstMoves(state.events)[0]).toBe("down");
    expect(enteredRooms(state.events)).toContain("E:0");
    expect(enteredRooms(state.events)).not.toContain("D:0");
    expect(damageEventsEmpty(state.events)).toBe(true);
    expect(state.heroes[0]?.hp).toBe(5);
  });
});

function damageEventsEmpty(events: { type: string }[]): boolean {
  return events.every((e) => e.type !== "damage");
}
