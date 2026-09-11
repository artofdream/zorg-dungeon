// Phase 3 extermination: rooms A / Z / D / E / P / O / T (FR-11–FR-17) and
// Warrior + Elf scheduling (FR-20, FR-21, FR-26–FR-31). Spells, Mechanic /
// Gunner / Princess, mirrors, and FR-43 extra constraints are out of scope.

import { chooseElfStep } from "./elf.js";
import { elementalTick, heroImmunities } from "./elements.js";
import {
  dropGold,
  initialRoomGold,
  payToll,
  pickupGold,
  type GoldUnit,
  type TollRefund,
} from "./gold.js";
import {
  flattenRooms,
  isChoixDef,
  type HeroDef,
  type LevelDef,
  type Orientation,
  type RoomDef,
} from "./level.js";
import {
  evalPortalIndex,
  lookupVisit,
  portalStillActive,
  type RoomVisit,
} from "./portals.js";
import {
  canStartExtermination,
  defaultMainAId,
  type DungeonLayout,
} from "./placement.js";
import {
  buildWalkGrid,
  cellKey,
  chooseWarriorStep,
  distanceToZ,
  dungeonOrientation,
  localToWorld,
  resolveStep,
  roomCenterLocal,
  roomIdAt,
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
  /** FR-16 / FR-17: FIFO purse (oldest coin first). */
  gold: GoldUnit[];
  /** FR-15: room visits in chronological order (oldest first). */
  visits: RoomVisit[];
  /** FR-15: per-portal-room entry counts (1-based next index lives in apply). */
  portalEntries: Map<string, number>;
}

export type SimEvent =
  | { type: "spawn"; heroId: number; cell: CellPos; roomId: string }
  | { type: "move"; heroId: number; from: CellPos; to: CellPos; dir: Cardinal }
  | { type: "enter"; heroId: number; roomId: string; roomType: RoomDef["type"] }
  | { type: "damage"; heroId: number; amount: number; hp: number }
  | { type: "pickup"; heroId: number; roomId: string; amount: number; gold: number }
  | { type: "toll"; heroId: number; amount: number; gold: number; refunds: TollRefund[] }
  | { type: "gold_drop"; heroId: number; roomId: string; amount: number }
  | { type: "teleport"; heroId: number; fromRoomId: string; toRoomId: string; to: CellPos }
  | { type: "wait_room"; heroId: number }
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
  /** FR-14: poison cells already visited by a non-immune hero. */
  poisonVisits: Set<string>;
  /** FR-16 / FR-17: remaining gold piles (authored O plus death/refund). */
  roomGold: Map<string, number>;
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

function resolvedHeroes(level: LevelDef): HeroDef[] {
  const heroes: HeroDef[] = [];
  for (const [i, slot] of level.heroes.entries()) {
    if (isChoixDef(slot)) {
      throw new SimulationError(`Hero slot ${i} is unresolved choix — not a Phase 3 input.`);
    }
    if (slot.type !== "Warrior" && slot.type !== "Elf") {
      throw new SimulationError(
        `Phase 3 simulates Warrior and Elf (FR-20, FR-21); hero ${i} is ${slot.type}.`,
      );
    }
    if (typeof slot.hp !== "number") {
      throw new SimulationError(`${slot.type} ${i} has unresolved HP "${slot.hp}".`);
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
  const defs = resolvedHeroes(level);
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
      gold: [],
      visits: [],
      portalEntries: new Map(),
    })),
    mainAId,
    orientation: dungeonOrientation(layout),
    outcome: "in_progress",
    events: [],
    stepCount: 0,
    poisonVisits: new Set(),
    roomGold: initialRoomGold(layout.rooms),
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

function gridOf(state: SimulationState): WalkGrid {
  return buildWalkGrid(state.layout);
}

function roomDef(state: SimulationState, roomId: string): RoomDef {
  const room = state.layout.rooms.find((r) => r.id === roomId);
  if (!room) throw new SimulationError(`Missing room "${roomId}"`);
  return room.def;
}

function applyDamage(hero: HeroRuntime, amount: number, events: SimEvent[]): void {
  hero.hp -= amount;
  events.push({ type: "damage", heroId: hero.id, amount, hp: hero.hp });
}

function enterRoom(
  state: SimulationState,
  hero: HeroRuntime,
  roomId: string,
  firstCell: CellPos,
  events: SimEvent[],
): boolean {
  const prior = hero.visits.slice();
  hero.visits.push({ roomId, firstCell: { ...firstCell } });
  hero.roomId = roomId;
  return applyEntry(state, hero, roomId, events, prior);
}

function checkDeath(state: SimulationState, hero: HeroRuntime, events: SimEvent[]): void {
  // FR-28: death at ≤0 HP is instant.
  if (hero.hp <= 0 && !hero.dead) {
    hero.dead = true;
    hero.stuck = false;
    if (hero.roomId && hero.gold.length > 0) {
      const amount = dropGold(state.roomGold, hero.gold, hero.roomId);
      events.push({ type: "gold_drop", heroId: hero.id, roomId: hero.roomId, amount });
    }
    events.push({ type: "death", heroId: hero.id });
    if (state.heroes.every((h) => h.dead)) {
      state.outcome = "win";
      events.push({ type: "win" });
    }
  }
}

