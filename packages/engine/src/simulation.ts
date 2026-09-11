// Phase 5 extermination: rooms A / Z / D / E / P / O / T (FR-11–FR-17),
// Warrior / Elf / Gunner / Mechanic / Princess (FR-20–FR-25, FR-26–FR-31),
// and the spellbook (FR-32–FR-42). Mirrors and FR-43 extra constraints
// stay out of scope. Gunner duration semantics stay deferred (S3 / NFR-8).

import type { HeroAction } from "./action.js";
import { chooseElfStep } from "./elf.js";
import { chooseGunnerStep, gunnerShots, type ShotCount } from "./gunner.js";
import { chooseMechanicStep } from "./mechanic.js";
import {
  collectShellClears,
  SHELL_DAMAGE,
  shellPath,
} from "./shell.js";
import { highestWeightRoomIds, reachableRoomIds } from "./weights.js";
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
  type SpellType,
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
  distanceToRooms,
  dungeonOrientation,
  localToWorld,
  resolveStep,
  roomCenterLocal,
  roomIdAt,
  stepCell,
  type CellPos,
  type WalkGrid,
} from "./pathing.js";
import {
  applyRelocations,
  assertFr6AfterMove,
  cloneLayout,
  consumeSpell,
  distinctRoomsInOrder,
  initialSpells,
  numericSpellArg,
  plannedMove,
  plannedSwap,
  requireUnused,
  selectionInnerAllowed,
  teleportDestination,
  SpellCastError,
  type CastRequest,
  type SpellRuntime,
} from "./spells.js";
import { deltaFor, type Cardinal } from "./tiles.js";

export type { CastRequest, SpellRuntime } from "./spells.js";
export { SpellCastError } from "./spells.js";

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
  /** FR-40: asleep until Wake or an HP change. */
  sleeping: boolean;
  /** FR-22: remaining shots; null if this hero is not a Gunner. */
  shotsLeft: ShotCount | null;
  /** FR-24: remaining shove budget per room instance. */
  shoveLeft: Map<string, number>;
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
  | { type: "cast"; spellId: number; spellType: SpellType; heroIds?: number[]; innerSpellId?: number }
  | { type: "sleep"; heroId: number }
  | { type: "wake"; heroId: number; cause: "spell" | "hp" }
  | { type: "banality"; heroId: number }
  | { type: "room_move"; roomId: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: "shove"; heroId: number; roomId: string; dir: Cardinal; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: "fire"; heroId: number; dir: Cardinal; shotsLeft: ShotCount }
  | {
      type: "shell";
      heroId: number;
      dir: Cardinal;
      cells: CellPos[];
      clearedCells: CellPos[];
      clearedRooms: string[];
      hitHeroIds: number[];
    }
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
  /** FR-32: Φ — one-time spells; consumed stays consumed. */
  spells: SpellRuntime[];
  /** FR-33: true while stepRun is resolving a single hero action. */
  midAction: boolean;
  /** FR-23: world cells whose element a Shell cleared. */
  clearedCells: Set<string>;
  /** FR-23: D rooms whose monster a Shell cleared. */
  clearedMonsters: Set<string>;
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
      throw new SimulationError(`Hero slot ${i} is unresolved choix — not a Phase 5 input.`);
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

  const runLayout = cloneLayout(layout);
  return {
    level,
    layout: runLayout,
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
      sleeping: false,
      shotsLeft: def.type === "Gunner" ? gunnerShots(def.shots) : null,
      shoveLeft: initialShoveBudget(def, runLayout),
    })),
    mainAId,
    orientation: dungeonOrientation(runLayout),
    outcome: "in_progress",
    events: [],
    stepCount: 0,
    poisonVisits: new Set(),
    roomGold: initialRoomGold(runLayout.rooms),
    spells: initialSpells(level.spells),
    midAction: false,
    clearedCells: new Set(),
    clearedMonsters: new Set(),
  };
}

function initialShoveBudget(def: HeroDef, layout: DungeonLayout): Map<string, number> {
  const budget = new Map<string, number>();
  if (def.type !== "Mechanic") return budget;
  for (const room of layout.rooms) {
    const raw = def.powerSteps[room.id] ?? def.powerSteps[room.def.type];
    if (raw === undefined) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isNaN(n) && n > 0) budget.set(room.id, n);
  }
  return budget;
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
  return buildWalkGrid(state.layout, state.clearedCells);
}

