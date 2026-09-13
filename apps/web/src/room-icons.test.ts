import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RoomDef } from "@zorg/engine";
import {
  isRoomTileType,
  legalNextCells,
  ROOM_TILE_TYPES,
  roomIconSrc,
  roomIconSrcForDef,
  roomTileAlt,
} from "./room-icons.js";

const roomsDir = join(dirname(fileURLToPath(import.meta.url)), "../public/rooms");

describe("room tile assets (UI-only, #37)", () => {
  it("maps A/Z/D/E/P/O/T to distinct public SVGs and skips inventing C art", () => {
    expect([...ROOM_TILE_TYPES]).toEqual(["A", "Z", "D", "E", "P", "O", "T"]);
    const srcs = ROOM_TILE_TYPES.map(roomIconSrc);
    expect(new Set(srcs).size).toBe(7);
    for (const type of ROOM_TILE_TYPES) {
      expect(roomIconSrc(type)).toBe(`/rooms/${type.toLowerCase()}.svg`);
      expect(isRoomTileType(type)).toBe(true);
    }
    expect(isRoomTileType("C")).toBe(false);
    expect(roomIconSrc("C")).toBeNull();
    const special: RoomDef = { type: "C", args: [] };
    expect(roomIconSrcForDef(special)).toBeNull();
    expect(roomTileAlt(special)).toBe("Special");
  });

  it("ships one SVG per illustrated type with shared viewBox and aria-label", () => {
    const files = readdirSync(roomsDir).filter((name) => name.endsWith(".svg")).sort();
    expect(files).toEqual(["a.svg", "d.svg", "e.svg", "o.svg", "p.svg", "t.svg", "z.svg"]);
    const labels: Record<string, string> = {
      a: "Start",
      z: "Exit",
      d: "Danger",
      e: "Element",
      p: "Portal",
      o: "Gold",
      t: "Toll",
    };
    for (const type of ROOM_TILE_TYPES) {
      const key = type.toLowerCase();
      const svg = readFileSync(join(roomsDir, `${key}.svg`), "utf8");
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).toContain(`aria-label="${labels[key]}"`);
      expect(svg).toContain('role="img"');
      expect(svg).toContain("#c9a227");
    }
  });

  it("lists orthogonally adjacent empty cells as legal-next hints", () => {
    expect(legalNextCells([])).toEqual(new Set());
    const alone = legalNextCells([{ position: { x: 0, y: 1 } }]);
    expect(alone).toEqual(new Set(["1,1", "-1,1", "0,2", "0,0"]));
    const line = legalNextCells([
      { position: { x: 0, y: 1 } },
      { position: { x: 1, y: 1 } },
    ]);
    expect(line.has("2,1")).toBe(true);
    expect(line.has("-1,1")).toBe(true);
    expect(line.has("0,1")).toBe(false);
    expect(line.has("1,1")).toBe(false);
  });
});
