// Implements FR-25: Princess weight-pull. A room's perceived weight is the
// average of the viewer's default weight for that room type and every other
// princess's pull b who is standing in it. Every hero (not only princesses)
// is subject to this pull. Default dict is {Z:1}.

import { clonePiles, pilesKey, parsePilesKey } from "./gold.js";
import type { HeroDef, RoomType } from "./level.js";
import { cellKey, isPassable, resolveStep, roomIdAt, type CellPos, type WalkGrid } from "./pathing.js";
import type { DungeonLayout } from "./placement.js";
import { orientedTieBreak } from "./tiles.js";

export interface WeightViewer {
  id: number;
  def: HeroDef;
}

export interface WeightOccupant extends WeightViewer {
  dead: boolean;
  spawned: boolean;
  roomId: string | null;
}

function numericWeight(value: number | string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? fallback : n;
}

/** Viewer dict lookup by room type. Non-princesses use {Z:1}. */
export function defaultRoomWeight(def: HeroDef, roomType: RoomType | string): number {
  if (def.type === "Princess") {
    const listed = def.weights[roomType];
    if (listed !== undefined) return numericWeight(listed, 0);
    return roomType === "Z" ? 1 : 0;
  }
  return roomType === "Z" ? 1 : 0;
}

export function princessPull(def: HeroDef): number {
  if (def.type !== "Princess") return 0;
  return numericWeight(def.pull, 0);
}

/**
 * FR-25: average of the viewer's default weight and every *other*
 * princess's pull while that princess occupies the room.
 */
export function perceivedWeight(
  roomId: string,
  roomType: RoomType | string,
  viewer: WeightViewer,
  occupants: readonly WeightOccupant[],
): number {
  const values = [defaultRoomWeight(viewer.def, roomType)];
  for (const other of occupants) {
    if (other.id === viewer.id) continue;
    if (other.dead || !other.spawned || other.roomId !== roomId) continue;
    if (other.def.type !== "Princess") continue;
    values.push(princessPull(other.def));
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/** Rooms the hero can walk to (current room always included). */
export function reachableRoomIds(
  layout: DungeonLayout,
  grid: WalkGrid,
  from: CellPos,
  immunities: readonly import("./level.js").ElementType[] = [],
  gold = 0,
  piles: ReadonlyMap<string, number> = new Map(),
): Set<string> {
  const rooms = new Set<string>();
  const here = roomIdAt(grid, from);
  if (here) rooms.add(here);

  const startPiles = pilesKey(piles);
  const seen = new Set<string>([`${cellKey(from)}|${gold}|${startPiles}`]);
  const queue: { cell: CellPos; gold: number; piles: string; roomId: string }[] = [
    { cell: from, gold, piles: startPiles, roomId: here ?? "" },
  ];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (!cur) break;
    // Already-paid light is standable even if the purse is now empty.
    if (!isPassable(grid, cur.cell, immunities, Number.POSITIVE_INFINITY) && head > 1) {
      continue;
    }
    for (const dir of orientedTieBreak(0)) {
      const path = resolveStep(grid, cur.cell, dir, immunities, layout, cur.gold);
      if (!path?.length) continue;
      let goldNow = cur.gold;
      let roomNow = cur.roomId;
      let pilesNow = parsePilesKey(cur.piles);
      let last = path[path.length - 1];
      let invalid = false;
      for (const cell of path) {
        const id = roomIdAt(grid, cell);
        if (!id) {
          invalid = true;
          break;
        }
        rooms.add(id);
        if (id !== roomNow) {
          const pile = pilesNow.get(id) ?? 0;
          if (pile > 0) {
            goldNow += pile;
            pilesNow = clonePiles(pilesNow);
            pilesNow.set(id, 0);
          }
          roomNow = id;
        }
        const walk = grid.cells.get(cellKey(cell));
        if (walk?.toll !== undefined && goldNow >= walk.toll) goldNow -= walk.toll;
        last = cell;
      }
      if (invalid || !last) continue;
      const k = `${cellKey(last)}|${goldNow}|${pilesKey(pilesNow)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ cell: last, gold: goldNow, piles: pilesKey(pilesNow), roomId: roomNow });
    }
  }
  return rooms;
}

/**
 * Reachable rooms that share the highest perceived weight. Empty when
 * nothing is reachable (caller waits — FR-30).
 */
export function highestWeightRoomIds(
  layout: DungeonLayout,
  viewer: WeightViewer,
  occupants: readonly WeightOccupant[],
  reachable: ReadonlySet<string>,
): string[] {
  let best = -Infinity;
  const ids: string[] = [];
  for (const room of layout.rooms) {
    if (!reachable.has(room.id)) continue;
    const weight = perceivedWeight(room.id, room.def.type, viewer, occupants);
    if (weight > best) {
      best = weight;
      ids.length = 0;
      ids.push(room.id);
    } else if (weight === best) {
      ids.push(room.id);
    }
  }
  return ids;
}

export function zRoomIds(layout: DungeonLayout): string[] {
  return layout.rooms.filter((r) => r.def.type === "Z").map((r) => r.id);
}
