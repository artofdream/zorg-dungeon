import type { HeroDef, LevelDef, RoomDef, SpellSlot } from "./level.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import type { DungeonLayout } from "./placement.js";

export { makeLevel, placeAll } from "./phase1-fixtures.js";

export function azAdjacent(
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
  spells?: SpellSlot[],
  id = "phase-6-az",
): { level: LevelDef; layout: DungeonLayout } {
  const level: LevelDef = {
    ...makeLevel([{ type: "A" }, { type: "Z" }], heroes, id),
    spells,
  };
  const layout = placeAll(level, {
    "A:0": { x: 0, y: 0 },
    "Z:0": { x: 1, y: 0 },
  });
  return { level, layout };
}

export function adzLine(
  rooms: RoomDef[],
  heroes: HeroDef[],
  spells?: SpellSlot[],
  id = "phase-6-adz",
): { level: LevelDef; layout: DungeonLayout } {
  const level: LevelDef = { ...makeLevel(rooms, heroes, id), spells };
  const layout = placeAll(level, {
    "A:0": { x: 0, y: 0 },
    "D:0": { x: 1, y: 0 },
    "Z:0": { x: 2, y: 0 },
  });
  return { level, layout };
}

/** A–Z–D square used when the mirror list permutes types. */
export function azdSquare(
  rooms: RoomDef[],
  heroes: HeroDef[],
  id = "phase-6-square",
): { level: LevelDef; layout: DungeonLayout } {
  const level = makeLevel(rooms, heroes, id);
  const supplied = rooms.map((room, i) => `${room.type}:${rooms.slice(0, i).filter((r) => r.type === room.type).length}`);
  const positions = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  const pos: Record<string, { x: number; y: number }> = {};
  supplied.forEach((sid, i) => {
    const p = positions[i];
    if (p) pos[sid] = p;
  });
  return { level, layout: placeAll(level, pos) };
}
