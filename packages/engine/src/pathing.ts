// Implements FR-20 (Warrior shortest path + tie-break) and FR-31 (orientation-
// relative directional fallback). FR-27 / FR-29: the walkable grid is the map
// only — other heroes are never obstacles. FR-28: distances ignore HP / D(x).
// FR-14: water is impassable (unless immune); ice slides until a wall.
// FR-17: unpaid light cells are impassable as a chosen step (like water);
// gold pickups along a path can open later tolls (Warrior sees map gold).
// FR-16: a pile on the destination room is available before that room's
// hatch toll (pickup pre-empts other entry effects).

import { ignoresElement } from "./elements.js";
import { clonePiles, pilesKey, type PathEconomy } from "./gold.js";
import type { ElementType, Orientation } from "./level.js";
import { isElementType } from "./level.js";
import { findRoom, resolvedTile, type DungeonLayout, type PlacedRoom } from "./placement.js";
import {
  ROOM_SIZE,
  deltaFor,
  orientedTieBreak,
  tileCell,
  type Cardinal,
  type CellKind,
} from "./tiles.js";

export type { PathEconomy } from "./gold.js";

export interface CellPos {
  x: number;
  y: number;
}

export interface WalkCell {
  world: CellPos;
  roomId: string;
  local: CellPos;
  kind: CellKind;
  /** Present on green E cells (FR-14) and dark T cells (FR-17). */
  element?: ElementType;
  /** Present on light T cells — gold cost to cross (FR-17). */
  toll?: number;
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
          element: elementOnCell(room, kind),
          toll: tollOnCell(room, kind),
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
  const kind = getWalkCell(grid, pos)?.kind;
  return kind !== undefined && kind !== "wall";
}

export function isPassable(
  grid: WalkGrid,
  pos: CellPos,
  immunities: readonly ElementType[] = [],
  gold = 0,
  piles?: ReadonlyMap<string, number>,
  fromRoomId?: string,
): boolean {
  const cell = getWalkCell(grid, pos);
  if (!cell || cell.kind === "wall") return false;
  if (cell.element === "water" && !ignoresElement(immunities, "water")) return false;
  // FR-16 / FR-17: pickup on room entry is available before the hatch toll.
  const available =
    piles && fromRoomId !== undefined && cell.roomId !== fromRoomId
      ? gold + (piles.get(cell.roomId) ?? 0)
      : gold;
  // FR-17: unpaid light is not a voluntary step (forced landing dies later).
  if (cell.toll !== undefined && available < cell.toll) return false;
  return true;
}

function elementOnCell(room: PlacedRoom, kind: CellKind): ElementType | undefined {
  if (kind === "green" && room.def.type === "E" && isElementType(room.def.element)) {
    return room.def.element;
  }
  if (kind === "dark" && room.def.type === "T" && isElementType(room.def.element)) {
    return room.def.element;
  }
  return undefined;
}

function tollOnCell(room: PlacedRoom, kind: CellKind): number | undefined {
  if (kind !== "light" || room.def.type !== "T") return undefined;
  const raw = room.def.cost;
  const cost = typeof raw === "number" ? raw : Number(raw);
  return Number.isNaN(cost) ? 0 : cost;
}

function isIceCell(cell: WalkCell | undefined, immunities: readonly ElementType[]): boolean {
  return cell?.element === "ice" && !ignoresElement(immunities, "ice");
}

function isZCell(layout: DungeonLayout, roomId: string): boolean {
  return layout.rooms.find((r) => r.id === roomId)?.def.type === "Z";
}

/**
 * FR-14: one chosen direction. Water is not a voluntary step. Entering ice
 * (and not immune) slides through walkable cells until a wall or Z.
 * Water is not a wall — the hero slides onto/through it and dies in the
 * simulator. Returns the cells entered, or undefined when the first step
 * is illegal.
 */
export function resolveStep(
  grid: WalkGrid,
  from: CellPos,
  dir: Cardinal,
  immunities: readonly ElementType[] = [],
  layout?: DungeonLayout,
  gold = 0,
  piles?: ReadonlyMap<string, number>,
): CellPos[] | undefined {
  const first = stepCell(from, dir);
  // Water / unpaid light are impassable as a chosen step (FR-14 / FR-17).
  // Forced landings happen only mid-slide, inside continueSlide.
  // FR-16: a pile on the entered room counts toward that first-step toll.
  if (!isPassable(grid, first, immunities, gold, piles, roomIdAt(grid, from))) return undefined;
  return continueSlide(grid, [first], dir, immunities, layout);
}

