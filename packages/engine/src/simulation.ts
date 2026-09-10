// Phase 1 extermination: rooms A / Z / D (FR-11–FR-13) and Warrior-only
// scheduling (FR-20, FR-26–FR-31). Spells, Elf/Mechanic/Gunner/Princess,
// elements, portals, gold, mirrors, and FR-43 extra constraints are out of scope.

import {
  flattenRooms,
  isChoixDef,
  type HeroDef,
  type LevelDef,
  type Orientation,
  type RoomDef,
} from "./level.js";
import {
  canStartExtermination,
  defaultMainAId,
  type DungeonLayout,
} from "./placement.js";
import {
  buildWalkGrid,
  chooseWarriorStep,
  distanceToZ,
  dungeonOrientation,
  localToWorld,
  roomCenterLocal,
  roomIdAt,
  stepCell,
  type CellPos,
  type WalkGrid,
} from "./pathing.js";
import type { Cardinal } from "./tiles.js";

export type RunOutcome = "in_progress" | "win" | "loss" | "stalemate";

export interface HeroRuntime {
  id: number;
  def: HeroDef;
  hp: number;
  spawned: boolean;
  dead: boolean;
  stuck: boolean;
  cell: CellPos | null;
  roomId: string | null;
}

export type SimEvent =
  | { type: "spawn"; heroId: number; cell: CellPos; roomId: string }
  | { type: "move"; heroId: number; from: CellPos; to: CellPos; dir: Cardinal }
  | { type: "enter"; heroId: number; roomId: string; roomType: RoomDef["type"] }
  | { type: "damage"; heroId: number; amount: number; hp: number }
  | { type: "death"; heroId: number }
  | { type: "wait"; heroId: number }
  | { type: "loss"; heroId: number }
  | { type: "win" }
  | { type: "stalemate" };

export interface SimulationState {
  level: LevelDef;
  layout: DungeonLayout;
  heroes: HeroRuntime[];
  mainAId: string;
  orientation: Orientation;
  outcome: RunOutcome;
  events: SimEvent[];
  stepCount: number;
}

export interface StepResult {
  state: SimulationState;
  events: SimEvent[];
}

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationError";
  }
}

function resolvedWarriors(level: LevelDef): HeroDef[] {
  const heroes: HeroDef[] = [];
  for (const [i, slot] of level.heroes.entries()) {
    if (isChoixDef(slot)) {
      throw new SimulationError(`Hero slot ${i} is unresolved choix — not a Phase 1 input.`);
    }
    if (slot.type !== "Warrior") {
      throw new SimulationError(
        `Phase 1 simulates Warrior only (FR-20); hero ${i} is ${slot.type}.`,
      );
    }
    if (typeof slot.hp !== "number") {
      throw new SimulationError(`Warrior ${i} has unresolved HP "${slot.hp}".`);
    }
    heroes.push(slot);
  }
  if (heroes.length === 0) {
    throw new SimulationError("Level has no heroes to simulate.");
  }
  return heroes;
}

function assertResolvedRooms(level: LevelDef): void {
  if (level.rooms.some((m) => isChoixDef(m.room))) {
    throw new SimulationError("Level has unresolved choix rooms.");
  }
  flattenRooms(level.rooms);
}

/**
 * Create a run in the waiting room. Does not spawn yet — spawn is the first
 * action of the lead hero (FR-26).
 */
export function createRun(level: LevelDef, layout: DungeonLayout): SimulationState {
  assertResolvedRooms(level);
  if (!canStartExtermination(level, layout)) {
    throw new SimulationError("FR-8: cannot start extermination until FR-5–FR-7 hold.");
  }
  const defs = resolvedWarriors(level);
  const mainAId = defaultMainAId(layout);
  if (!mainAId) {
    throw new SimulationError("FR-11: no main A room designated or placed.");
  }

  return {
    level,
    layout,
    heroes: defs.map((def, id) => ({
      id,
      def,
      hp: def.hp as number,
      spawned: false,
      dead: false,
      stuck: false,
      cell: null,
      roomId: null,
    })),
    mainAId,
    orientation: dungeonOrientation(layout),
    outcome: "in_progress",
    events: [],
    stepCount: 0,
  };
}

/** FR-26: first living hero who is not stuck, else first living stuck hero that still needs a wait tick? */
export function selectActiveHero(heroes: HeroRuntime[]): HeroRuntime | undefined {
  for (const hero of heroes) {
    if (hero.dead) continue;
    // Earlier living non-stuck hero (including not-yet-spawned) blocks everyone after.
    if (!hero.stuck) return hero;
    // Stuck: later heroes may act. Keep scanning.
  }
  return undefined;
}

function gridOf(state: SimulationState): { grid: WalkGrid; dist: Map<string, number> } {
  const grid = buildWalkGrid(state.layout);
  const dist = distanceToZ(state.layout, grid);
  return { grid, dist };
}

function roomDef(state: SimulationState, roomId: string): RoomDef {
  const room = state.layout.rooms.find((r) => r.id === roomId);
  if (!room) throw new SimulationError(`Missing room "${roomId}"`);
  return room.def;
}

