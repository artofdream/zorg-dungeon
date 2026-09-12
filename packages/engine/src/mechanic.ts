// Implements FR-24: Mechanic(x, dict) — shortest path to the weight target
// (usually Z), ignoring HP, using shove power; then fewest unjustified
// power uses; then "use power" as a tie-break; then up → right → down → left.
//
// From a listed room the Mechanic can shove that room (contents travel) into
// one adjacent empty grid cell. dict[roomType] is that instance's shove
// budget. FR-6 is not a shove gate (FR-38 is spell-only).

import type { HeroAction } from "./action.js";
import { clonePiles, pilesKey, parsePilesKey, type PathEconomy } from "./gold.js";
import type { ElementType, Orientation } from "./level.js";
import {
  buildWalkGrid,
  cellKey,
  distanceToRooms,
  resolveStep,
  roomIdAt,
  type CellPos,
  type WalkGrid,
} from "./pathing.js";
import { roomAt, type DungeonLayout } from "./placement.js";
import { cloneLayout } from "./spells.js";
import { ROOM_SIZE, deltaFor, orientedMechanicTieBreak, type Cardinal } from "./tiles.js";

export interface MechanicStepInput {
  layout: DungeonLayout;
  grid: WalkGrid;
  from: CellPos;
  roomId: string;
  orientation: Orientation;
  immunities?: readonly ElementType[];
  economy?: PathEconomy;
  targetRoomIds: readonly string[];
  shoveLeft: ReadonlyMap<string, number>;
}

interface SearchState {
  cell: CellPos;
  roomId: string;
  layoutKey: string;
  shoveKey: string;
  gold: number;
  piles: string;
  length: number;
  unjustified: number;
  firstIsShove: boolean;
  firstDir: Cardinal | undefined;
  firstType: "walk" | "shove" | undefined;
}

/** Room ids are already `Type:n` (e.g. `A:0`). Do not split on `:`. */
export function layoutKeyOf(layout: DungeonLayout): string {
  return layout.rooms
    .map((r) => `${r.id}@${r.position.x},${r.position.y}`)
    .sort()
    .join("|");
}

function shoveKeyOf(budget: ReadonlyMap<string, number>): string {
  return [...budget.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, n]) => `${id}:${n}`)
    .join(";");
}

function parseShoveKey(key: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!key) return out;
  for (const part of key.split(";")) {
    const split = part.lastIndexOf(":");
    if (split <= 0) continue;
    const id = part.slice(0, split);
    const n = Number(part.slice(split + 1));
    if (id && !Number.isNaN(n) && n > 0) out.set(id, n);
  }
  return out;
}

export function layoutFromKey(base: DungeonLayout, key: string): DungeonLayout {
  const next = cloneLayout(base);
  if (!key) return next;
  const pos = new Map<string, { x: number; y: number }>();
  for (const part of key.split("|")) {
    const at = part.lastIndexOf("@");
    if (at < 0) continue;
    const id = part.slice(0, at);
    const [xs, ys] = part.slice(at + 1).split(",");
    pos.set(id, { x: Number(xs), y: Number(ys) });
  }
  for (const room of next.rooms) {
    const p = pos.get(room.id);
    if (p) room.position = p;
  }
  return next;
}

function walkDist(
  layout: DungeonLayout,
  grid: WalkGrid,
  cell: CellPos,
  targets: readonly string[],
  immunities: readonly ElementType[],
  gold: number,
): number | undefined {
  return distanceToRooms(layout, grid, targets, immunities, gold).get(cellKey(cell));
}

export function planShove(
  layout: DungeonLayout,
  heroCell: CellPos,
  roomId: string,
  dir: Cardinal,
): { layout: DungeonLayout; cell: CellPos } | undefined {
  const room = layout.rooms.find((r) => r.id === roomId);
  if (!room) return undefined;
  const { dx, dy } = deltaFor(dir);
  const dest = { x: room.position.x + dx, y: room.position.y + dy };
  if (roomAt(layout, dest.x, dest.y)) return undefined;
  const next = cloneLayout(layout);
  const moved = next.rooms.find((r) => r.id === roomId);
  if (!moved) return undefined;
  moved.position = dest;
  return {
    layout: next,
    cell: { x: heroCell.x + dx * ROOM_SIZE, y: heroCell.y + dy * ROOM_SIZE },
  };
}

/** FR-24 scored-path layers. Exported so NFR-10 can probe the
 *  power-as-tie-break clause without a full-level run. */
export interface MechanicPathScore {
  length: number;
  unjustified: number;
  firstIsShove: boolean;
  firstDir?: Cardinal;
}

export function mechanicPriorityBetter(
  a: MechanicPathScore,
  b: MechanicPathScore,
  dirs: readonly Cardinal[],
): boolean {
  if (a.length !== b.length) return a.length < b.length;
  if (a.unjustified !== b.unjustified) return a.unjustified < b.unjustified;
  if (a.firstIsShove !== b.firstIsShove) return a.firstIsShove;
  const ai = a.firstDir ? dirs.indexOf(a.firstDir) : 99;
  const bi = b.firstDir ? dirs.indexOf(b.firstDir) : 99;
  return ai < bi;
}

function better(a: SearchState, b: SearchState, dirs: readonly Cardinal[]): boolean {
  return mechanicPriorityBetter(a, b, dirs);
}

