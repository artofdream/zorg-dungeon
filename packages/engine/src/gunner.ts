// Implements FR-22: Gunner(x, c[, dur]) path/fire priorities from the 2-arg
// rules. Priority: fire soonest (a useful Shell), then HP-preserving shortest
// path factoring shots, then Warrior tie order.
//
// S3 / NFR-8: the optional third argument is stored on the hero def and is
// never read here. Instant Shells, up to c shots. `shots === "inf"` means
// no ammo cap. Duration does not change fire rate, lifetime, or legality.

import type { HeroAction } from "./action.js";
import { elementalTick } from "./elements.js";
import { clonePiles, pilesKey, parsePilesKey, type PathEconomy } from "./gold.js";
import type { ElementType, Orientation } from "./level.js";
import {
  buildWalkGrid,
  cellKey,
  resolveStep,
  roomIdAt,
  stepCell,
  type CellPos,
  type WalkGrid,
} from "./pathing.js";
import type { DungeonLayout } from "./placement.js";
import {
  collectShellClears,
  parseSetKey,
  setKey,
  shellClearsSomething,
  shellPath,
} from "./shell.js";
import { orientedTieBreak, type Cardinal } from "./tiles.js";

export type ShotCount = number | "inf";

export interface GunnerStepInput {
  layout: DungeonLayout;
  grid: WalkGrid;
  from: CellPos;
  hp: number;
  roomId: string;
  poisonVisits: ReadonlySet<string>;
  immunities?: readonly ElementType[];
  orientation: Orientation;
  economy?: PathEconomy;
  targetRoomIds: readonly string[];
  shotsLeft: ShotCount;
  clearedCells: ReadonlySet<string>;
  clearedMonsters: ReadonlySet<string>;
}

interface SearchState {
  cell: CellPos;
  roomId: string;
  hp: number;
  poison: string;
  gold: number;
  piles: string;
  shots: ShotCount;
  clearedCells: string;
  clearedMonsters: string;
  length: number;
  firstFire: number;
  firstDir: Cardinal | undefined;
  firstType: "walk" | "fire" | undefined;
}

function poisonKey(visits: Iterable<string>): string {
  return [...visits].sort().join(";");
}

function parsePoison(key: string): Set<string> {
  if (!key) return new Set();
  return new Set(key.split(";").filter(Boolean));
}

function canFire(shots: ShotCount): boolean {
  return shots === "inf" || shots > 0;
}

function decShots(shots: ShotCount): ShotCount {
  if (shots === "inf") return "inf";
  return Math.max(0, shots - 1);
}

function roomDefOf(layout: DungeonLayout, roomId: string) {
  return layout.rooms.find((r) => r.id === roomId)?.def;
}

function isTarget(layout: DungeonLayout, roomId: string, targets: readonly string[]): boolean {
  return targets.includes(roomId);
}

function better(a: SearchState, b: SearchState): boolean {
  if (a.firstFire !== b.firstFire) return a.firstFire < b.firstFire;
  if (a.hp !== b.hp) return a.hp > b.hp;
  if (a.length !== b.length) return a.length < b.length;
  return false;
}

