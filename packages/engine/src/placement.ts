// Implements FR-5–FR-8: Maker grid placement, adjacency/orientation
// validation, and the extermination-phase gate.
// FR-10 (manhattanDistance) stays in geometry.ts.

import type { RoomPosition } from "./geometry.js";
import { manhattanDistance } from "./geometry.js";
import {
  flattenRooms,
  isChoixDef,
  type LevelDef,
  type Orientation,
  type RoomDef,
} from "./level.js";
import {
  CARDINAL_TO_SIDE,
  DEFAULT_ELEMENTAL_TILE,
  DEFAULT_ROOM_TILE,
  DEFAULT_TOLL_TILE,
  edgeProfile,
  edgesMatch,
  hatchDirection,
  oppositeSide,
  rotateTile,
  type Cardinal,
  type Side,
  type Tile,
} from "./tiles.js";

export interface SuppliedRoom {
  id: string;
  def: RoomDef;
}

export interface PlacedRoom {
  id: string;
  def: RoomDef;
  position: RoomPosition;
  orientation: Orientation;
  /** Optional tile override for tests / future official art. */
  tile?: Tile;
}

export interface DungeonLayout {
  rooms: PlacedRoom[];
  /** FR-11: designated main spawn at setup. Defaults to first supplied A that is placed. */
  mainAId?: string;
}

export type PlacementIssueCode =
  | "unresolved_choix"
  | "missing"
  | "extra"
  | "duplicate_id"
  | "unaligned"
  | "overlap"
  | "disconnected"
  | "diagonal_only"
  | "edge_mismatch"
  | "orientation"
  | "no_spawn"
  | "no_zorg";

export interface PlacementIssue {
  code: PlacementIssueCode;
  message: string;
  roomIds?: string[];
}

export interface PlacementReport {
  ok: boolean;
  issues: PlacementIssue[];
  /** True iff FR-5, FR-6, and FR-7 all hold (FR-8 gate). */
  canStartExtermination: boolean;
}

/** Stable instance ids from the level's flattened room list (A:0, D:0, D:1, …). */
export function enumerateSuppliedRooms(level: LevelDef): SuppliedRoom[] {
  for (const m of level.rooms) {
    if (isChoixDef(m.room)) {
      throw new Error("Cannot enumerate unresolved choix rooms (player has not chosen yet).");
    }
  }
  const flat = flattenRooms(level.rooms);
  const seen = new Map<string, number>();
  return flat.map((def) => {
    const n = seen.get(def.type) ?? 0;
    seen.set(def.type, n + 1);
    return { id: `${def.type}:${n}`, def };
  });
}

export function defaultTileFor(def: RoomDef): Tile {
  // FR-14: E rooms default to interior green cells. FR-17: T rooms default
  // to interior dark + hatch lights. Other types stay the Phase 1 4-hatch
  // cross (no invented art for A/Z/D/P/O).
  if (def.type === "E") return DEFAULT_ELEMENTAL_TILE;
  if (def.type === "T") return DEFAULT_TOLL_TILE;
  return DEFAULT_ROOM_TILE;
}

export function resolvedTile(room: PlacedRoom): Tile {
  const base = room.tile ?? defaultTileFor(room.def);
  return rotateTile(base, room.orientation);
}

export function roomAt(layout: DungeonLayout, x: number, y: number): PlacedRoom | undefined {
  return layout.rooms.find((r) => r.position.x === x && r.position.y === y);
}

export function findRoom(layout: DungeonLayout, id: string): PlacedRoom | undefined {
  return layout.rooms.find((r) => r.id === id);
}

/**
 * FR-5–FR-7 validator. Partial layouts are reported (not thrown) so the Maker
 * can show live feedback; FR-8 is `canStartExtermination`.
 */
