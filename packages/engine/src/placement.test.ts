// Covers FR-5, FR-6, FR-7, FR-8 (see src/placement.ts, src/tiles.ts).
import { describe, expect, it } from "vitest";
import { azdLevel, makeLevel, placeAll } from "./phase1-fixtures.js";
import {
  canStartExtermination,
  enumerateSuppliedRooms,
  validateLayout,
} from "./placement.js";
import { DEFAULT_ROOM_TILE, hatchDirection, sealSide } from "./tiles.js";

function codes(level = azdLevel(), layout: ReturnType<typeof placeAll>) {
  return validateLayout(level, layout).issues.map((i) => i.code);
}

describe("FR-5 Maker grid placement", () => {
  it("accepts every supplied room placed once, 4-connected, no overlap", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const report = validateLayout(level, layout);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(enumerateSuppliedRooms(level).map((r) => r.id)).toEqual(["A:0", "Z:0", "D:0"]);
  });

  it("rejects a missing supplied room", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    layout.rooms = layout.rooms.filter((r) => r.id !== "D:0");
    expect(codes(level, layout)).toContain("missing");
  });

  it("rejects overlapping rooms", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    });
    expect(codes(level, layout)).toContain("overlap");
  });

  it("rejects a non-integer (unaligned) room coordinate", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1.5, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    expect(codes(level, layout)).toContain("unaligned");
  });

  it("rejects a diagonal-only two-room touch", () => {
    const level = azdLevel();
    const layout = {
      rooms: [
        { id: "A:0", def: { type: "A" as const }, position: { x: 0, y: 0 }, orientation: 0 as const },
        { id: "Z:0", def: { type: "Z" as const }, position: { x: 1, y: 1 }, orientation: 0 as const },
        { id: "D:0", def: { type: "D" as const, damage: 2 }, position: { x: 3, y: 3 }, orientation: 0 as const },
      ],
    };
    const found = codes(level, layout);
    expect(found).toContain("diagonal_only");
  });

  it("rejects a disconnected but non-diagonal layout", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 4, y: 0 },
    });
    expect(codes(level, layout)).toContain("disconnected");
  });

  it("allows a corner pair when a cardinal path still connects the dungeon", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 1, y: 1 },
    });
    expect(validateLayout(level, layout).ok).toBe(true);
  });
});

describe("FR-6 shared-side wall/open matching", () => {
  it("accepts a default E-room tile against an A-room hatch (green ≡ open)", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "E", element: "fire" }],
      [{ type: "Warrior", hp: 3 }],
    );
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "E:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    expect(validateLayout(level, layout).ok).toBe(true);
  });

  it("accepts default 4-hatch tiles across a shared side", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    expect(validateLayout(level, layout).ok).toBe(true);
  });

  it("rejects an open-to-wall mismatch on the shared side", () => {
    const level = azdLevel();
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 0 },
        "D:0": { x: 1, y: 0 },
        "Z:0": { x: 2, y: 0 },
      },
      0,
      { "A:0": sealSide(DEFAULT_ROOM_TILE, "east") },
    );
    expect(codes(level, layout)).toContain("edge_mismatch");
  });

  it("accepts wall-to-wall when both sides of the seam are sealed", () => {
    const level = azdLevel();
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 0 },
        "D:0": { x: 1, y: 0 },
        "Z:0": { x: 2, y: 0 },
      },
      0,
      {
        "A:0": sealSide(DEFAULT_ROOM_TILE, "east"),
        "D:0": sealSide(sealSide(DEFAULT_ROOM_TILE, "west"), "east"),
        "Z:0": sealSide(DEFAULT_ROOM_TILE, "west"),
      },
    );
    expect(validateLayout(level, layout).issues.filter((i) => i.code === "edge_mismatch")).toEqual([]);
    expect(validateLayout(level, layout).ok).toBe(true);
  });
});

describe("FR-7 shared orientation anchored to A hatch direction", () => {
  it("rejects A rooms that disagree on orientation", () => {
    const level = {
      id: "two-a",
      name: "two-a",
      rooms: [
        { count: 1, room: { type: "A" as const } },
        { count: 1, room: { type: "A" as const } },
        { count: 1, room: { type: "Z" as const } },
      ],
      heroes: [{ type: "Warrior" as const, hp: 3 }],
    };
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "A:1": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const a1 = layout.rooms.find((r) => r.id === "A:1");
    if (a1) a1.orientation = 90;
    expect(codes(level, layout)).toContain("orientation");
  });

  it("rejects a non-A room that does not match the A hatch orientation", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const z = layout.rooms.find((r) => r.id === "Z:0");
    if (z) z.orientation = 180;
    expect(codes(level, layout)).toContain("orientation");
    expect(hatchDirection(0)).toBe("right");
    expect(hatchDirection(90)).toBe("up");
  });

  it("accepts a dungeon-wide shared orientation other than 0", () => {
    const level = azdLevel();
    const layout = placeAll(
      level,
      {
        "A:0": { x: 0, y: 0 },
        "D:0": { x: 1, y: 0 },
        "Z:0": { x: 2, y: 0 },
      },
      90,
    );
    expect(validateLayout(level, layout).ok).toBe(true);
    expect(hatchDirection(90)).toBe("up");
  });
});

describe("FR-8 extermination gate", () => {
  it("blocks the transition while a supplied room is unplaced", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    layout.rooms = layout.rooms.filter((r) => r.id !== "Z:0");
    expect(canStartExtermination(level, layout)).toBe(false);
    expect(validateLayout(level, layout).canStartExtermination).toBe(false);
  });

  it("allows the transition only when FR-5–FR-7 all hold", () => {
    const level = azdLevel();
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    expect(canStartExtermination(level, layout)).toBe(true);
  });
});