/**
 * FR-11–FR-17: apply the entry effect of the room the hero just stepped
 * into (including spawn into A). Gold pickup pre-empts other effects
 * (FR-16). `priorVisits` is the history used by a portal lookup (FR-15).
 */
function applyEntry(
  state: SimulationState,
  hero: HeroRuntime,
  roomId: string,
  events: SimEvent[],
  priorVisits: readonly RoomVisit[],
  teleportDepth = 0,
): boolean {
  const def = roomDef(state, roomId);
  events.push({ type: "enter", heroId: hero.id, roomId, roomType: def.type });

  // FR-16: pickup takes priority over any other move consequence.
  const taken = pickupGold(state.roomGold, hero.gold, roomId);
  if (taken > 0) {
    events.push({ type: "pickup", heroId: hero.id, roomId, amount: taken, gold: hero.gold.length });
  }

  if (def.type === "A") {
    // FR-11: any A a hero visits becomes the new main spawn.
    state.mainAId = roomId;
  }

  if (def.type === "Z") {
    // FR-12: entering Z is an immediate loss.
    state.outcome = "loss";
    events.push({ type: "loss", heroId: hero.id });
    return false;
  }

  if (def.type === "D") {
    const amount = typeof def.damage === "number" ? def.damage : Number(def.damage);
    if (Number.isNaN(amount)) {
      throw new SimulationError(`D room "${roomId}" has non-numeric damage "${def.damage}".`);
    }
    applyDamage(hero, amount, events);
  }

  checkDeath(state, hero, events);
  if (state.outcome !== "in_progress" || hero.dead) return false;

  if (def.type === "P") {
    return applyPortal(state, hero, roomId, def, events, priorVisits, teleportDepth);
  }
  return false;
}

function numericArg(value: number | string, label: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) {
    throw new SimulationError(`${label} is non-numeric "${value}".`);
  }
  return amount;
}

/** FR-15: teleport on the i-th entry while i ≤ n; else P is a normal room. */
function applyPortal(
  state: SimulationState,
  hero: HeroRuntime,
  roomId: string,
  def: Extract<RoomDef, { type: "P" }>,
  events: SimEvent[],
  priorVisits: readonly RoomVisit[],
  teleportDepth: number,
): boolean {
  const n = numericArg(def.entries, `P room "${roomId}" entries`);
  const i = (hero.portalEntries.get(roomId) ?? 0) + 1;
  hero.portalEntries.set(roomId, i);
  if (!portalStillActive(i, n)) return false;

  const k = evalPortalIndex(def.formula, i);
  const dest = lookupVisit(priorVisits, k);
  if (!dest) {
    hero.spawned = false;
    hero.stuck = false;
    hero.cell = null;
    hero.roomId = null;
    events.push({ type: "wait_room", heroId: hero.id });
    return true;
  }

  hero.cell = { ...dest.firstCell };
  events.push({
    type: "teleport",
    heroId: hero.id,
    fromRoomId: roomId,
    toRoomId: dest.roomId,
    to: hero.cell,
  });

  if (teleportDepth >= 8) {
    throw new SimulationError("FR-15: portal teleport chain exceeded 8 hops.");
  }

  // Nested applyEntry on another still-active P already applied landing
  // effects on the final cell. Do not tick fire / poison / toll twice.
  let nestedTeleport = false;
  if (dest.roomId !== roomId) {
    const nextPrior = hero.visits.slice();
    hero.visits.push({ roomId: dest.roomId, firstCell: { ...dest.firstCell } });
    hero.roomId = dest.roomId;
    nestedTeleport = applyEntry(state, hero, dest.roomId, events, nextPrior, teleportDepth + 1);
  }

  if (
    !nestedTeleport &&
    state.outcome === "in_progress" &&
    hero.spawned &&
    !hero.dead &&
    hero.cell
  ) {
    const grid = gridOf(state);
    applyElementalCell(state, hero, hero.cell, grid, events);
    if (state.outcome === "in_progress" && !hero.dead) {
      applyTollCell(state, hero, hero.cell, grid, events, true);
    }
  }
  return true;
}

/** FR-14: apply a green cell's element after the hero enters it. */
function applyElementalCell(
  state: SimulationState,
  hero: HeroRuntime,
  cell: CellPos,
  grid: WalkGrid,
  events: SimEvent[],
): void {
  const walk = grid.cells.get(cellKey(cell));
  const element = walk?.element;
  if (!element) return;

  const immunities = heroImmunities(hero.def);
  const tick = elementalTick(element, immunities, state.poisonVisits.has(cellKey(cell)));
  if (tick.ignored) return;

  if (tick.recordPoisonVisit) {
    state.poisonVisits.add(cellKey(cell));
  }
  if (tick.hpDelta !== 0) {
    applyDamage(hero, -tick.hpDelta, events);
  }
  if (tick.die) {
    hero.hp = 0;
    checkDeath(state, hero, events);
    return;
  }
  checkDeath(state, hero, events);
}