export function validateLayout(level: LevelDef, layout: DungeonLayout): PlacementReport {
  const issues: PlacementIssue[] = [];

  if (level.rooms.some((m) => isChoixDef(m.room))) {
    issues.push({
      code: "unresolved_choix",
      message: "Level still has unresolved choix rooms; Phase 1 Maker requires a concrete room list.",
    });
    return report(issues);
  }

  let supplied: SuppliedRoom[];
  try {
    supplied = enumerateSuppliedRooms(level);
  } catch (err) {
    issues.push({
      code: "unresolved_choix",
      message: err instanceof Error ? err.message : String(err),
    });
    return report(issues);
  }

  const suppliedById = new Map(supplied.map((s) => [s.id, s]));
  const seenIds = new Set<string>();
  const occupied = new Map<string, string>();

  for (const room of layout.rooms) {
    if (seenIds.has(room.id)) {
      issues.push({
        code: "duplicate_id",
        message: `Room id "${room.id}" is placed more than once.`,
        roomIds: [room.id],
      });
    }
    seenIds.add(room.id);

    const spec = suppliedById.get(room.id);
    if (!spec) {
      issues.push({
        code: "extra",
        message: `Placed room "${room.id}" is not in the level's supplied list.`,
        roomIds: [room.id],
      });
    } else if (spec.def.type !== room.def.type) {
      issues.push({
        code: "extra",
        message: `Placed room "${room.id}" does not match supplied type ${spec.def.type}.`,
        roomIds: [room.id],
      });
    }

    if (!Number.isInteger(room.position.x) || !Number.isInteger(room.position.y)) {
      issues.push({
        code: "unaligned",
        message: `Room "${room.id}" is not grid-aligned (${room.position.x}, ${room.position.y}).`,
        roomIds: [room.id],
      });
    }

    const key = `${room.position.x},${room.position.y}`;
    const existing = occupied.get(key);
    if (existing) {
      issues.push({
        code: "overlap",
        message: `Rooms "${existing}" and "${room.id}" overlap at (${room.position.x}, ${room.position.y}).`,
        roomIds: [existing, room.id],
      });
    } else {
      occupied.set(key, room.id);
    }
  }

  for (const spec of supplied) {
    if (!seenIds.has(spec.id)) {
      issues.push({
        code: "missing",
        message: `Supplied room "${spec.id}" (${spec.def.type}) is not placed.`,
        roomIds: [spec.id],
      });
    }
  }

  const aRooms = layout.rooms.filter((r) => r.def.type === "A");
  const zRooms = layout.rooms.filter((r) => r.def.type === "Z");
  if (aRooms.length === 0) {
    issues.push({ code: "no_spawn", message: "Layout has no placed spawn room (A)." });
  }
  if (zRooms.length === 0) {
    issues.push({ code: "no_zorg", message: "Layout has no placed Zorg room (Z)." });
  }

  // FR-7: one shared orientation, anchored to all A rooms' hatch direction.
  if (aRooms.length > 0) {
    const anchor = aRooms[0];
    if (anchor) {
      const anchorOri = anchor.orientation;
      const aDisagree = aRooms.filter((r) => r.orientation !== anchorOri);
      if (aDisagree.length > 0) {
        issues.push({
          code: "orientation",
          message: `All A rooms must share one orientation (hatch ${hatchDirection(anchorOri)}); disagreeing: ${aDisagree.map((r) => r.id).join(", ")}.`,
          roomIds: [anchor.id, ...aDisagree.map((r) => r.id)],
        });
      } else {
        const others = layout.rooms.filter((r) => r.def.type !== "A" && r.orientation !== anchorOri);
        if (others.length > 0) {
          issues.push({
            code: "orientation",
            message: `Every room must match the A-room orientation ${anchorOri}° (hatch ${hatchDirection(anchorOri)}).`,
            roomIds: others.map((r) => r.id),
          });
        }
      }
    }
  }

  // FR-5: one 4-connected component — diagonals do not count as connections.
  if (layout.rooms.length > 0) {
    const adjacency = cardinalAdjacency(layout.rooms);
    const hasAnyCardinalEdge = [...adjacency.values()].some((n) => n.length > 0);
    const hasDiagonalTouch = layout.rooms.some((a, i) =>
      layout.rooms.slice(i + 1).some((b) => isDiagonalTouch(a.position, b.position)),
    );

    if (layout.rooms.length > 1 && !hasAnyCardinalEdge && hasDiagonalTouch) {
      issues.push({
        code: "diagonal_only",
        message: "Rooms touch only on diagonals; connections must share a full side (FR-5).",
        roomIds: layout.rooms.map((r) => r.id),
      });
    }

    const component = flood(layout.rooms, adjacency);
    if (component.size !== layout.rooms.length) {
      issues.push({
        code: "disconnected",
        message: "Placed rooms are not one 4-connected dungeon (FR-5).",
        roomIds: layout.rooms.filter((r) => !component.has(r.id)).map((r) => r.id),
      });
    }

    // FR-6: every cardinal neighbor pair must have matching edge profiles.
    const seenPairs = new Set<string>();
    for (const room of layout.rooms) {
      for (const [dir, neighbor] of neighborsByDir(room, layout.rooms)) {
        const pairKey = [room.id, neighbor.id].sort().join("|");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const side = CARDINAL_TO_SIDE[dir];
        const aEdge = edgeProfile(resolvedTile(room), side);
        const bEdge = edgeProfile(resolvedTile(neighbor), oppositeSide(side));
        if (!edgesMatch(aEdge, bEdge)) {
          issues.push({
            code: "edge_mismatch",
            message: `Shared ${side} edge between "${room.id}" and "${neighbor.id}" does not match (wall/open) (FR-6).`,
            roomIds: [room.id, neighbor.id],
          });
        }
      }
    }
  }

  if (layout.mainAId !== undefined && !layout.rooms.some((r) => r.id === layout.mainAId && r.def.type === "A")) {
    issues.push({
      code: "no_spawn",
      message: `Designated main A "${layout.mainAId}" is not a placed A room.`,
      roomIds: [layout.mainAId],
    });
  }

  return report(issues);
}

