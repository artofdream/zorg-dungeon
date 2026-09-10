// Covers FR-10 (see src/geometry.ts).
import { describe, expect, it } from "vitest";
import { manhattanDistance } from "./geometry.js";

describe("manhattanDistance (FR-10)", () => {
  it("is zero for the same room", () => {
    expect(manhattanDistance({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(0);
  });

  it("sums the axis differences", () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it("is symmetric", () => {
    const a = { x: -2, y: 5 };
    const b = { x: 4, y: -1 };
    expect(manhattanDistance(a, b)).toBe(manhattanDistance(b, a));
  });
});
