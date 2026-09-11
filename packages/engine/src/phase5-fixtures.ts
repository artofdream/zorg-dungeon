import type { HeroDef, LevelDef } from "./level.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import { aezLine } from "./phase2-fixtures.js";

export { makeLevel, placeAll } from "./phase1-fixtures.js";
export { aezLine } from "./phase2-fixtures.js";
export { twoDLevel } from "./phase1-fixtures.js";

export function adzHeroes(heroes: HeroDef[], damage = 2): LevelDef {
  return makeLevel([{ type: "A" }, { type: "Z" }, { type: "D", damage }], heroes);
}

/** A west, D east of A, Z north of D — Mechanic can shove A north next to Z. */
export function shoveShortcut(heroes: HeroDef[]) {
  const level = adzHeroes(heroes);
  const layout = placeAll(level, {
    "A:0": { x: 0, y: 0 },
    "D:0": { x: 1, y: 0 },
    "Z:0": { x: 1, y: 1 },
  });
  return { level, layout };
}

/** Equal-length square used by Mechanic tie-break (up before right). */
export function mechanicSquare(heroes: HeroDef[]) {
  const level = makeLevel(
    [{ type: "A" }, { type: "Z" }, { type: "D", damage: 1 }, { type: "D", damage: 1 }],
    heroes,
  );
  const layout = placeAll(level, {
    "A:0": { x: 0, y: 0 },
    "D:0": { x: 1, y: 0 },
    "D:1": { x: 0, y: 1 },
    "Z:0": { x: 1, y: 1 },
  });
  return { level, layout };
}

export function aezWaterGunner(heroes: HeroDef[]) {
  return aezLine("water", heroes);
}