/**
 * FR-11 / FR-12 / FR-13: apply the Phase 1 entry effect of the room the hero
 * just stepped into (including spawn into A). Unsupported types are no-ops —
 * not an implementation of FR-14–FR-18.
 */
function applyEntry(state: SimulationState, hero: HeroRuntime, roomId: string, events: SimEvent[]): void {
  const def = roomDef(state, roomId);
  events.push({ type: "enter", heroId: hero.id, roomId, roomType: def.type });

  if (def.type === "A") {
    // FR-11: any A a hero visits becomes the new main spawn.
    state.mainAId = roomId;
  }

  if (def.type === "Z") {
    // FR-12: entering Z is an immediate loss.
    state.outcome = "loss";
    events.push({ type: "loss", heroId: hero.id });
    return;
  }

  if (def.type === "D") {
    const amount = typeof def.damage === "number" ? def.damage : Number(def.damage);
    if (Number.isNaN(amount)) {
      throw new SimulationError(`D room "${roomId}" has non-numeric damage "${def.damage}".`);
    }
    hero.hp -= amount;
    events.push({ type: "damage", heroId: hero.id, amount, hp: hero.hp });
  }

  // FR-28: death at ≤0 HP is instant.
  if (hero.hp <= 0) {
    hero.dead = true;
    hero.stuck = false;
    events.push({ type: "death", heroId: hero.id });
    if (state.heroes.every((h) => h.dead)) {
      state.outcome = "win";
      events.push({ type: "win" });
    }
  }
}

function maybeSettle(state: SimulationState, events: SimEvent[]): void {
  if (state.outcome !== "in_progress") return;
  if (state.heroes.every((h) => h.dead)) {
    state.outcome = "win";
    events.push({ type: "win" });
    return;
  }
  if (!selectActiveHero(state.heroes) && state.heroes.some((h) => !h.dead)) {
    state.outcome = "stalemate";
    events.push({ type: "stalemate" });
  }
}

/** Advance one hero action: spawn, one cell move, or wait. */
export function stepRun(state: SimulationState): StepResult {
  if (state.outcome !== "in_progress") {
    return { state, events: [] };
  }

  const events: SimEvent[] = [];
  const hero = selectActiveHero(state.heroes);
  if (!hero) {
    maybeSettle(state, events);
    state.events.push(...events);
    return { state, events };
  }

  const { grid, dist } = gridOf(state);
  state.stepCount += 1;

  if (!hero.spawned) {
    const spawnRoom = state.layout.rooms.find((r) => r.id === state.mainAId);
    if (!spawnRoom || spawnRoom.def.type !== "A") {
      throw new SimulationError(`FR-11: main A "${state.mainAId}" is missing.`);
    }
    const cell = localToWorld(spawnRoom, roomCenterLocal());
    hero.spawned = true;
    hero.stuck = false;
    hero.cell = cell;
    hero.roomId = spawnRoom.id;
    events.push({ type: "spawn", heroId: hero.id, cell, roomId: spawnRoom.id });
    applyEntry(state, hero, spawnRoom.id, events);
    state.events.push(...events);
    return { state, events };
  }

  if (!hero.cell) {
    throw new SimulationError(`Hero ${hero.id} is spawned without a cell.`);
  }

  // FR-20 / FR-30 / FR-31: Warrior steps or waits. Planning ignores death (FR-28)
  // and other heroes (FR-27, FR-29).
  const dir = chooseWarriorStep(grid, dist, hero.cell, state.orientation);
  if (!dir) {
    hero.stuck = true;
    events.push({ type: "wait", heroId: hero.id });
    maybeSettle(state, events);
    state.events.push(...events);
    return { state, events };
  }

  hero.stuck = false;
  const from = hero.cell;
  const to = stepCell(from, dir);
  const nextRoomId = roomIdAt(grid, to);
  if (!nextRoomId) {
    throw new SimulationError(`Warrior stepped into the void at (${to.x}, ${to.y}).`);
  }

  hero.cell = to;
  events.push({ type: "move", heroId: hero.id, from, to, dir });

  if (nextRoomId !== hero.roomId) {
    hero.roomId = nextRoomId;
    applyEntry(state, hero, nextRoomId, events);
  }

  state.events.push(...events);
  return { state, events };
}

export function simulate(
  level: LevelDef,
  layout: DungeonLayout,
  options?: { maxSteps?: number },
): SimulationState {
  const state = createRun(level, layout);
  const maxSteps = options?.maxSteps ?? 10_000;
  while (state.outcome === "in_progress" && state.stepCount < maxSteps) {
    const { events } = stepRun(state);
    if (events.length === 0) break;
  }
  if (state.outcome === "in_progress") {
    state.outcome = "stalemate";
    state.events.push({ type: "stalemate" });
  }
  return state;
}

export function phase1DemoLevel(): LevelDef {
  return {
    id: "phase-1-demo",
    name: "Phase 1 Maker + Warrior",
    rooms: [
      { count: 1, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 1, room: { type: "D", damage: 2 } },
    ],
    heroes: [{ type: "Warrior", hp: 2 }],
  };
}
