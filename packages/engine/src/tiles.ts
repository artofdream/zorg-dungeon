// Room tiles: each placed room is a 5×5 cell (GAME_SPEC.md terminology).
// Official per-type art is not in the source extract. The default is a
// 4-hatch cross so FR-6 edge matching is real. E rooms add interior green
// cells (FR-14); hatch *direction* is orientation metadata (FR-7 / NFR-6).

import type { Orientation } from "./level.js";

export const ROOM_SIZE = 5;

export type CellKind = "open" | "wall" | "green";

/** tile[y][x] with x=0 west, y=0 south (mathematical +x east, +y north). */
export type Tile = CellKind[][];

export type Cardinal = "right" | "up" | "left" | "down";

export type Side = "east" | "north" | "west" | "south";

const CARDINALS: Cardinal[] = ["right", "up", "left", "down"];

/** Native (orientation 0) hatch faces east / right. */
export const NATIVE_HATCH: Cardinal = "right";

/** FR-20 / FR-31 Warrior (and shared) tie order at orientation 0. */
export const TIE_BREAK_ORDER: readonly Cardinal[] = ["right", "up", "left", "down"];

export const CARDINAL_DELTA: Record<Cardinal, { dx: number; dy: number }> = {
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  down: { dx: 0, dy: -1 },
};

export const SIDE_TO_CARDINAL: Record<Side, Cardinal> = {
  east: "right",
  north: "up",
  west: "left",
  south: "down",
};

export const CARDINAL_TO_SIDE: Record<Cardinal, Side> = {
  right: "east",
  up: "north",
  left: "west",
  down: "south",
};

export function oppositeSide(side: Side): Side {
  switch (side) {
    case "east":
      return "west";
    case "west":
      return "east";
    case "north":
      return "south";
    case "south":
      return "north";
  }
}

export function oppositeCardinal(dir: Cardinal): Cardinal {
  switch (dir) {
    case "right":
      return "left";
    case "left":
      return "right";
    case "up":
      return "down";
    case "down":
      return "up";
  }
}

/**
 * Default Phase 1 tile: perimeter walls, open interior, one-cell hatch in
 * the middle of each cardinal side. Symmetric so a shared orientation still
 * allows a 4-connected dungeon (FR-5 / FR-7 together).
 */
export function makeDefaultTile(): Tile {
  const mid = 2;
  const tile: Tile = [];
  for (let y = 0; y < ROOM_SIZE; y++) {
    const row: CellKind[] = [];
    for (let x = 0; x < ROOM_SIZE; x++) {
      const onEdge = x === 0 || x === ROOM_SIZE - 1 || y === 0 || y === ROOM_SIZE - 1;
      const hatch =
        (x === mid && (y === 0 || y === ROOM_SIZE - 1)) ||
        (y === mid && (x === 0 || x === ROOM_SIZE - 1));
      row.push(onEdge && !hatch ? "wall" : "open");
    }
    tile.push(row);
  }
  return tile;
}

export const DEFAULT_ROOM_TILE: Tile = makeDefaultTile();

/**
 * FR-14 default E-room tile: same 4-hatch cross, interior 3×3 painted green.
 * Perimeter hatches stay plain open so FR-6 seams still match A/Z/D rooms.
 * Official green-cell art was not in the extract — tests that need a precise
 * cell should call paintGreen on a default tile.
 */
export function makeElementalTile(): Tile {
  const tile = makeDefaultTile();
  for (let y = 1; y < ROOM_SIZE - 1; y++) {
    for (let x = 1; x < ROOM_SIZE - 1; x++) {
      if (tileCell(tile, x, y) !== "wall") {
        setTileCell(tile, x, y, "green");
      }
    }
  }
  return tile;
}

export const DEFAULT_ELEMENTAL_TILE: Tile = makeElementalTile();

/** Test / authoring helper: mark listed local cells green (FR-14). */
export function paintGreen(tile: Tile, cells: ReadonlyArray<{ x: number; y: number }>): Tile {
  const next = cloneTile(tile);
  for (const cell of cells) {
    setTileCell(next, cell.x, cell.y, "green");
  }
  return next;
}

/** FR-6: green cells are open floor, not walls. */
export function walkableKind(kind: CellKind): "open" | "wall" {
  return kind === "wall" ? "wall" : "open";
}

export function isGreen(kind: CellKind): boolean {
  return kind === "green";
}

export function cloneTile(tile: Tile): Tile {
  return tile.map((row) => [...row]);
}

