// Implements FR-21: Elf(x, elems) — among paths to Z, preserve the most HP,
// then take the shortest, then break ties right → up → left → down (FR-31,
// same orientation rules as Warrior). Immunities are FR-14 bypass.
//
// Planning ignores death (FR-28): HP may go ≤0 along a hypothetical path;
// the Elf still scores that path's HP at Z. Water is terrain (impassable),
// not a planned-through death, unless an ice slide forces a landing.

import { elementalTick } from "./elements.js";
import type { ElementType, Orientation, RoomDef } from "./level.js";
import {
  cellKey,
  resolveStep,
  roomIdAt,
  type CellPos,
  type WalkGrid,
} from "./pathing.js";
import type { DungeonLayout } from "./placement.js";
import { orientedTieBreak, type Cardinal } from "./tiles.js";

export interface ElfStepInput {
  layout: DungeonLayout;
  grid: WalkGrid;
  from: CellPos;
  hp: number;
  roomId: string;
  poisonVisits: ReadonlySet<string>;
  immunities: readonly ElementType[];
  orientation: Orientation;
}

interface SearchState {
  cell: CellPos;
  roomId: string;
  hp: number;
  poison: string;
  length: number;
  firstDir: Cardinal | undefined;
}

function poisonKey(visits: Iterable<string>): string {
  return [...visits].sort().join(";");
}

function parsePoison(key: string): Set<string> {
  if (!key) return new Set();
  return new Set(key.split(";").filter(Boolean));
}

function roomDefOf(layout: DungeonLayout, roomId: string): RoomDef | undefined {
  return layout.rooms.find((r) => r.id === roomId)?.def;
}

function better(a: SearchState, b: SearchState): boolean {
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
): { hp: number; roomId: string; poison: Set<string>; reachedZ: boolean; invalid: boolean } {
  const nextRoomId = roomIdAt(grid, cell);
  if (!nextRoomId) return { hp, roomId, poison, reachedZ: false, invalid: true };

  let nextHp = hp;
  let nextPoison = poison;
  let reachedZ = false;

  if (nextRoomId !== roomId) {
    const def = roomDefOf(layout, nextRoomId);
    if (def?.type === "Z") reachedZ = true;
    if (def?.type === "D") {
      const amount = typeof def.damage === "number" ? def.damage : Number(def.damage);
      if (!Number.isNaN(amount)) nextHp -= amount;
    }
  }

  const walk = grid.cells.get(cellKey(cell));
  const element = walk?.element;
  const tick = elementalTick(element, immunities, element === "poison" && poison.has(cellKey(cell)));
  // Water on a slide is death in the simulator; FR-28 planning continues.
  nextHp += tick.hpDelta;
  if (tick.recordPoisonVisit) {
    nextPoison = new Set(poison);
    nextPoison.add(cellKey(cell));
  }

  return { hp: nextHp, roomId: nextRoomId, poison: nextPoison, reachedZ, invalid: false };
}

/**
 * FR-21 / FR-31: first step of the HP-preserving shortest path to Z, or
 * undefined when no improving path exists (FR-30 wait).
 */
export function chooseElfStep(input: ElfStepInput): Cardinal | undefined {
  const { layout, grid, from, hp, roomId, poisonVisits, immunities, orientation } = input;
  const dirs = orientedTieBreak(orientation);
  const start: SearchState = {
    cell: from,
    roomId,
    hp,
    poison: poisonKey(poisonVisits),
    length: 0,
    firstDir: undefined,
  };

  const best = new Map<string, SearchState>();
  const startKey = `${cellKey(from)}|${roomId}|${start.poison}`;
  best.set(startKey, start);
  const queue: SearchState[] = [start];

  let winner: SearchState | undefined;
  const passable = [...grid.cells.values()].filter((c) => c.kind !== "wall").length;
  const maxLength = Math.max(8, passable * 4);

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    if (!cur) break;
    if (cur.length >= maxLength) continue;

    const curKey = `${cellKey(cur.cell)}|${cur.roomId}|${cur.poison}`;
    const known = best.get(curKey);
    if (known && better(known, cur)) continue;

    for (const dir of dirs) {
      const path = resolveStep(grid, cur.cell, dir, immunities, layout);
      if (!path?.length) continue;

      let hpNow = cur.hp;
      let roomNow = cur.roomId;
      let poisonNow = parsePoison(cur.poison);
      let reachedZ = false;
      let invalid = false;
      let last = path[path.length - 1];

      for (const cell of path) {
        const applied = applyPlannedCell(
          layout,
          grid,
          cell,
          roomNow,
          hpNow,
          poisonNow,
          immunities,
        );
        if (applied.invalid) {
          invalid = true;
          break;
        }
        hpNow = applied.hp;
        roomNow = applied.roomId;
        poisonNow = applied.poison;
        last = cell;
        if (applied.reachedZ) {
          reachedZ = true;
          break;
        }
      }
      if (invalid || !last) continue;

      const next: SearchState = {
        cell: last,
        roomId: roomNow,
        hp: hpNow,
        poison: poisonKey(poisonNow),
        length: cur.length + 1,
        firstDir: cur.firstDir ?? dir,
      };

      if (reachedZ) {
        if (!winner || better(next, winner)) winner = next;
        continue;
      }

      const nk = `${cellKey(next.cell)}|${next.roomId}|${next.poison}`;
      const prev = best.get(nk);
      if (!prev || better(next, prev)) {
        best.set(nk, next);
        queue.push(next);
      }
    }
  }

  return winner?.firstDir;
}