function report(issues: PlacementIssue[]): PlacementReport {
  const ok = issues.length === 0;
  return { ok, issues, canStartExtermination: ok };
}

/** FR-8: block extermination until FR-5–FR-7 hold for every supplied room. */
export function canStartExtermination(level: LevelDef, layout: DungeonLayout): boolean {
  return validateLayout(level, layout).canStartExtermination;
}

export function defaultMainAId(layout: DungeonLayout): string | undefined {
  if (layout.mainAId) return layout.mainAId;
  return layout.rooms.find((r) => r.def.type === "A")?.id;
}

function posKey(p: RoomPosition): string {
  return `${p.x},${p.y}`;
}

function isDiagonalTouch(a: RoomPosition, b: RoomPosition): boolean {
  return Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 1;
}

function cardinalAdjacency(rooms: PlacedRoom[]): Map<string, string[]> {
  const byPos = new Map(rooms.map((r) => [posKey(r.position), r]));
  const adj = new Map<string, string[]>();
  for (const room of rooms) adj.set(room.id, []);
  for (const room of rooms) {
    for (const dir of ["right", "up", "left", "down"] as const) {
      const neighbor = neighborInDir(room, dir, byPos);
      if (neighbor) {
        adj.get(room.id)?.push(neighbor.id);
      }
    }
  }
  return adj;
}

function neighborInDir(
  room: PlacedRoom,
  dir: Cardinal,
  byPos: Map<string, PlacedRoom>,
): PlacedRoom | undefined {
  const { dx, dy } =
    dir === "right"
      ? { dx: 1, dy: 0 }
      : dir === "left"
        ? { dx: -1, dy: 0 }
        : dir === "up"
          ? { dx: 0, dy: 1 }
          : { dx: 0, dy: -1 };
  return byPos.get(`${room.position.x + dx},${room.position.y + dy}`);
}

function neighborsByDir(room: PlacedRoom, rooms: PlacedRoom[]): [Cardinal, PlacedRoom][] {
  const byPos = new Map(rooms.map((r) => [posKey(r.position), r]));
  const out: [Cardinal, PlacedRoom][] = [];
  for (const dir of ["right", "up", "left", "down"] as const) {
    const n = neighborInDir(room, dir, byPos);
    if (n) out.push([dir, n]);
  }
  return out;
}

function flood(rooms: PlacedRoom[], adjacency: Map<string, string[]>): Set<string> {
  const start = rooms[0];
  if (!start) return new Set();
  const seen = new Set<string>([start.id]);
  const queue = [start.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Shared-side neighbor in a given world direction, or undefined. */
export function cardinalNeighbor(
  layout: DungeonLayout,
  room: PlacedRoom,
  dir: Cardinal,
): PlacedRoom | undefined {
  const want = {
    x: room.position.x + (dir === "right" ? 1 : dir === "left" ? -1 : 0),
    y: room.position.y + (dir === "up" ? 1 : dir === "down" ? -1 : 0),
  };
  return roomAt(layout, want.x, want.y);
}

export function sharedSideToward(from: PlacedRoom, to: PlacedRoom): Side | undefined {
  const d = manhattanDistance(from.position, to.position);
  if (d !== 1) return undefined;
  if (to.position.x === from.position.x + 1) return "east";
  if (to.position.x === from.position.x - 1) return "west";
  if (to.position.y === from.position.y + 1) return "north";
  if (to.position.y === from.position.y - 1) return "south";
  return undefined;
}
