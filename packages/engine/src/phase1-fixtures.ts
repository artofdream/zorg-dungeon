import type { HeroDef, LevelDef, Orientation, RoomDef } from "./level.js";
import { enumerateSuppliedRooms, type DungeonLayout, type PlacedRoom } from "./placement.js";
import type { Tile } from "./tiles.js";

export function makeLevel(rooms: RoomDef[], heroes: HeroDef[], id = "phase-1-test"): LevelDef {
  return {
    id,
    name: id,
    rooms: rooms.map((room) => ({ count: 1, room })),
    heroes,
  };
}

export function azdLevel(
  damage = 2,
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
): LevelDef {
  return makeLevel([{ type: "A" }, { type: "Z" }, { type: "D", damage }], heroes);
}

export function twoALevel(heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }]): LevelDef {
  return makeLevel([{ type: "A" }, { type: "A" }, { type: "Z" }], heroes);
}

export function twoDLevel(
  d0 = 2,
  d1 = 2,
  heroes: HeroDef[] = [{ type: "Warrior", hp: 5 }],
): LevelDef {
  return makeLevel([{ type: "A" }, { type: "Z" }, { type: "D", damage: d0 }, { type: "D", damage: d1 }], heroes);
}

export function placeAll(
  level: LevelDef,
  positions: Record<string, { x: number; y: number }>,
  orientation: Orientation = 0,
  tiles?: Record<string, Tile>,
): DungeonLayout {
  const rooms: PlacedRoom[] = enumerateSuppliedRooms(level).map((spec) => {
    const position = positions[spec.id];
    if (!position) {
      throw new Error(`No position for ${spec.id}`);
    }
    const room: PlacedRoom = {
      id: spec.id,
      def: spec.def,
      position,
      orientation,
    };
    const tile = tiles?.[spec.id];
    if (tile) room.tile = tile;
    return room;
  });
  return { rooms };
}