function applyWalkEconomy(
  layout: DungeonLayout,
  grid: WalkGrid,
  cell: CellPos,
  roomId: string,
  gold: number,
  piles: Map<string, number>,
  targets: readonly string[],
): {
  gold: number;
  roomId: string;
  piles: Map<string, number>;
  reached: boolean;
  invalid: boolean;
} {
  const nextRoomId = roomIdAt(grid, cell);
  if (!nextRoomId) return { gold, roomId, piles, reached: false, invalid: true };
  let nextGold = gold;
  let nextPiles = piles;
  let reached = false;
  if (nextRoomId !== roomId) {
    if (targets.includes(nextRoomId)) reached = true;
    const pile = piles.get(nextRoomId) ?? 0;
    if (pile > 0) {
      nextGold += pile;
      nextPiles = clonePiles(piles);
      nextPiles.set(nextRoomId, 0);
    }
  }
  const walk = grid.cells.get(cellKey(cell));
  if (walk?.toll !== undefined && nextGold >= walk.toll) nextGold -= walk.toll;
  return { gold: nextGold, roomId: nextRoomId, piles: nextPiles, reached, invalid: false };
}

/**
 * FR-24 / FR-31: first action of the shortest power-aware path, or
 * undefined when the Mechanic is already on a target or no path exists.
 */
export function chooseMechanicStep(input: MechanicStepInput): HeroAction | undefined {
  const { layout, grid, from, roomId, orientation, economy, targetRoomIds, shoveLeft } = input;
  const immunities = input.immunities ?? [];
  if (targetRoomIds.includes(roomId)) return undefined;

  const dirs = orientedMechanicTieBreak(orientation);
  const originKey = layoutKeyOf(layout);
  const start: SearchState = {
    cell: from,
    roomId,
    layoutKey: originKey,
    shoveKey: shoveKeyOf(shoveLeft),
    gold: economy?.gold ?? 0,
    piles: pilesKey(economy?.piles ?? new Map()),
    length: 0,
    unjustified: 0,
    firstIsShove: false,
    firstDir: undefined,
    firstType: undefined,
  };

  const best = new Map<string, SearchState>();
  best.set(
    `${cellKey(from)}|${roomId}|${start.layoutKey}|${start.shoveKey}|${start.gold}|${start.piles}`,
    start,
  );
  const queue: SearchState[] = [start];
  let winner: SearchState | undefined;
  const passable = [...grid.cells.values()].filter((c) => c.kind !== "wall").length;
  const maxLength = Math.max(8, passable * 4);
  let head = 0;

  const take = (next: SearchState, reached: boolean) => {
    if (reached) {
      if (!winner || better(next, winner, dirs)) winner = next;
      return;
    }
    const nk = `${cellKey(next.cell)}|${next.roomId}|${next.layoutKey}|${next.shoveKey}|${next.gold}|${next.piles}`;
    const prev = best.get(nk);
    if (!prev || better(next, prev, dirs)) {
      best.set(nk, next);
      queue.push(next);
    }
  };

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (!cur || cur.length >= maxLength) continue;
    const curLayout = cur.layoutKey === originKey ? layout : layoutFromKey(layout, cur.layoutKey);
    const activeGrid = cur.layoutKey === originKey ? grid : buildWalkGrid(curLayout);

    for (const dir of dirs) {
      const path = resolveStep(activeGrid, cur.cell, dir, immunities, curLayout, cur.gold);
      if (path?.length) {
        let goldNow = cur.gold;
        let roomNow = cur.roomId;
        let pilesNow = parsePilesKey(cur.piles);
        let reached = false;
        let invalid = false;
        let last = path[path.length - 1];
        for (const cell of path) {
          const applied = applyWalkEconomy(
            curLayout,
            activeGrid,
            cell,
            roomNow,
            goldNow,
            pilesNow,
            targetRoomIds,
          );
          if (applied.invalid) {
            invalid = true;
            break;
          }
          goldNow = applied.gold;
          roomNow = applied.roomId;
          pilesNow = applied.piles;
          last = cell;
          if (applied.reached) {
            reached = true;
            break;
          }
        }
        if (!invalid && last) {
          take(
            {
              cell: last,
              roomId: roomNow,
              layoutKey: cur.layoutKey,
              shoveKey: cur.shoveKey,
              gold: goldNow,
              piles: pilesKey(pilesNow),
              length: cur.length + 1,
              unjustified: cur.unjustified,
              firstIsShove: cur.firstType === undefined ? false : cur.firstIsShove,
              firstDir: cur.firstDir ?? dir,
              firstType: cur.firstType ?? "walk",
            },
            reached,
          );
        }
      }

      const budget = parseShoveKey(cur.shoveKey);
      const left = budget.get(cur.roomId) ?? 0;
      if (left <= 0) continue;
      const shoved = planShove(curLayout, cur.cell, cur.roomId, dir);
      if (!shoved) continue;

      const before = walkDist(curLayout, activeGrid, cur.cell, targetRoomIds, immunities, cur.gold);
      const nextGrid = buildWalkGrid(shoved.layout);
      const after = walkDist(
        shoved.layout,
        nextGrid,
        shoved.cell,
        targetRoomIds,
        immunities,
        cur.gold,
      );
      const justified = after !== undefined && (before === undefined || after < before);
      budget.set(cur.roomId, left - 1);
      take(
        {
          cell: shoved.cell,
          roomId: cur.roomId,
          layoutKey: layoutKeyOf(shoved.layout),
          shoveKey: shoveKeyOf(budget),
          gold: cur.gold,
          piles: cur.piles,
          length: cur.length + 1,
          unjustified: cur.unjustified + (justified ? 0 : 1),
          firstIsShove: cur.firstType === undefined ? true : cur.firstIsShove,
          firstDir: cur.firstDir ?? dir,
          firstType: cur.firstType ?? "shove",
        },
        targetRoomIds.includes(cur.roomId),
      );
    }
  }

  if (!winner?.firstDir || !winner.firstType) return undefined;
  return { type: winner.firstType, dir: winner.firstDir };
}