function applyPlannedCell(
  layout: DungeonLayout,
  grid: WalkGrid,
  cell: CellPos,
  roomId: string,
  hp: number,
  poison: Set<string>,
  immunities: readonly ElementType[],
  gold: number,
  piles: Map<string, number>,
  targets: readonly string[],
  clearedMonsters: ReadonlySet<string>,
): {
  hp: number;
  roomId: string;
  poison: Set<string>;
  gold: number;
  piles: Map<string, number>;
  reached: boolean;
  invalid: boolean;
} {
  const nextRoomId = roomIdAt(grid, cell);
  if (!nextRoomId) {
    return { hp, roomId, poison, gold, piles, reached: false, invalid: true };
  }

  let nextHp = hp;
  let nextPoison = poison;
  let nextGold = gold;
  let nextPiles = piles;
  let reached = false;

  if (nextRoomId !== roomId) {
    if (isTarget(layout, nextRoomId, targets)) reached = true;
    const def = roomDefOf(layout, nextRoomId);
    if (def?.type === "D" && !clearedMonsters.has(nextRoomId)) {
      const amount = typeof def.damage === "number" ? def.damage : Number(def.damage);
      if (!Number.isNaN(amount)) nextHp -= amount;
    }
    const pile = piles.get(nextRoomId) ?? 0;
    if (pile > 0) {
      nextGold += pile;
      nextPiles = clonePiles(piles);
      nextPiles.set(nextRoomId, 0);
    }
  }

  const walk = grid.cells.get(cellKey(cell));
  if (walk?.toll !== undefined) {
    if (nextGold < walk.toll) {
      return {
        hp: nextHp,
        roomId: nextRoomId,
        poison: nextPoison,
        gold: nextGold,
        piles: nextPiles,
        reached,
        invalid: true,
      };
    }
    nextGold -= walk.toll;
  }

  const element = walk?.element;
  const tick = elementalTick(element, immunities, element === "poison" && poison.has(cellKey(cell)));
  nextHp += tick.hpDelta;
  if (tick.recordPoisonVisit) {
    nextPoison = new Set(poison);
    nextPoison.add(cellKey(cell));
  }

  return {
    hp: nextHp,
    roomId: nextRoomId,
    poison: nextPoison,
    gold: nextGold,
    piles: nextPiles,
    reached,
    invalid: false,
  };
}

function usefulDirs(
  layout: DungeonLayout,
  grid: WalkGrid,
  from: CellPos,
  shots: ShotCount,
  clearedCells: ReadonlySet<string>,
  clearedMonsters: ReadonlySet<string>,
  dirs: readonly Cardinal[],
): Cardinal[] {
  if (!canFire(shots)) return [];
  const out: Cardinal[] = [];
  for (const dir of dirs) {
    const cells = shellPath(grid, stepCell(from, dir), dir);
    if (shellClearsSomething(layout, grid, cells, clearedCells, clearedMonsters)) {
      out.push(dir);
    }
  }
  return out;
}

/**
 * FR-22 / FR-31: first walk or fire of the Gunner's priority path.
 * Duration is not consulted (S3).
 */
