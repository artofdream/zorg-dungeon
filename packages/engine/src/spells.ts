// Phase 4 spellbook helpers (FR-32–FR-42). The scheduler in simulation.ts
// owns when a cast is legal (between completed actions) and applies effects.
// Selection only dispatches the four spells that have a documented variant;
// Sleep / Wake / Banality / Selection itself have no Selection column.

import {
  isChoixDef,
  isSpellRepeat,
  type LevelDef,
  type SpellDef,
  type SpellSlot,
  type SpellType,
} from "./level.js";
import type { RoomPosition } from "./geometry.js";
import { roomAt, validateLayout, type DungeonLayout, type PlacedRoom } from "./placement.js";
import { lookupVisit, type RoomVisit } from "./portals.js";
import { cellKey, type CellPos } from "./pathing.js";
import { ROOM_SIZE } from "./tiles.js";

/** Spells whose GAME_SPEC table lists a Selection variant. */
export const SELECTION_INNER_TYPES: readonly SpellType[] = ["Attack", "Teleport", "Move", "Swap"];

export class SpellCastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpellCastError";
  }
}

export interface SpellRuntime {
  id: number;
  def: SpellDef;
  consumed: boolean;
}

/** Player intent for one cast. `spellId` is the unused instance in Φ. */
export interface CastRequest {
  spellId: number;
  heroId?: number;
  heroIds?: number[];
  dest?: RoomPosition;
  dests?: RoomPosition[];
  otherRoomId?: string;
  innerSpellId?: number;
}

export interface RoomRelocation {
  roomId: string;
  from: RoomPosition;
  to: RoomPosition;
}

export function expandSpells(slots: SpellSlot[] | undefined): SpellDef[] {
  if (!slots?.length) return [];
  const out: SpellDef[] = [];
  for (const [i, slot] of slots.entries()) {
    if (isChoixDef(slot)) {
      throw new SpellCastError(`Spell slot ${i} is unresolved choix — not a Phase 4 input.`);
    }
    if (isSpellRepeat(slot)) {
      if (typeof slot.count !== "number" || !Number.isInteger(slot.count) || slot.count < 0) {
        throw new SpellCastError(`Spell repeat ${i} has unresolved count "${slot.count}".`);
      }
      for (let n = 0; n < slot.count; n++) out.push(slot.spell);
      continue;
    }
    out.push(slot);
  }
  return out;
}

export function initialSpells(slots: SpellSlot[] | undefined): SpellRuntime[] {
  return expandSpells(slots).map((def, id) => ({ id, def, consumed: false }));
}

export function unusedSpells(spells: readonly SpellRuntime[]): SpellRuntime[] {
  return spells.filter((s) => !s.consumed);
}

export function requireUnused(spells: readonly SpellRuntime[], spellId: number): SpellRuntime {
  const spell = spells[spellId];
  if (!spell) {
    throw new SpellCastError(`FR-32: no spell with id ${spellId}.`);
  }
  if (spell.consumed) {
    throw new SpellCastError(`FR-32: spell ${spellId} (${spell.def.type}) is already consumed.`);
  }
  return spell;
}

export function consumeSpell(spell: SpellRuntime): void {
  spell.consumed = true;
}

export function numericSpellArg(value: number | string, label: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) {
    throw new SpellCastError(`${label} is non-numeric "${value}".`);
  }
  return amount;
}

/** FR-35: n-th-most-recent visit (n = 1 is current room), or undefined → waiting room. */
export function teleportDestination(visits: readonly RoomVisit[], n: number): RoomVisit | undefined {
  return lookupVisit(visits, n);
}

export function cloneLayout(layout: DungeonLayout): DungeonLayout {
  return {
    mainAId: layout.mainAId,
    rooms: layout.rooms.map((room) => ({
      ...room,
      position: { ...room.position },
    })),
  };
}

export function occupiedCells(layout: DungeonLayout): Set<string> {
  return new Set(layout.rooms.map((r) => `${r.position.x},${r.position.y}`));
}

export function isEmptyCell(layout: DungeonLayout, dest: RoomPosition): boolean {
  return Number.isInteger(dest.x) && Number.isInteger(dest.y) && !roomAt(layout, dest.x, dest.y);
}

/** FR-38: every cardinal neighbor pair still has matching wall/open edges. */
export function fr6BordersHold(level: LevelDef, layout: DungeonLayout): boolean {
  return !validateLayout(level, layout).issues.some((issue) => issue.code === "edge_mismatch");
}

