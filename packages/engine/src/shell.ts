// Implements FR-23: Shell — Gunner's instant projectile. Flies cardinally
// until a wall or the dungeon edge; pauses all other action; clears
// elemental cells; deals 2 damage to every hero it crosses.
//
// D-room monsters: a Shell that crosses a D room clears that room's damage
// (the D "monster"). Z-monster clear is deferred — FR-12 still applies
// (NFR-8: do not invent a "kill Zorg" rule). Shot duration is unused (S3).

import { cellKey, getWalkCell, stepCell, type CellPos, type WalkGrid } from "./pathing.js";
import type { DungeonLayout } from "./placement.js";
import type { Cardinal } from "./tiles.js";

export const SHELL_DAMAGE = 2;

/** Cells the shell enters, starting at `start` (the adjacent cell fired onto). */
export function shellPath(grid: WalkGrid, start: CellPos, dir: Cardinal): CellPos[] {
  const cells: CellPos[] = [];
  let current = start;
  while (true) {
    const cell = getWalkCell(grid, current);
    if (!cell || cell.kind === "wall") break;
    cells.push(current);
    current = stepCell(current, dir);
  }
  return cells;
}

export function isDRoom(layout: DungeonLayout, roomId: string | undefined): boolean {
  if (!roomId) return false;
  return layout.rooms.find((r) => r.id === roomId)?.def.type === "D";
}

/** True when this path would clear an elemental cell or a still-live D monster. */
export function shellClearsSomething(
  layout: DungeonLayout,
  grid: WalkGrid,
  cells: readonly CellPos[],
  clearedCells: ReadonlySet<string>,
  clearedMonsters: ReadonlySet<string>,
): boolean {
  for (const pos of cells) {
    const key = cellKey(pos);
    const walk = getWalkCell(grid, pos);
    if (!walk) continue;
    if (walk.element && !clearedCells.has(key)) return true;
    if (isDRoom(layout, walk.roomId) && !clearedMonsters.has(walk.roomId)) return true;
  }
  return false;
}

export interface ShellClearResult {
  cells: CellPos[];
  clearedCellKeys: string[];
  clearedRoomIds: string[];
}

export function collectShellClears(
  layout: DungeonLayout,
  grid: WalkGrid,
  cells: readonly CellPos[],
  clearedCells: ReadonlySet<string>,
  clearedMonsters: ReadonlySet<string>,
): ShellClearResult {
  const clearedCellKeys: string[] = [];
  const clearedRoomIds: string[] = [];
  const seenRooms = new Set<string>();
  for (const pos of cells) {
    const key = cellKey(pos);
    const walk = getWalkCell(grid, pos);
    if (!walk) continue;
    if (walk.element && !clearedCells.has(key)) {
      clearedCellKeys.push(key);
    }
    if (
      walk.roomId &&
      isDRoom(layout, walk.roomId) &&
      !clearedMonsters.has(walk.roomId) &&
      !seenRooms.has(walk.roomId)
    ) {
      seenRooms.add(walk.roomId);
      clearedRoomIds.push(walk.roomId);
    }
  }
  return { cells: [...cells], clearedCellKeys, clearedRoomIds };
}

export function setKey(values: Iterable<string>): string {
  return [...values].sort().join(";");
}

export function parseSetKey(key: string): Set<string> {
  if (!key) return new Set();
  return new Set(key.split(";").filter(Boolean));
}
