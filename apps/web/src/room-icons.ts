import type { RoomDef, RoomType } from "@zorg/engine";

/** Illustrated Maker tiles — UI-only; no C invent (C has no tile asset). */
export const ROOM_TILE_TYPES = ["A", "Z", "D", "E", "P", "O", "T"] as const satisfies readonly RoomType[];

export type RoomTileType = (typeof ROOM_TILE_TYPES)[number];

export function isRoomTileType(value: string): value is RoomTileType {
  return (ROOM_TILE_TYPES as readonly string[]).includes(value);
}

export function roomIconSrc(type: RoomType): string | null {
  if (!isRoomTileType(type)) return null;
  return `/rooms/${type.toLowerCase()}.svg`;
}

export function roomIconSrcForDef(def: RoomDef): string | null {
  return roomIconSrc(def.type);
}

/** Kid aria/alt for a tile — matches roomKidWord without inventing C art. */
export function roomTileAlt(def: RoomDef): string {
  switch (def.type) {
    case "A":
      return "Start";
    case "Z":
      return "Exit";
    case "D":
      return "Danger";
    case "E":
      return "Element";
    case "P":
      return "Portal";
    case "O":
      return "Gold";
    case "T":
      return "Toll";
    case "C":
      return "Special";
  }
}

/** Orthogonally adjacent empty cells next to placed rooms (Maker placement hint). */
export function legalNextCells(
  rooms: readonly { position: { x: number; y: number } }[],
): Set<string> {
  const occupied = new Set(rooms.map((r) => `${r.position.x},${r.position.y}`));
  const next = new Set<string>();
  if (rooms.length === 0) return next;
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (const room of rooms) {
    for (const [dx, dy] of deltas) {
      const x = room.position.x + dx;
      const y = room.position.y + dy;
      const key = `${x},${y}`;
      if (!occupied.has(key)) next.add(key);
    }
  }
  return next;
}
