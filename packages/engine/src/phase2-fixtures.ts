import type { ElementType, HeroDef, LevelDef } from "./level.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import { DEFAULT_ROOM_TILE, paintGreen, type Tile } from "./tiles.js";

export { makeLevel, placeAll } from "./phase1-fixtures.js";

export function aezLevel(
  element: ElementType,
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
): LevelDef {
  return makeLevel([{ type: "A" }, { type: "Z" }, { type: "E", element }], heroes);
}

export function aedzLevel(
  element: ElementType,
  damage = 1,
  heroes: HeroDef[] = [{ type: "Elf", hp: 5, immunities: [] }],
): LevelDef {
  return makeLevel(
    [{ type: "A" }, { type: "Z" }, { type: "E", element }, { type: "D", damage }],
    heroes,
  );
}

/** One green cell so FR-14 / FR-21 HP math stays obvious. */
export function oneGreen(x = 2, y = 2): Tile {
  return paintGreen(DEFAULT_ROOM_TILE, [{ x, y }]);
}

export function aezLine(
  element: ElementType,
  heroes: HeroDef[],
  green: Tile = oneGreen(),
) {
  const level = aezLevel(element, heroes);
  const layout = placeAll(
    level,
    { "A:0": { x: 0, y: 0 }, "E:0": { x: 1, y: 0 }, "Z:0": { x: 2, y: 0 } },
    0,
    { "E:0": green },
  );
  return { level, layout };
}

/**
 * Square used by FR-21 layer tests:
 *   A(0,1) — D(1,1)
 *   |         |
 *   E(0,0) — Z(1,0)
 * Equal length; Warrior tie-breaks right (D). Elf compares HP.
 */
export function hpSquare(
  element: ElementType,
  damage: number,
  heroes: HeroDef[],
  green: Tile = oneGreen(),
) {
  const level = aedzLevel(element, damage, heroes);
  const layout = placeAll(
    level,
    {
      "A:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 1 },
      "E:0": { x: 0, y: 0 },
      "Z:0": { x: 1, y: 0 },
    },
    0,
    { "E:0": green },
  );
  return { level, layout };
}