function continueSlide(
  grid: WalkGrid,
  path: CellPos[],
  dir: Cardinal,
  immunities: readonly ElementType[],
  layout: DungeonLayout | undefined,
): CellPos[] {
  const first = path[0];
  if (!first) return path;
  if (!isIceCell(getWalkCell(grid, first), immunities)) return path;
  if (layout && isZCell(layout, getWalkCell(grid, first)?.roomId ?? "")) return path;

  let current = first;
  while (true) {
    const next = stepCell(current, dir);
    const cell = getWalkCell(grid, next);
    if (!cell || cell.kind === "wall") break;
    path.push(next);
    if (layout && isZCell(layout, cell.roomId)) break;
    current = next;
  }
  return path;
}

export function roomIdAt(grid: WalkGrid, pos: CellPos): string | undefined {
  return getWalkCell(grid, pos)?.roomId;
}

/**
 * Action-distance to Z on the FR-14 movement graph (ice slides, water
 * blocked unless immune). Unreachable cells are omitted. Ignores HP and
 * other heroes (FR-20, FR-27, FR-28).
 */
export function distanceToZ(
  layout: DungeonLayout,
  grid: WalkGrid,
  immunities: readonly ElementType[] = [],
  gold = 0,
): Map<string, number> {
  const incoming = reverseMoveGraph(layout, grid, immunities, gold);
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
    for (const prev of incoming.get(cellKey(cur)) ?? []) {
      const pk = cellKey(prev);
      if (dist.has(pk)) continue;
      dist.set(pk, curDist + 1);
      queue.push(prev);
    }
  }

  return dist;
}

/** Cells that can reach `to` in one resolveStep (reverse of the ice-aware graph). */
function reverseMoveGraph(
  layout: DungeonLayout,
  grid: WalkGrid,
  immunities: readonly ElementType[],
  gold = 0,
): Map<string, CellPos[]> {
  const incoming = new Map<string, CellPos[]>();
  const bump = (to: string, from: CellPos) => {
    const list = incoming.get(to);
    if (list) list.push(from);
    else incoming.set(to, [from]);
  };

  for (const cell of grid.cells.values()) {
    if (!isPassable(grid, cell.world, immunities, gold)) continue;
    for (const dir of orientedTieBreak(0)) {
      const path = resolveStep(grid, cell.world, dir, immunities, layout, gold);
      if (!path?.length) continue;
      const land = path[path.length - 1];
      if (!land) continue;
      // A slide that crosses Z "lands" on the first Z cell for distance.
      const zHit = path.find((p) => {
        const id = roomIdAt(grid, p);
        return id !== undefined && isZCell(layout, id);
      });
      bump(cellKey(zHit ?? land), cell.world);
    }
  }
  return incoming;
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
  immunities: readonly ElementType[] = [],
  layout?: DungeonLayout,
  economy?: PathEconomy,
  roomId?: string,
): Cardinal | undefined {
  if (layout && economy && shouldUseEconomy(layout, economy)) {
    return chooseWarriorEconomy(
      layout,
      grid,
      from,
      roomId ?? roomIdAt(grid, from) ?? "",
      orientation,
      immunities,
      economy,
    );
  }

  const here = dist.get(cellKey(from));
  if (here === undefined) return undefined;
  const gold = economy?.gold ?? 0;

  for (const dir of orientedTieBreak(orientation)) {
    const path = resolveStep(grid, from, dir, immunities, layout, gold, economy?.piles);
    if (!path?.length) continue;
    const land = landingForDistance(grid, path, layout);
    const nDist = dist.get(cellKey(land));
    if (nDist !== undefined && nDist < here) {
      return dir;
    }
  }
  return undefined;
}

function shouldUseEconomy(layout: DungeonLayout, economy: PathEconomy): boolean {
  if (economy.gold > 0) return true;
  if ([...economy.piles.values()].some((amount) => amount > 0)) return true;
  return layout.rooms.some((room) => room.def.type === "T" || room.def.type === "O");
}

interface WarriorEconomyState {
  cell: CellPos;
  roomId: string;
  gold: number;
  piles: string;
  length: number;
  firstDir: Cardinal | undefined;
}

/**
 * FR-20 + FR-16/FR-17: shortest path to Z, treating unpaid light as blocked
 * and scoring pickups so a nearby O can open a later T. Still ignores HP.
 */