export function chooseGunnerStep(input: GunnerStepInput): HeroAction | undefined {
  const {
    layout,
    grid,
    from,
    hp,
    roomId,
    poisonVisits,
    orientation,
    economy,
    targetRoomIds,
    shotsLeft,
    clearedCells,
    clearedMonsters,
  } = input;
  const immunities = input.immunities ?? [];
  const dirs = orientedTieBreak(orientation);

  const start: SearchState = {
    cell: from,
    roomId,
    hp,
    poison: poisonKey(poisonVisits),
    gold: economy?.gold ?? 0,
    piles: pilesKey(economy?.piles ?? new Map()),
    shots: shotsLeft,
    clearedCells: setKey(clearedCells),
    clearedMonsters: setKey(clearedMonsters),
    length: 0,
    firstFire: Number.POSITIVE_INFINITY,
    firstDir: undefined,
    firstType: undefined,
  };

  const best = new Map<string, SearchState>();
  const startKey = [
    cellKey(from),
    roomId,
    start.poison,
    start.gold,
    start.piles,
    String(start.shots),
    start.clearedCells,
    start.clearedMonsters,
  ].join("|");
  best.set(startKey, start);
  const queue: SearchState[] = [start];
  let winner: SearchState | undefined;
  const passable = [...grid.cells.values()].filter((c) => c.kind !== "wall").length;
  const maxLength = Math.max(8, passable * 4);
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (!cur || cur.length >= maxLength) continue;

    const cellsNow = parseSetKey(cur.clearedCells);
    const monstersNow = parseSetKey(cur.clearedMonsters);
    const walkGrid = cur.clearedCells ? buildWalkGrid(layout, cellsNow) : grid;
    const onTarget = targetRoomIds.includes(cur.roomId);

    if (onTarget && cur.firstType !== undefined) {
      if (!winner || better(cur, winner)) winner = cur;
    }

    for (const dir of usefulDirs(layout, walkGrid, cur.cell, cur.shots, cellsNow, monstersNow, dirs)) {
      const path = shellPath(walkGrid, stepCell(cur.cell, dir), dir);
      const clears = collectShellClears(layout, grid, path, cellsNow, monstersNow);
      const nextCells = new Set(cellsNow);
      for (const k of clears.clearedCellKeys) nextCells.add(k);
      const nextMonsters = new Set(monstersNow);
      for (const id of clears.clearedRoomIds) nextMonsters.add(id);
      const next: SearchState = {
        ...cur,
        shots: decShots(cur.shots),
        clearedCells: setKey(nextCells),
        clearedMonsters: setKey(nextMonsters),
        length: cur.length + 1,
        firstFire: cur.firstType === undefined ? cur.length + 1 : cur.firstFire,
        firstDir: cur.firstDir ?? dir,
        firstType: cur.firstType ?? "fire",
      };
      enqueue(next, best, queue);
      if (onTarget && (!winner || better(next, winner))) winner = next;
    }

    if (onTarget) continue;

    for (const dir of dirs) {
      const path = resolveStep(walkGrid, cur.cell, dir, immunities, layout, cur.gold);
      if (!path?.length) continue;

      let hpNow = cur.hp;
      let roomNow = cur.roomId;
      let poisonNow = parsePoison(cur.poison);
      let goldNow = cur.gold;
      let pilesNow = parsePilesKey(cur.piles);
      let reached = false;
      let invalid = false;
      let last = path[path.length - 1];

      for (const cell of path) {
        const applied = applyPlannedCell(
          layout,
          walkGrid,
          cell,
          roomNow,
          hpNow,
          poisonNow,
          immunities,
          goldNow,
          pilesNow,
          targetRoomIds,
          monstersNow,
        );
        if (applied.invalid) {
          invalid = true;
          break;
        }
        hpNow = applied.hp;
        roomNow = applied.roomId;
        poisonNow = applied.poison;
        goldNow = applied.gold;
        pilesNow = applied.piles;
        last = cell;
        if (applied.reached) {
          reached = true;
          break;
        }
      }
      if (invalid || !last) continue;

      const next: SearchState = {
        cell: last,
        roomId: roomNow,
        hp: hpNow,
        poison: poisonKey(poisonNow),
        gold: goldNow,
        piles: pilesKey(pilesNow),
        shots: cur.shots,
        clearedCells: cur.clearedCells,
        clearedMonsters: cur.clearedMonsters,
        length: cur.length + 1,
        firstFire: cur.firstFire,
        firstDir: cur.firstDir ?? dir,
        firstType: cur.firstType ?? "walk",
      };

      if (reached) {
        if (!winner || better(next, winner)) winner = next;
        continue;
      }
      enqueue(next, best, queue);
    }
  }

  if (!winner?.firstDir || !winner.firstType) return undefined;
  return { type: winner.firstType, dir: winner.firstDir };
}

function enqueue(
  next: SearchState,
  best: Map<string, SearchState>,
  queue: SearchState[],
): void {
  const nk = [
    cellKey(next.cell),
    next.roomId,
    next.poison,
    next.gold,
    next.piles,
    String(next.shots),
    next.clearedCells,
    next.clearedMonsters,
  ].join("|");
  const prev = best.get(nk);
  if (!prev || better(next, prev)) {
    best.set(nk, next);
    queue.push(next);
  }
}

export function gunnerShots(shots: number | string): ShotCount {
  if (shots === "inf" || shots === "∞") return "inf";
  const n = typeof shots === "number" ? shots : Number(shots);
  return Number.isNaN(n) ? 0 : n;
}