/** FR-17: light cells charge FIFO gold; forced unpaid landing is death. */
function applyTollCell(
  state: SimulationState,
  hero: HeroRuntime,
  cell: CellPos,
  grid: WalkGrid,
  events: SimEvent[],
  forced: boolean,
): void {
  const walk = grid.cells.get(cellKey(cell));
  const cost = walk?.toll;
  if (cost === undefined || cost <= 0) return;

  const paid = payToll(state.roomGold, hero.gold, cost);
  if (paid) {
    events.push({
      type: "toll",
      heroId: hero.id,
      amount: paid.paid,
      gold: hero.gold.length,
      refunds: paid.refunds,
    });
    return;
  }

  if (forced) {
    hero.hp = 0;
    checkDeath(state, hero, events);
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

function chooseStep(
  state: SimulationState,
  hero: HeroRuntime,
  grid: WalkGrid,
): Cardinal | undefined {
  if (!hero.cell || !hero.roomId) return undefined;
  const immunities = heroImmunities(hero.def);
  const economy = { gold: hero.gold.length, piles: state.roomGold };
  if (hero.def.type === "Elf") {
    return chooseElfStep({
      layout: state.layout,
      grid,
      from: hero.cell,
      hp: hero.hp,
      roomId: hero.roomId,
      poisonVisits: state.poisonVisits,
      immunities,
      orientation: state.orientation,
      economy,
    });
  }
  const dist = distanceToZ(state.layout, grid, immunities, hero.gold.length);
  return chooseWarriorStep(
    grid,
    dist,
    hero.cell,
    state.orientation,
    immunities,
    state.layout,
    economy,
    hero.roomId,
  );
}

/** Advance one hero action: spawn, one chosen direction (ice may slide), or wait. */
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

  const grid = gridOf(state);
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
    enterRoom(state, hero, spawnRoom.id, cell, events);
    applyElementalCell(state, hero, cell, grid, events);
    applyTollCell(state, hero, cell, grid, events, false);
    state.events.push(...events);
    return { state, events };
  }

  if (!hero.cell) {
    throw new SimulationError(`Hero ${hero.id} is spawned without a cell.`);
  }

  // FR-20 / FR-21 / FR-30 / FR-31. Planning ignores death (FR-28) and other
  // heroes (FR-27, FR-29).
  const dir = chooseStep(state, hero, grid);
  if (!dir) {
    hero.stuck = true;
    events.push({ type: "wait", heroId: hero.id });
    maybeSettle(state, events);
    state.events.push(...events);
    return { state, events };
  }

  const immunities = heroImmunities(hero.def);
  const path = resolveStep(
    grid,
    hero.cell,
    dir,
    immunities,
    state.layout,
    hero.gold.length,
    state.roomGold,
  );
  if (!path?.length) {
    hero.stuck = true;
    events.push({ type: "wait", heroId: hero.id });
    maybeSettle(state, events);
    state.events.push(...events);
    return { state, events };
  }

  hero.stuck = false;
  for (const [index, to] of path.entries()) {
    const from = hero.cell;
    if (!from) break;
    hero.cell = to;
    events.push({ type: "move", heroId: hero.id, from, to, dir });

    const nextRoomId = roomIdAt(grid, to);
    if (!nextRoomId) {
      throw new SimulationError(`Hero stepped into the void at (${to.x}, ${to.y}).`);
    }
    let teleported = false;
    if (nextRoomId !== hero.roomId) {
      teleported = enterRoom(state, hero, nextRoomId, to, events);
    }
    if (teleported || state.outcome !== "in_progress" || hero.dead || !hero.spawned) break;
    applyElementalCell(state, hero, to, grid, events);
    if (state.outcome !== "in_progress" || hero.dead || !hero.spawned) break;
    applyTollCell(state, hero, to, grid, events, index > 0);
    if (state.outcome !== "in_progress" || hero.dead || !hero.spawned) break;
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

export function phase2DemoLevel(): LevelDef {
  return {
    id: "phase-2-demo",
    name: "Phase 2 Elements + Elf",
    rooms: [
      { count: 1, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 1, room: { type: "E", element: "fire" } },
    ],
    heroes: [{ type: "Elf", hp: 3, immunities: ["fire"] }],
  };
}

export function phase3DemoLevel(): LevelDef {
  return {
    id: "phase-3-demo",
    name: "Phase 3 Portals + Gold + Tolls",
    rooms: [
      { count: 1, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 1, room: { type: "O", gold: 1 } },
      { count: 1, room: { type: "T", cost: 1, element: "fire" } },
    ],
    heroes: [{ type: "Warrior", hp: 5 }],
  };
}