function chooseWarriorEconomy(
  layout: DungeonLayout,
  grid: WalkGrid,
  from: CellPos,
  roomId: string,
  orientation: Orientation,
  immunities: readonly ElementType[],
  economy: PathEconomy,
): Cardinal | undefined {
  const dirs = orientedTieBreak(orientation);
  const start: WarriorEconomyState = {
    cell: from,
    roomId,
    gold: economy.gold,
    piles: pilesKey(economy.piles),
    length: 0,
    firstDir: undefined,
  };
  const seen = new Set<string>([`${cellKey(from)}|${roomId}|${start.gold}|${start.piles}`]);
  const queue: WarriorEconomyState[] = [start];
  const passable = [...grid.cells.values()].filter((c) => c.kind !== "wall").length;
  const maxLength = Math.max(8, passable * 4);
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (!cur || cur.length >= maxLength) continue;

    for (const dir of dirs) {
      const path = resolveStep(
        grid,
        cur.cell,
        dir,
        immunities,
        layout,
        cur.gold,
        parsePiles(cur.piles),
      );
      if (!path?.length) continue;

      let goldNow = cur.gold;
      let roomNow = cur.roomId;
      let pilesNow = parsePiles(cur.piles);
      let reachedZ = false;
      let invalid = false;
      let last = path[path.length - 1];

      for (const cell of path) {
        const applied = applyPlannedEconomy(layout, grid, cell, roomNow, goldNow, pilesNow);
        if (applied.invalid) {
          invalid = true;
          break;
        }
        goldNow = applied.gold;
        roomNow = applied.roomId;
        pilesNow = applied.piles;
        last = cell;
        if (applied.reachedZ) {
          reachedZ = true;
          break;
        }
      }
      if (invalid || !last) continue;

      const next: WarriorEconomyState = {
        cell: last,
        roomId: roomNow,
        gold: goldNow,
        piles: pilesKey(pilesNow),
        length: cur.length + 1,
        firstDir: cur.firstDir ?? dir,
      };
      if (reachedZ) return next.firstDir;

      const nk = `${cellKey(next.cell)}|${next.roomId}|${next.gold}|${next.piles}`;
      if (seen.has(nk)) continue;
      seen.add(nk);
      queue.push(next);
    }
  }
  return undefined;
}

function parsePiles(key: string): Map<string, number> {
  const piles = new Map<string, number>();
  if (!key) return piles;
  for (const part of key.split(";")) {
    const split = part.lastIndexOf(":");
    if (split <= 0) continue;
    const id = part.slice(0, split);
    const amount = Number(part.slice(split + 1));
    if (id && !Number.isNaN(amount) && amount > 0) piles.set(id, amount);
  }
  return piles;
}

function applyPlannedEconomy(
  layout: DungeonLayout,
  grid: WalkGrid,
  cell: CellPos,
  roomId: string,
  gold: number,
  piles: Map<string, number>,
): {
  gold: number;
  roomId: string;
  piles: Map<string, number>;
  reachedZ: boolean;
  invalid: boolean;
} {
  const nextRoomId = roomIdAt(grid, cell);
  if (!nextRoomId) return { gold, roomId, piles, reachedZ: false, invalid: true };

  let nextGold = gold;
  let nextPiles = piles;
  let reachedZ = false;

  if (nextRoomId !== roomId) {
    const def = layout.rooms.find((r) => r.id === nextRoomId)?.def;
    if (def?.type === "Z") reachedZ = true;
    const pile = piles.get(nextRoomId) ?? 0;
    if (pile > 0) {
      nextGold += pile;
      nextPiles = clonePiles(piles);
      nextPiles.set(nextRoomId, 0);
    }
  }

  const walk = grid.cells.get(cellKey(cell));
  if (walk?.toll !== undefined && nextGold >= walk.toll) {
    // FR-28: Warrior still plans a path that would die on a later unpaid
    // light (same as D). Voluntary unpaid steps are already rejected by
    // resolveStep.
    nextGold -= walk.toll;
  }

  return { gold: nextGold, roomId: nextRoomId, piles: nextPiles, reachedZ, invalid: false };
}

function landingForDistance(
  grid: WalkGrid,
  path: CellPos[],
  layout: DungeonLayout | undefined,
): CellPos {
  if (layout) {
    const zHit = path.find((p) => {
      const id = roomIdAt(grid, p);
      return id !== undefined && isZCell(layout, id);
    });
    if (zHit) return zHit;
  }
  return path[path.length - 1] ?? path[0]!;
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
