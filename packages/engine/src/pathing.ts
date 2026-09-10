// Implements FR-20 (Warrior shortest path + tie-break) and FR-31 (orientation-
// relative directional fallback). FR-27 / FR-29: the walkable grid is the map
// only — other heroes are never obstacles. FR-28: distances ignore HP / D(x).

import type { Orientation } from "./level.js";
import { findRoom, resolvedTile, type DungeonLayout, type PlacedRoom } from "./placement.js";
import {
  ROOM_SIZE,
  deltaFor,
  orientedTieBreak,
  tileCell,
  type Cardinal,
} from "./tiles.js";

export interface CellPos {
  x: number;
  y: number;
}

export interface WalkCell {
  world: CellPos;
  roomId: string;
  local: CellPos;
  kind: "open" | "wall";
}

export interface WalkGrid {
  cells: Map<string, WalkCell>;
}

export function cellKey(c: CellPos): string {
  return `${c.x},${c.y}`;
}

export function roomWorldOrigin(room: PlacedRoom): CellPos {
  return { x: room.position.x * ROOM_SIZE, y: room.position.y * ROOM_SIZE };
}

export function localToWorld(room: PlacedRoom, local: CellPos): CellPos {
  const origin = roomWorldOrigin(room);
  return { x: origin.x + local.x, y: origin.y + local.y };
}

/** Center cell of a 5×5 room — Phase 1 spawn / default stand point. */
export function roomCenterLocal(): CellPos {
  return { x: 2, y: 2 };
}

export function buildWalkGrid(layout: DungeonLayout): WalkGrid {
  const cells = new Map<string, WalkCell>();
  for (const room of layout.rooms) {
    const tile = resolvedTile(room);
    for (let ly = 0; ly < ROOM_SIZE; ly++) {
      for (let lx = 0; lx < ROOM_SIZE; lx++) {
        const kind = tileCell(tile, lx, ly);
        const world = localToWorld(room, { x: lx, y: ly });
        cells.set(cellKey(world), {
          world,
          roomId: room.id,
          local: { x: lx, y: ly },
          kind,
        });
      }
    }
  }
  return { cells };
}

export function getWalkCell(grid: WalkGrid, pos: CellPos): WalkCell | undefined {
  return grid.cells.get(cellKey(pos));
}

export function isOpen(grid: WalkGrid, pos: CellPos): boolean {
  return getWalkCell(grid, pos)?.kind === "open";
}

export function roomIdAt(grid: WalkGrid, pos: CellPos): string | undefined {
  return getWalkCell(grid, pos)?.roomId;
}

/**
 * Multi-source BFS distance from every open Z cell. Unreachable cells are
 * omitted (treated as Infinity). Ignores HP and other heroes (FR-20, FR-27, FR-28).
 */
export function distanceToZ(
  layout: DungeonLayout,
  grid: WalkGrid,
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: CellPos[] = [];

  for (const room of layout.rooms) {
    if (room.def.type !== "Z") continue;
    for (let ly = 0; ly < ROOM_SIZE; ly++) {
      for (let lx = 0; lx < ROOM_SIZE; lx++) {
        const world = localToWorld(room, { x: lx, y: ly });
        if (!isOpen(grid, world)) continue;
        const k = cellKey(world);
        if (!dist.has(k)) {
          dist.set(k, 0);
          queue.push(world);
        }
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (!cur) break;
    const curDist = dist.get(cellKey(cur));
    if (curDist === undefined) continue;
    for (const dir of orientedTieBreak(0)) {
      const { dx, dy } = deltaFor(dir);
      const next = { x: cur.x + dx, y: cur.y + dy };
      if (!isOpen(grid, next)) continue;
      const nk = cellKey(next);
      if (dist.has(nk)) continue;
      dist.set(nk, curDist + 1);
      queue.push(next);
    }
  }

  return dist;
}

/**
 * FR-20 / FR-31: among neighbors that strictly decrease dist-to-Z, pick the
 * first in the orientation-relative tie order (right → up → left → down at 0°).
 * Returns undefined when no improving step exists (FR-30 wait).
 */
export function chooseWarriorStep(
  grid: WalkGrid,
  dist: Map<string, number>,
  from: CellPos,
  orientation: Orientation,
): Cardinal | undefined {
  const here = dist.get(cellKey(from));
  if (here === undefined) return undefined;

  for (const dir of orientedTieBreak(orientation)) {
    const { dx, dy } = deltaFor(dir);
    const next = { x: from.x + dx, y: from.y + dy };
    if (!isOpen(grid, next)) continue;
    const nDist = dist.get(cellKey(next));
    if (nDist !== undefined && nDist < here) {
      return dir;
    }
  }
  return undefined;
}

export function stepCell(from: CellPos, dir: Cardinal): CellPos {
  const { dx, dy } = deltaFor(dir);
  return { x: from.x + dx, y: from.y + dy };
}

export function dungeonOrientation(layout: DungeonLayout): Orientation {
  const a = layout.rooms.find((r) => r.def.type === "A");
  return a?.orientation ?? 0;
}

export function placedRoomOf(layout: DungeonLayout, id: string): PlacedRoom {
  const room = findRoom(layout, id);
  if (!room) throw new Error(`Unknown room id "${id}"`);
  return room;
}