function roomDef(state: SimulationState, roomId: string): RoomDef {
  const room = state.layout.rooms.find((r) => r.id === roomId);
  if (!room) throw new SimulationError(`Missing room "${roomId}"`);
  return room.def;
}

function wakeFromHp(hero: HeroRuntime, events: SimEvent[]): void {
  if (!hero.sleeping) return;
  hero.sleeping = false;
  events.push({ type: "wake", heroId: hero.id, cause: "hp" });
}

function applyDamage(hero: HeroRuntime, amount: number, events: SimEvent[]): void {
  hero.hp -= amount;
  if (amount !== 0) wakeFromHp(hero, events);
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
    hero.sleeping = false;
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

  if (def.type === "D" && !state.clearedMonsters.has(roomId)) {
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

  if (dest.roomId !== roomId) {
    const nextPrior = hero.visits.slice();
    hero.visits.push({ roomId: dest.roomId, firstCell: { ...dest.firstCell } });
    hero.roomId = dest.roomId;
    applyEntry(state, hero, dest.roomId, events, nextPrior, teleportDepth + 1);
  }

  if (state.outcome === "in_progress" && hero.spawned && !hero.dead && hero.cell) {
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
    if (hero.hp !== 0) wakeFromHp(hero, events);
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
    if (hero.hp !== 0) wakeFromHp(hero, events);
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

function applyGunnerFire(
  state: SimulationState,
  hero: HeroRuntime,
  dir: Cardinal,
  grid: WalkGrid,
  events: SimEvent[],
): void {
  if (!hero.cell) return;
  hero.stuck = false;
  if (hero.shotsLeft !== "inf") {
    const left = typeof hero.shotsLeft === "number" ? hero.shotsLeft : 0;
    hero.shotsLeft = Math.max(0, left - 1);
  }
  events.push({ type: "fire", heroId: hero.id, dir, shotsLeft: hero.shotsLeft ?? 0 });

  const cells = shellPath(grid, stepCell(hero.cell, dir), dir);
  const clears = collectShellClears(
    state.layout,
    grid,
    cells,
    state.clearedCells,
    state.clearedMonsters,
  );
  for (const key of clears.clearedCellKeys) state.clearedCells.add(key);
  for (const id of clears.clearedRoomIds) state.clearedMonsters.add(id);

  const hitHeroIds: number[] = [];
  for (const pos of cells) {
    for (const other of state.heroes) {
      if (other.dead || !other.cell) continue;
      if (other.cell.x !== pos.x || other.cell.y !== pos.y) continue;
      applyDamage(other, SHELL_DAMAGE, events);
      checkDeath(state, other, events);
      hitHeroIds.push(other.id);
      if (state.outcome !== "in_progress") break;
    }
    if (state.outcome !== "in_progress") break;
  }

  events.push({
    type: "shell",
    heroId: hero.id,
    dir,
    cells,
    clearedCells: cells.filter((p) => clears.clearedCellKeys.includes(cellKey(p))),
    clearedRooms: clears.clearedRoomIds,
    hitHeroIds,
  });
}

function applyMechanicShove(
  state: SimulationState,
  hero: HeroRuntime,
  dir: Cardinal,
  events: SimEvent[],
): void {
  if (!hero.roomId) return;
  const room = state.layout.rooms.find((r) => r.id === hero.roomId);
  if (!room) return;
  const { dx, dy } = deltaFor(dir);
  const dest = { x: room.position.x + dx, y: room.position.y + dy };
  const relocation = plannedMove(state.layout, room.id, dest);
  applyRelocations(state.layout, [relocation], state.heroes, state.heroes, state.poisonVisits);
  const left = hero.shoveLeft.get(room.id) ?? 0;
  if (left > 0) hero.shoveLeft.set(room.id, left - 1);
  hero.stuck = false;
  events.push({
    type: "shove",
    heroId: hero.id,
    roomId: room.id,
    dir,
    from: relocation.from,
    to: relocation.to,
  });
}

function targetRoomIdsFor(
  state: SimulationState,
  hero: HeroRuntime,
  grid: WalkGrid,
): string[] {
  if (!hero.cell) return [];
  const immunities = heroImmunities(hero.def);
  // Mechanic shoves can open rooms that are not currently walkable (FR-24).
  const reachable =
    hero.def.type === "Mechanic"
      ? new Set(state.layout.rooms.map((room) => room.id))
      : reachableRoomIds(
          state.layout,
          grid,
          hero.cell,
          immunities,
          hero.gold.length,
          state.roomGold,
        );
  return highestWeightRoomIds(state.layout, hero, state.heroes, reachable);
}

function chooseStep(
  state: SimulationState,
  hero: HeroRuntime,
  grid: WalkGrid,
): HeroAction | undefined {
  if (!hero.cell || !hero.roomId) return undefined;
  const immunities = heroImmunities(hero.def);
  const economy = { gold: hero.gold.length, piles: state.roomGold };
  const targets = targetRoomIdsFor(state, hero, grid);
  if (targets.length === 0) return undefined;

  if (hero.def.type === "Mechanic") {
    return chooseMechanicStep({
      layout: state.layout,
      grid,
      from: hero.cell,
      roomId: hero.roomId,
      orientation: state.orientation,
      immunities,
      economy,
      targetRoomIds: targets,
      shoveLeft: hero.shoveLeft,
    });
  }
  if (hero.def.type === "Gunner") {
    return chooseGunnerStep({
      layout: state.layout,
      grid,
      from: hero.cell,
      hp: hero.hp,
      roomId: hero.roomId,
      poisonVisits: state.poisonVisits,
      immunities,
      orientation: state.orientation,
      economy,
      targetRoomIds: targets,
      shotsLeft: hero.shotsLeft ?? 0,
      clearedCells: state.clearedCells,
      clearedMonsters: state.clearedMonsters,
    });
  }
  if (hero.def.type === "Elf" || hero.def.type === "Princess") {
    const dir = chooseElfStep({
      layout: state.layout,
      grid,
      from: hero.cell,
      hp: hero.hp,
      roomId: hero.roomId,
      poisonVisits: state.poisonVisits,
      immunities,
      orientation: state.orientation,
      economy,
      targetRoomIds: targets,
      clearedMonsters: state.clearedMonsters,
    });
    return dir ? { type: "walk", dir } : undefined;
  }
  const dist = distanceToRooms(state.layout, grid, targets, immunities, hero.gold.length);
  const dir = chooseWarriorStep(
    grid,
    dist,
    hero.cell,
    state.orientation,
    immunities,
    state.layout,
    economy,
    hero.roomId,
    targets,
  );
  return dir ? { type: "walk", dir } : undefined;
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

  // FR-40: a sleeping hero cannot act. They stay the active hero (not stuck),
  // so later heroes remain blocked until Wake or an HP change.
  if (hero.sleeping) {
    return { state, events: [] };
  }

  const grid = gridOf(state);
  state.midAction = true;
  try {
    return finishHeroAction(state, hero, grid);
  } finally {
    state.midAction = false;
  }
}

function finishHeroAction(state: SimulationState, hero: HeroRuntime, grid: WalkGrid): StepResult {
  const events: SimEvent[] = [];
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

  // FR-20–FR-25 / FR-30 / FR-31. Planning ignores death (FR-28) and other
  // heroes (FR-27, FR-29) except Shell hits at resolution time.
  const action = chooseStep(state, hero, grid);
  if (!action) {
    hero.stuck = true;
    events.push({ type: "wait", heroId: hero.id });
    maybeSettle(state, events);
    state.events.push(...events);
    return { state, events };
  }

  if (action.type === "fire") {
    applyGunnerFire(state, hero, action.dir, grid, events);
    state.events.push(...events);
    return { state, events };
  }

  if (action.type === "shove") {
    applyMechanicShove(state, hero, action.dir, events);
    state.events.push(...events);
    return { state, events };
  }

  const dir = action.dir;
  const immunities = heroImmunities(hero.def);
  const path = resolveStep(
    grid,
    hero.cell,
    dir,
    immunities,
    state.layout,
    hero.gold.length,
    targetRoomIdsFor(state, hero, grid),
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
  options?: {
    maxSteps?: number;
    /** FR-32–FR-42: casts applied after the named completed action count. */
    castScript?: ReadonlyArray<{ afterSteps: number; cast: CastRequest }>;
  },
): SimulationState {
  const state = createRun(level, layout);
  const maxSteps = options?.maxSteps ?? 10_000;
  const script = options?.castScript ?? [];
  while (state.outcome === "in_progress" && state.stepCount < maxSteps) {
    const before = state.stepCount;
    const { events } = stepRun(state);
    const due = script.filter((row) => row.afterSteps === state.stepCount && state.stepCount > before);
    for (const row of due) {
      castSpell(state, row.cast);
    }
    if (due.length > 0) continue;
    if (events.length === 0) break;
  }
  if (state.outcome === "in_progress") {
    const active = selectActiveHero(state.heroes);
    if (active?.sleeping) {
      return state;
    }
    state.outcome = "stalemate";
    state.events.push({ type: "stalemate" });
  }
  return state;
}

/** FR-33: a cast is legal only between completed actions, with an active hero. */
export function canCastNow(state: SimulationState): boolean {
  return (
    state.outcome === "in_progress" &&
    !state.midAction &&
    state.stepCount > 0 &&
    Boolean(selectActiveHero(state.heroes))
  );
}

function assertCastWindow(state: SimulationState): void {
  if (state.outcome !== "in_progress") {
    throw new SpellCastError(`FR-33: cannot cast after the run is ${state.outcome}.`);
  }
  if (state.midAction) {
    throw new SpellCastError("FR-33: cannot cast mid-action.");
  }
  if (state.stepCount <= 0) {
    throw new SpellCastError("FR-33: cannot cast before a hero action has completed.");
  }
  if (!selectActiveHero(state.heroes)) {
    throw new SpellCastError("FR-33: casting a hero-targeted spell with no active hero is illegal.");
  }
}

function requireHero(state: SimulationState, heroId: number | undefined, label: string): HeroRuntime {
  if (heroId === undefined) {
    throw new SpellCastError(`${label} requires a target hero.`);
  }
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) {
    throw new SpellCastError(`${label}: no hero ${heroId}.`);
  }
  return hero;
}

function resolveTargets(
  state: SimulationState,
  heroIds: number[] | undefined,
  allowCorpses: boolean,
): HeroRuntime[] {
  if (!heroIds?.length) {
    throw new SpellCastError("FR-39: Selection requires at least one chosen hero.");
  }
  const seen = new Set<number>();
  const targets: HeroRuntime[] = [];
  for (const id of heroIds) {
    if (seen.has(id)) {
      throw new SpellCastError(`FR-39: hero ${id} is selected twice.`);
    }
    seen.add(id);
    const hero = requireHero(state, id, "FR-39");
    if (hero.dead && !allowCorpses) {
      throw new SpellCastError("FR-39: Selection(false) cannot target corpses.");
    }
    targets.push(hero);
  }
  return targets;
}

function applySpellTeleport(state: SimulationState, hero: HeroRuntime, n: number, events: SimEvent[]): void {
  const fromRoomId = hero.roomId ?? "";
  const dest = teleportDestination(hero.visits, n);
  if (!dest) {
    hero.spawned = false;
    hero.stuck = false;
    hero.cell = null;
    hero.roomId = null;
    events.push({ type: "wait_room", heroId: hero.id });
    return;
  }
  hero.spawned = true;
  hero.stuck = false;
  hero.cell = { ...dest.firstCell };
  hero.roomId = dest.roomId;
  if (roomDef(state, dest.roomId).type === "A") {
    state.mainAId = dest.roomId;
  }
  events.push({
    type: "teleport",
    heroId: hero.id,
    fromRoomId,
    toRoomId: dest.roomId,
    to: hero.cell,
  });
}

function emitRelocations(relocations: ReturnType<typeof plannedSwap>, events: SimEvent[]): void {
  for (const reloc of relocations) {
    events.push({
      type: "room_move",
      roomId: reloc.roomId,
      from: reloc.from,
      to: reloc.to,
    });
  }
}

function commitRelocations(state: SimulationState, relocations: ReturnType<typeof plannedSwap>, events: SimEvent[]): void {
  assertFr6AfterMove(state.level, state.layout, relocations);
  applyRelocations(state.layout, relocations, state.heroes, state.heroes, state.poisonVisits);
  emitRelocations(relocations, events);
}

function applyAttackTo(
  state: SimulationState,
  heroes: HeroRuntime[],
  damage: number,
  events: SimEvent[],
): void {
  for (const hero of heroes) {
    if (hero.dead) continue;
    applyDamage(hero, damage, events);
    checkDeath(state, hero, events);
    if (state.outcome !== "in_progress") return;
  }
}

function applyInnerSpell(
  state: SimulationState,
  inner: SpellRuntime,
  request: CastRequest,
  allowCorpses: boolean,
  events: SimEvent[],
): void {
  const targets = resolveTargets(state, request.heroIds, allowCorpses);
  switch (inner.def.type) {
    case "Attack": {
      const damage = numericSpellArg(inner.def.damage, "Attack damage");
      applyAttackTo(state, targets, damage, events);
      return;
    }
    case "Teleport": {
      const n = numericSpellArg(inner.def.steps, "Teleport n");
      for (const hero of targets) {
        applySpellTeleport(state, hero, n, events);
      }
      return;
    }
    case "Move": {
      const rooms = distinctRoomsInOrder(targets.map((h) => h.roomId));
      if (rooms.length === 0) {
        throw new SpellCastError("FR-36: Selection Move needs at least one hero in a room.");
      }
      if (!request.dests || request.dests.length !== rooms.length) {
        throw new SpellCastError("FR-36: Selection Move needs one empty cell per distinct room.");
      }
      const destKeys = new Set<string>();
      const relocations = rooms.map((roomId, i) => {
        const dest = request.dests?.[i];
        if (!dest) {
          throw new SpellCastError("FR-36: Selection Move is missing a destination.");
        }
        const key = `${dest.x},${dest.y}`;
        if (destKeys.has(key)) {
          throw new SpellCastError("FR-36: Selection Move destinations must be distinct.");
        }
        destKeys.add(key);
        return plannedMove(state.layout, roomId, dest);
      });
      commitRelocations(state, relocations, events);
      return;
    }
    case "Swap": {
      const rooms = distinctRoomsInOrder(targets.map((h) => h.roomId));
      if (!request.otherRoomId) {
        throw new SpellCastError("FR-37: Selection Swap needs one extra room.");
      }
      if (rooms.includes(request.otherRoomId)) {
        throw new SpellCastError("FR-37: the extra room must not already be in the cycle.");
      }
      commitRelocations(state, plannedSwap(state.layout, [...rooms, request.otherRoomId]), events);
      return;
    }
    default:
      throw new SpellCastError(`FR-39: ${inner.def.type} has no Selection variant.`);
  }
}

/**
 * FR-32–FR-42: resolve one unused spell. Consumes only on success.
 */
export function castSpell(state: SimulationState, request: CastRequest): StepResult {
  assertCastWindow(state);
  const spell = requireUnused(state.spells, request.spellId);
  const events: SimEvent[] = [];

  switch (spell.def.type) {
    case "Attack": {
      const damage = numericSpellArg(spell.def.damage, "Attack damage");
      const living = state.heroes.filter((h) => !h.dead);
      events.push({
        type: "cast",
        spellId: spell.id,
        spellType: "Attack",
        heroIds: living.map((h) => h.id),
      });
      applyAttackTo(state, living, damage, events);
      consumeSpell(spell);
      break;
    }
    case "Teleport": {
      const n = numericSpellArg(spell.def.steps, "Teleport n");
      const hero = selectActiveHero(state.heroes);
      if (!hero) {
        throw new SpellCastError("FR-33: casting a hero-targeted spell with no active hero is illegal.");
      }
      events.push({ type: "cast", spellId: spell.id, spellType: "Teleport", heroIds: [hero.id] });
      applySpellTeleport(state, hero, n, events);
      consumeSpell(spell);
      break;
    }
    case "Move": {
      const hero = selectActiveHero(state.heroes);
      if (!hero?.roomId) {
        throw new SpellCastError("FR-36: Move needs the active hero to occupy a room.");
      }
      if (!request.dest) {
        throw new SpellCastError("FR-36: Move needs an empty grid cell.");
      }
      const relocation = plannedMove(state.layout, hero.roomId, request.dest);
      events.push({ type: "cast", spellId: spell.id, spellType: "Move", heroIds: [hero.id] });
      commitRelocations(state, [relocation], events);
      consumeSpell(spell);
      break;
    }
    case "Swap": {
      const hero = selectActiveHero(state.heroes);
      if (!hero?.roomId) {
        throw new SpellCastError("FR-37: Swap needs the active hero to occupy a room.");
      }
      if (!request.otherRoomId) {
        throw new SpellCastError("FR-37: Swap needs one other room.");
      }
      if (request.otherRoomId === hero.roomId) {
        throw new SpellCastError("FR-37: cannot swap a room with itself.");
      }
      events.push({ type: "cast", spellId: spell.id, spellType: "Swap", heroIds: [hero.id] });
      commitRelocations(state, plannedSwap(state.layout, [hero.roomId, request.otherRoomId]), events);
      consumeSpell(spell);
      break;
    }
    case "Selection": {
      if (request.innerSpellId === undefined) {
        throw new SpellCastError("FR-39: Selection needs one other unused spell.");
      }
      const inner = requireUnused(state.spells, request.innerSpellId);
      if (inner.id === spell.id) {
        throw new SpellCastError("FR-39: Selection cannot apply itself.");
      }
      if (!selectionInnerAllowed(inner.def.type)) {
        throw new SpellCastError(`FR-39: ${inner.def.type} has no Selection variant.`);
      }
      const targets = resolveTargets(state, request.heroIds, spell.def.allowCorpses);
      events.push({
        type: "cast",
        spellId: spell.id,
        spellType: "Selection",
        heroIds: targets.map((h) => h.id),
        innerSpellId: inner.id,
      });
      applyInnerSpell(state, inner, request, spell.def.allowCorpses, events);
      consumeSpell(spell);
      consumeSpell(inner);
      break;
    }
    case "Sleep": {
      const hero = requireHero(state, request.heroId, "FR-40");
      if (hero.dead) {
        throw new SpellCastError("FR-40: Sleep targets a living hero.");
      }
      if (hero.sleeping) {
        throw new SpellCastError("FR-40: Sleep targets an awake hero.");
      }
      hero.sleeping = true;
      events.push({ type: "cast", spellId: spell.id, spellType: "Sleep", heroIds: [hero.id] });
      events.push({ type: "sleep", heroId: hero.id });
      consumeSpell(spell);
      break;
    }
    case "Wake": {
      const hero = requireHero(state, request.heroId, "FR-41");
      if (!hero.sleeping) {
        throw new SpellCastError("FR-41: Wake targets a sleeping hero.");
      }
      hero.sleeping = false;
      events.push({ type: "cast", spellId: spell.id, spellType: "Wake", heroIds: [hero.id] });
      events.push({ type: "wake", heroId: hero.id, cause: "spell" });
      consumeSpell(spell);
      break;
    }
    case "Banality": {
      const hero = requireHero(state, request.heroId, "FR-42");
      if (hero.dead) {
        throw new SpellCastError("FR-42: Banality targets a living hero.");
      }
      hero.def = { type: "Warrior", hp: hero.def.hp };
      events.push({ type: "cast", spellId: spell.id, spellType: "Banality", heroIds: [hero.id] });
      events.push({ type: "banality", heroId: hero.id });
      consumeSpell(spell);
      break;
    }
  }

  maybeSettle(state, events);
  state.events.push(...events);
  return { state, events };
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

export function phase4DemoLevel(): LevelDef {
  return {
    id: "phase-4-demo",
    name: "Phase 4 Spellbook",
    rooms: [
      { count: 1, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 1, room: { type: "D", damage: 2 } },
    ],
    heroes: [{ type: "Warrior", hp: 5 }],
    spells: [{ type: "Attack", damage: 3 }],
  };
}

export function phase5DemoLevel(): LevelDef {
  return {
    id: "phase-5-demo",
    name: "Phase 5 Mechanic / Gunner / Princess",
    rooms: [
      { count: 1, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 1, room: { type: "D", damage: 2 } },
    ],
    heroes: [{ type: "Mechanic", hp: 5, powerSteps: { A: 1 } }],
  };
}