export function tileCell(tile: Tile, x: number, y: number): CellKind {
  const row = tile[y];
  const cell = row?.[x];
  if (cell === undefined) {
    throw new Error(`tile cell (${x}, ${y}) out of range for ${ROOM_SIZE}×${ROOM_SIZE}`);
  }
  return cell;
}

export function setTileCell(tile: Tile, x: number, y: number, kind: CellKind): void {
  const row = tile[y];
  if (!row || row[x] === undefined) {
    throw new Error(`tile cell (${x}, ${y}) out of range`);
  }
  row[x] = kind;
}

/** Rotate 90° counterclockwise around the tile center. 90 = one CCW turn. */
export function rotateTile(tile: Tile, orientation: Orientation): Tile {
  const steps = ((orientation / 90) % 4) as 0 | 1 | 2 | 3;
  let current = cloneTile(tile);
  for (let i = 0; i < steps; i++) {
    current = rotateTile90Ccw(current);
  }
  return current;
}

function rotateTile90Ccw(tile: Tile): Tile {
  const n = ROOM_SIZE;
  const next = makeBlank("wall");
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // (x, y) y-up → (n-1-y, x)
      setTileCell(next, n - 1 - y, x, tileCell(tile, x, y));
    }
  }
  return next;
}

function makeBlank(fill: CellKind): Tile {
  return Array.from({ length: ROOM_SIZE }, () => Array.from({ length: ROOM_SIZE }, () => fill));
}

/** FR-7: hatch direction after applying dungeon/room orientation (CCW). */
export function hatchDirection(orientation: Orientation): Cardinal {
  return rotateCardinal(NATIVE_HATCH, orientation);
}

/** Rotate a cardinal CCW by orientation degrees. */
export function rotateCardinal(dir: Cardinal, orientation: Orientation): Cardinal {
  const steps = ((orientation / 90) % 4) as 0 | 1 | 2 | 3;
  let current = dir;
  for (let i = 0; i < steps; i++) {
    current = rotateCardinal90Ccw(current);
  }
  return current;
}

function rotateCardinal90Ccw(dir: Cardinal): Cardinal {
  switch (dir) {
    case "right":
      return "up";
    case "up":
      return "left";
    case "left":
      return "down";
    case "down":
      return "right";
  }
}

/**
 * FR-20 / FR-31: directional priorities relative to dungeon orientation.
 * Orientation 0: right, up, left, down. Each +90° CCW rotates that list.
 */
export function orientedTieBreak(orientation: Orientation): Cardinal[] {
  return TIE_BREAK_ORDER.map((dir) => rotateCardinal(dir, orientation));
}

export function deltaFor(dir: Cardinal): { dx: number; dy: number } {
  return CARDINAL_DELTA[dir];
}

/**
 * Edge profile, south→north for east/west, west→east for north/south.
 * FR-6 compares these pairwise across a shared side.
 */
export function edgeProfile(tile: Tile, side: Side): CellKind[] {
  const last = ROOM_SIZE - 1;
  const cells: CellKind[] = [];
  for (let i = 0; i < ROOM_SIZE; i++) {
    switch (side) {
      case "east":
        cells.push(tileCell(tile, last, i));
        break;
      case "west":
        cells.push(tileCell(tile, 0, i));
        break;
      case "north":
        cells.push(tileCell(tile, i, last));
        break;
      case "south":
        cells.push(tileCell(tile, i, 0));
        break;
    }
  }
  return cells;
}

/** FR-6: wall meets wall and open meets open across the shared side. Green ≡ open. */
export function edgesMatch(a: CellKind[], b: CellKind[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((cell, i) => walkableKind(cell) === walkableKind(b[i] ?? "wall"));
}

/**
 * East–west one-cell corridor (FR-14 forced-path tests). North/south are
 * walls, so a hero cannot walk around a green cell on y=2.
 */
export function makeEwCorridorTile(): Tile {
  const mid = 2;
  const tile = makeBlank("wall");
  for (let x = 0; x < ROOM_SIZE; x++) {
    setTileCell(tile, x, mid, "open");
  }
  return tile;
}

/** Test helper: close the hatch on one side (still a legal 5×5 tile). */
export function sealSide(tile: Tile, side: Side): Tile {
  const next = cloneTile(tile);
  const last = ROOM_SIZE - 1;
  const mid = 2;
  switch (side) {
    case "east":
      setTileCell(next, last, mid, "wall");
      break;
    case "west":
      setTileCell(next, 0, mid, "wall");
      break;
    case "north":
      setTileCell(next, mid, last, "wall");
      break;
    case "south":
      setTileCell(next, mid, 0, "wall");
      break;
  }
  return next;
}

export function isCardinal(dir: string): dir is Cardinal {
  return (CARDINALS as string[]).includes(dir);
}
