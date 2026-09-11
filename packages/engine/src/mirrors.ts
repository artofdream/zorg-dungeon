// Implements FR-9: mirror-world levels share one constructed room graph;
// the Nth declaration-order room is swapped 1:1 for each world's own list.
// Implements FR-45: worlds resolve normal → M′ → M″ … and each retires
// once idle (nothing changes) or once its Z is reached.

import type { LevelDef } from "./level.js";
import { flattenRooms, isChoixDef } from "./level.js";
import {
  defaultMainAId,
  enumerateSuppliedRooms,
  findRoom,
  type DungeonLayout,
  type PlacedRoom,
} from "./placement.js";
import { cloneLayout } from "./spells.js";
import {
  simulate,
  type SimulationState,
  type CastRequest,
} from "./simulation.js";

export class MirrorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MirrorError";
  }
}

export type WorldRetirement = "idle" | "z_reached" | "cleared";

export interface DeclaredWorld {
  /** "normal", then "M'", "M''", … in declaration order (FR-45). */
  id: string;
  level: LevelDef;
}

export interface WorldRecord {
  id: string;
  level: LevelDef;
  layout: DungeonLayout;
  state: SimulationState;
  /** FR-45: the world is inactive after this resolve. */
  retired: boolean;
  retirement: WorldRetirement;
}

/** Prime labels M′, M″, … matching the spec's (M′), (M″) declaration order. */
export function mirrorWorldId(index: number): string {
  return `M${"'".repeat(index + 1)}`;
}

/**
 * FR-45: declared resolve order. The parent level is the normal world;
 * `mirrorWorlds` are M′, M″, … Nested mirrors on a child are ignored
 * (the spec lists them on the level, not recursively).
 */
export function declaredWorlds(level: LevelDef): DeclaredWorld[] {
  const mirrors = level.mirrorWorlds ?? [];
  return [
    { id: "normal", level: asWorldLevel(level) },
    ...mirrors.map((mirror, i) => ({
      id: mirrorWorldId(i),
      level: asWorldLevel(mirror),
    })),
  ];
}

/** Drop nested `mirrorWorlds` so a world's own Π / Γ / Φ stand alone. */
export function asWorldLevel(level: LevelDef): LevelDef {
  if (!level.mirrorWorlds?.length) return level;
  const { mirrorWorlds: _ignored, ...rest } = level;
  return rest;
}

/** FR-9: flattened declaration-order length, or undefined if choix is unresolved. */
export function declarationRoomCount(level: LevelDef): number | undefined {
  if (level.rooms.some((m) => isChoixDef(m.room))) return undefined;
  return flattenRooms(level.rooms).length;
}

/**
 * FR-9: one shared room graph. Keep the constructed positions / orientations /
 * authored tiles; remint ids and defs from the mirror's Nth room.
 */
export function substituteMirrorLayout(
  baseLevel: LevelDef,
  baseLayout: DungeonLayout,
  mirrorLevel: LevelDef,
): DungeonLayout {
  const baseSlots = enumerateSuppliedRooms(baseLevel);
  const mirrorSlots = enumerateSuppliedRooms(mirrorLevel);
  if (baseSlots.length !== mirrorSlots.length) {
    throw new MirrorError(
      `FR-9: mirror room list length ${mirrorSlots.length} must match base ${baseSlots.length} (1:1 by declaration order).`,
    );
  }

  const rooms: PlacedRoom[] = baseSlots.map((baseSlot, i) => {
    const placed = findRoom(baseLayout, baseSlot.id);
    if (!placed) {
      throw new MirrorError(`FR-9: base layout is missing declaration slot "${baseSlot.id}".`);
    }
    const next = mirrorSlots[i];
    if (!next) {
      throw new MirrorError(`FR-9: missing mirror slot ${i}.`);
    }
    const room: PlacedRoom = {
      id: next.id,
      def: next.def,
      position: { ...placed.position },
      orientation: placed.orientation,
    };
    if (placed.tile) room.tile = placed.tile;
    return room;
  });

  const baseMain = defaultMainAId(baseLayout);
  const baseIndex = baseSlots.findIndex((s) => s.id === baseMain);
  const mapped = baseIndex >= 0 ? mirrorSlots[baseIndex] : undefined;
  const mainAId = mapped?.def.type === "A" ? mapped.id : undefined;
  return { rooms, mainAId };
}

export function layoutForWorld(
  baseLevel: LevelDef,
  baseLayout: DungeonLayout,
  world: DeclaredWorld,
): DungeonLayout {
  if (world.id === "normal") return cloneLayout(baseLayout);
  return substituteMirrorLayout(baseLevel, baseLayout, world.level);
}

export function retirementOf(state: SimulationState): WorldRetirement {
  if (state.outcome === "loss" || state.events.some((e) => e.type === "loss")) {
    return "z_reached";
  }
  if (state.outcome === "win" || state.heroes.every((h) => h.dead)) {
    return "cleared";
  }
  return "idle";
}

/**
 * FR-45: resolve worlds in declared order. Each world runs to a terminal
 * outcome (win / loss / stalemate) with its own heroes and spells, then
 * retires before the next world starts. This is sequential resolve, not
 * FR-43 cross-world win/loss.
 */
export function resolveWorlds(
  level: LevelDef,
  baseLayout: DungeonLayout,
  options?: {
    maxSteps?: number;
    castScripts?: Readonly<Record<string, ReadonlyArray<{ afterSteps: number; cast: CastRequest }>>>;
  },
): WorldRecord[] {
  const records: WorldRecord[] = [];
  for (const world of declaredWorlds(level)) {
    const layout = layoutForWorld(level, baseLayout, world);
    const state = simulate(world.level, layout, {
      maxSteps: options?.maxSteps,
      castScript: options?.castScripts?.[world.id],
    });
    records.push({
      id: world.id,
      level: world.level,
      layout,
      state,
      retired: true,
      retirement: retirementOf(state),
    });
  }
  return records;
}
