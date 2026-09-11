import type { ElementType, HeroDef, LevelDef, RoomDef } from "./level.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import { DEFAULT_ROOM_TILE, makeEwCorridorTile, paintLight, type Tile } from "./tiles.js";

export { makeLevel, placeAll } from "./phase1-fixtures.js";

export function apzLevel(
  portal: Extract<RoomDef, { type: "P" }>,
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
): LevelDef {
  return makeLevel([{ type: "A" }, { type: "Z" }, portal], heroes);
}

export function aotzLevel(
  gold = 1,
  cost = 1,
  element: ElementType = "fire",
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
): LevelDef {
  return makeLevel(
    [{ type: "A" }, { type: "Z" }, { type: "O", gold }, { type: "T", cost, element }],
    heroes,
  );
}

export function corridorLine(
  level: LevelDef,
  order: string[],
  tiles?: Record<string, Tile>,
) {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [i, id] of order.entries()) {
    positions[id] = { x: i, y: 0 };
  }
  const corridor = makeEwCorridorTile();
  const resolved: Record<string, Tile> = {};
  for (const id of order) {
    resolved[id] = tiles?.[id] ?? corridor;
  }
  return placeAll(level, positions, 0, resolved);
}

/** One light cell on an east–west corridor so FR-17 payment is forced. */
export function oneLightCorridor(x = 2, y = 2): Tile {
  return paintLight(makeEwCorridorTile(), [{ x, y }]);
}

export function defaultOpen(): Tile {
  return DEFAULT_ROOM_TILE;
}
