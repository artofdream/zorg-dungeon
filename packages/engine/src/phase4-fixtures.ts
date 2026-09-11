import type { HeroDef, LevelDef, RoomDef, SpellDef, SpellSlot } from "./level.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";

export { makeLevel, placeAll } from "./phase1-fixtures.js";
export { corridorLine } from "./phase3-fixtures.js";

export function makeSpellLevel(
  rooms: RoomDef[],
  heroes: HeroDef[],
  spells: SpellSlot[],
  id = "phase-4-test",
): LevelDef {
  return { ...makeLevel(rooms, heroes, id), spells };
}

/** A–D–Z corridor used by most Phase 4 scheduler casts. */
export function adzSpellLevel(
  damage = 2,
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
  spells: SpellDef[] = [{ type: "Attack", damage: 3 }],
): LevelDef {
  return makeSpellLevel([{ type: "A" }, { type: "Z" }, { type: "D", damage }], heroes, spells);
}