export function distinctRoomsInOrder(roomIds: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of roomIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function inRoomWorld(position: RoomPosition, cell: CellPos): boolean {
  const ox = position.x * ROOM_SIZE;
  const oy = position.y * ROOM_SIZE;
  return cell.x >= ox && cell.x < ox + ROOM_SIZE && cell.y >= oy && cell.y < oy + ROOM_SIZE;
}

function deltaCells(from: RoomPosition, to: RoomPosition): CellPos {
  return {
    x: (to.x - from.x) * ROOM_SIZE,
    y: (to.y - from.y) * ROOM_SIZE,
  };
}

export function applyRelocations(
  layout: DungeonLayout,
  relocations: readonly RoomRelocation[],
  occupants: Array<{ roomId: string | null; cell: CellPos | null }>,
  visitsByHero: Array<{ visits: RoomVisit[] }>,
  poisonVisits: Set<string>,
): void {
  const byId = new Map(relocations.map((r) => [r.roomId, r]));
  const nextPoison = new Set<string>();
  for (const key of poisonVisits) {
    const [xs, ys] = key.split(",");
    const cell = { x: Number(xs), y: Number(ys) };
    const hit = relocations.find((r) => inRoomWorld(r.from, cell));
    if (hit) {
      const d = deltaCells(hit.from, hit.to);
      nextPoison.add(cellKey({ x: cell.x + d.x, y: cell.y + d.y }));
    } else {
      nextPoison.add(key);
    }
  }
  poisonVisits.clear();
  for (const key of nextPoison) poisonVisits.add(key);

  for (const occupant of occupants) {
    if (!occupant.roomId || !occupant.cell) continue;
    const hit = byId.get(occupant.roomId);
    if (!hit) continue;
    const d = deltaCells(hit.from, hit.to);
    occupant.cell = { x: occupant.cell.x + d.x, y: occupant.cell.y + d.y };
  }

  for (const hero of visitsByHero) {
    for (const visit of hero.visits) {
      const hit = byId.get(visit.roomId);
      if (!hit) continue;
      const d = deltaCells(hit.from, hit.to);
      visit.firstCell = { x: visit.firstCell.x + d.x, y: visit.firstCell.y + d.y };
    }
  }

  for (const room of layout.rooms) {
    const hit = byId.get(room.id);
    if (hit) room.position = { ...hit.to };
  }
}

export function plannedMove(
  layout: DungeonLayout,
  roomId: string,
  dest: RoomPosition,
): RoomRelocation {
  const room = layout.rooms.find((r) => r.id === roomId);
  if (!room) {
    throw new SpellCastError(`FR-36: room "${roomId}" is not on the board.`);
  }
  if (room.position.x === dest.x && room.position.y === dest.y) {
    throw new SpellCastError(`FR-36: room "${roomId}" is already at (${dest.x}, ${dest.y}).`);
  }
  if (!isEmptyCell(layout, dest)) {
    throw new SpellCastError(`FR-36: (${dest.x}, ${dest.y}) is not an empty grid cell.`);
  }
  return { roomId, from: { ...room.position }, to: { ...dest } };
}

export function plannedSwap(layout: DungeonLayout, roomIds: readonly string[]): RoomRelocation[] {
  if (roomIds.length < 2) {
    throw new SpellCastError("FR-37: a swap needs at least two distinct rooms.");
  }
  const rooms: PlacedRoom[] = [];
  const seen = new Set<string>();
  for (const id of roomIds) {
    if (seen.has(id)) {
      throw new SpellCastError(`FR-37: room "${id}" appears twice in the swap cycle.`);
    }
    seen.add(id);
    const room = layout.rooms.find((r) => r.id === id);
    if (!room) {
      throw new SpellCastError(`FR-37: room "${id}" is not on the board.`);
    }
    rooms.push(room);
  }
  return rooms.map((room, i) => {
    const next = rooms[(i + 1) % rooms.length];
    if (!next) throw new SpellCastError("FR-37: cyclic swap is missing a room.");
    return { roomId: room.id, from: { ...room.position }, to: { ...next.position } };
  });
}

export function previewRelocations(
  layout: DungeonLayout,
  relocations: readonly RoomRelocation[],
): DungeonLayout {
  const preview = cloneLayout(layout);
  const byId = new Map(relocations.map((r) => [r.roomId, r]));
  for (const room of preview.rooms) {
    const hit = byId.get(room.id);
    if (hit) room.position = { ...hit.to };
  }
  return preview;
}

export function assertFr6AfterMove(level: LevelDef, layout: DungeonLayout, relocations: readonly RoomRelocation[]): void {
  const preview = previewRelocations(layout, relocations);
  if (!fr6BordersHold(level, preview)) {
    throw new SpellCastError("FR-38: Move/Swap would break FR-6 border matching.");
  }
}

export function selectionInnerAllowed(type: SpellType): boolean {
  return (SELECTION_INNER_TYPES as readonly string[]).includes(type);
}
