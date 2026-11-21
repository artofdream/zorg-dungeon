// Implements FR-47 (explanations): every step of a stored solution carries
// engine-derived reasons — what the step does in the simulation and what
// fails without it, checked by altering that one step and replaying.
// Reasons are structured (code + params + rule IDs) so they can be
// localised and reused later; `text` is the English rendering.
// Implements NFR-1: Godot shows these reasons; it never derives them.

import type { LevelDef, Orientation, RoomDef, SpellDef } from "./level.js";
import { VALID_ORIENTATIONS } from "./level.js";
import { scoreLevel } from "./constraints.js";
import { validateLayout, type DungeonLayout } from "./placement.js";
import { castSpell, createRun, stepRun, type SimEvent, type SimulationState } from "./simulation.js";
import { SpellCastError } from "./spells.js";
import { layoutFromSolution, type SolutionCast, type StoredSolution } from "./solution.js";

export type ReasonParams = Record<string, string | number>;

/** One engine fact. `code` + `params` are the stable, localisable form. */
export interface ReasonFact {
  code: ReasonCode;
  params: ReasonParams;
  rules: string[];
  text: string;
}

export type ReasonCode =
  // What a step does (from the winning replay).
  | "spawn_room"
  | "goal_room"
  | "hero_damaged"
  | "hero_healed"
  | "hero_killed"
  | "gold_picked"
  | "toll_paid"
  | "teleported"
  | "waiting_room"
  | "path_link"
  | "off_path"
  | "shapes_path"
  | "spell_cast"
  | "orientation_set"
  | "run_won"
  | "constraint_holds"
  // Why it is needed (from an altered replay).
  | "moved_loses"
  | "moved_still_wins"
  | "removed_loses"
  | "removed_still_wins"
  | "earlier_result"
  | "later_result"
  | "rotated_loses"
  | "rotated_still_wins";

/** How an altered replay ends, as a fact the text can name. */
export interface Failure {
  /** loss = a hero reached Z; alive = a hero is still alive at the end; constraint = a rule broke; refused = the cast is not allowed then; illegal = layout breaks FR-5–FR-7; win = still a win. */
  kind: "loss" | "alive" | "constraint" | "refused" | "illegal" | "win";
  hero?: string;
  step?: number;
  constraint?: string;
}

export interface ExplanationStep {
  index: number;
  kind: "orientation" | "place" | "cast" | "result";
  roomId?: string;
  room?: string;
  x?: number;
  y?: number;
  orientation?: Orientation;
  afterSteps?: number;
  spellId?: number;
  spell?: string;
  does: ReasonFact[];
  why: ReasonFact[];
  /** Union of the facts' rule IDs, sorted. */
  rules: string[];
  /** Short English caption: up to three `does` facts + the first `why`. */
  text: string;
}

export interface SolutionExplanation {
  levelId: string;
  steps: ExplanationStep[];
}

const ROOM_RULE: Record<string, string> = {
  A: "FR-11",
  Z: "FR-12",
  D: "FR-13",
  E: "FR-14",
  P: "FR-15",
  O: "FR-16",
  T: "FR-17",
};
const SPELL_RULE: Record<string, string> = {
  Attack: "FR-34",
  Teleport: "FR-35",
  Move: "FR-36",
  Swap: "FR-37",
  Selection: "FR-39",
  Sleep: "FR-40",
  Wake: "FR-41",
  Banality: "FR-42",
};
const HERO_RULE: Record<string, string> = { Warrior: "FR-20", Elf: "FR-21", Gunner: "FR-22", Mechanic: "FR-24", Princess: "FR-25" };

export function roomLabel(def: RoomDef): string {
  switch (def.type) {
    case "D":
      return `D(${def.damage})`;
    case "E":
      return `E(${def.element})`;
    case "P":
      return `P(${def.entries}, ${def.formula})`;
    case "O":
      return `O(${def.gold})`;
    case "T":
      return `T(${def.cost}, ${def.element})`;
    default:
      return def.type;
  }
}

export function spellLabel(def: SpellDef): string {
  switch (def.type) {
    case "Attack":
      return `Attack(${def.damage})`;
    case "Teleport":
      return `Teleport(${def.steps})`;
    default:
      return def.type;
  }
}

/** English templates. Other languages map the same codes + params. */
export function reasonText(code: ReasonCode, p: ReasonParams): string {
  switch (code) {
    case "spawn_room":
      return "Heroes spawn here.";
    case "goal_room":
      return "Zorg's room: the heroes head here; no one may get in.";
    case "hero_damaged":
      return Number(p.entries) > 1 ? `${p.hero} takes ${p.amount} damage here over ${p.entries} entries.` : `${p.hero} takes ${p.amount} damage here.`;
    case "hero_healed":
      return `${p.hero} heals ${p.amount} here.`;
    case "hero_killed":
      return `${p.hero} dies here at step ${p.step}.`;
    case "gold_picked":
      return `${p.hero} picks up ${p.amount} gold.`;
    case "toll_paid":
      return `${p.hero} pays ${p.amount} gold toll.`;
    case "teleported":
      return `${p.hero} is sent back to ${p.to}.`;
    case "waiting_room":
      return `${p.hero} is sent to the waiting room.`;
    case "path_link":
      return `${p.hero} walks through, linking ${p.from} to ${p.to}.`;
    case "off_path":
      return "No hero enters it; it only has to be placed.";
    case "shapes_path":
      return "No hero enters it, but where it sits changes the heroes' path.";
    case "spell_cast":
      return p.killed ? `${p.spell} after step ${p.step}: ${p.effect}; kills ${p.killed}.` : `${p.spell} after step ${p.step}: ${p.effect}.`;
    case "orientation_set":
      return `All rooms face ${p.orientation}°; it sets the heroes' tie-break order.`;
    case "run_won":
      return `All heroes are dead by step ${p.step} and no one reached Zorg.`;
    case "constraint_holds":
      return `Rule "${p.rule}" holds.`;
    case "moved_loses":
      return `Elsewhere it fails: ${p.example} (${p.failing} of ${p.tried} other spots lose).`;
    case "moved_still_wins":
      return `Not critical: all ${p.tried} other spots tried still win.`;
    case "removed_loses":
      return `Without it: ${p.outcome}.`;
    case "removed_still_wins":
      return "Without it the run still wins.";
    case "earlier_result":
      return `One step earlier: ${p.outcome}.`;
    case "later_result":
      return `One step later: ${p.outcome}.`;
    case "rotated_loses":
      return `At ${p.orientation}°: ${p.outcome}.`;
    case "rotated_still_wins":
      return "Any other rotation also wins.";
  }
}

function fact(code: ReasonCode, params: ReasonParams, rules: string[]): ReasonFact {
  const text = reasonText(code, params);
  return { code, params, rules: [...new Set(rules)].sort(ruleOrder), text: text.charAt(0).toUpperCase() + text.slice(1) };
}

function ruleOrder(a: string, b: string): number {
  const [pa, na] = a.split("-");
  const [pb, nb] = b.split("-");
  return (pa ?? "").localeCompare(pb ?? "") || Number(na) - Number(nb);
}

/** Display names: "the Warrior" when alone, else "Elf 1", "Elf 2". */
function heroNames(level: LevelDef): string[] {
  const heroes = (level.heroes ?? []) as Array<{ type: string }>;
  const counts = new Map<string, number>();
  for (const h of heroes) counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
  const seen = new Map<string, number>();
  return heroes.map((h) => {
    const n = (seen.get(h.type) ?? 0) + 1;
    seen.set(h.type, n);
    return (counts.get(h.type) ?? 0) > 1 ? `${h.type} ${n}` : `the ${h.type}`;
  });
}

interface Replay {
  state: SimulationState;
  /** Every event with the step count it happened at and whether a cast caused it. */
  log: Array<{ step: number; event: SimEvent; castIndex: number | null }>;
  refused?: number;
}

/** Same loop as simulate(), but tagging events with step and cause. */
function replay(level: LevelDef, layout: DungeonLayout, casts: ReadonlyArray<SolutionCast>): Replay {
  const state = createRun(level, layout);
  const log: Replay["log"] = [];
  const maxSteps = 10_000;
  while (state.outcome === "in_progress" && state.stepCount < maxSteps) {
    const before = state.stepCount;
    const { events } = stepRun(state);
    for (const event of events) log.push({ step: state.stepCount, event, castIndex: null });
    const due = state.stepCount > before ? casts.map((c, i) => [c, i] as const).filter(([c]) => c.afterSteps === state.stepCount) : [];
    for (const [c, i] of due) {
      try {
        const r = castSpell(state, c.cast);
        for (const event of r.events) log.push({ step: state.stepCount, event, castIndex: i });
      } catch (err) {
        if (err instanceof SpellCastError) return { state, log, refused: i };
        throw err;
      }
    }
    if (due.length > 0) continue;
    if (events.length === 0) break;
  }
  return { state, log };
}

/** Score an altered solution and say how it ends. */
function outcomeOf(level: LevelDef, solution: StoredSolution, names: string[]): Failure {
  const layout = layoutFromSolution(level, solution);
  if (!validateLayout(level, layout).ok) return { kind: "illegal" };
  const run = replay(level, layout, solution.casts);
  if (run.refused !== undefined) return { kind: "refused" };
  const loss = run.log.find((r) => r.event.type === "loss");
  if (loss && loss.event.type === "loss") return { kind: "loss", hero: names[loss.event.heroId] ?? "a hero", step: loss.step };
  const score = scoreLevel(level, layout, { castScripts: { normal: solution.casts } });
  if (score.outcome === "win") return { kind: "win" };
  const alive = score.worlds.flatMap((w) => w.state.heroes).find((h) => !h.dead);
  if (alive) return { kind: "alive", hero: names[alive.id] ?? "a hero" };
  const broken = score.constraints.find((c) => c.status !== "held");
  return { kind: "constraint", constraint: broken ? constraintText(broken) : "a rule" };
}

/** English wording for a constraint; source prose (French) only where no kind is known. */
export function constraintText(c: { kind: string; expression: string }): string {
  if (c.kind === "hp_floor") return "no hero may drop below 0 HP";
  return c.expression.replace(/\.$/, "");
}

export function failureText(f: Failure): string {
  switch (f.kind) {
    case "loss":
      return `${f.hero} reaches Zorg at step ${f.step}`;
    case "alive":
      return `${f.hero} survives`;
    case "constraint":
      return `rule "${f.constraint}" breaks`;
    case "refused":
      return "the cast is not allowed then";
    case "illegal":
      return "the layout is not legal";
    case "win":
      return "still a win";
  }
}

function failureRules(f: Failure): string[] {
  switch (f.kind) {
    case "loss":
      return ["FR-12", "FR-43"];
    case "alive":
      return ["FR-43"];
    case "constraint":
      return ["FR-43", "FR-44"];
    case "refused":
      return ["FR-33"];
    case "illegal":
      return ["FR-5", "FR-6", "FR-7"];
    case "win":
      return [];
  }
}

function summary(does: ReasonFact[], why: ReasonFact[]): string {
  return [...does.slice(0, 3).map((f) => f.text), why[0]?.text].filter(Boolean).join(" ");
}

function finish(step: Omit<ExplanationStep, "rules" | "text">): ExplanationStep {
  const rules = [...new Set([...step.does, ...step.why].flatMap((f) => f.rules))].sort(ruleOrder);
  return { ...step, rules, text: summary(step.does, step.why) };
}

/**
 * FR-47: explain a verified solution step by step. Steps are: orientation,
 * each room (spawn first, then in the order heroes first enter them, then
 * rooms no hero enters, Zorg last), each cast, and the final result.
 */
export function explainSolution(level: LevelDef, solution: StoredSolution): SolutionExplanation {
  const names = heroNames(level);
  const heroDefs = (level.heroes ?? []) as Array<{ type: string }>;
  const layout = layoutFromSolution(level, solution);
  const run = replay(level, layout, solution.casts);
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  const label = (id: string) => {
    const r = byId.get(id);
    return r ? roomLabel(r.def) : id;
  };
  const heroRules = (heroId: number) => [HERO_RULE[heroDefs[heroId]?.type ?? ""] ?? "FR-19"];

  // Attribute each action event to the room the hero stands in.
  const where = new Map<number, string>();
  const firstEntry = new Map<string, number>();
  const perRoom = new Map<string, ReasonFact[]>();
  const route: string[] = [];
  const add = (roomId: string, f: ReasonFact) => {
    const list = perRoom.get(roomId) ?? [];
    list.push(f);
    perRoom.set(roomId, list);
  };
  const damageTotals = new Map<string, number>();
  const entries = new Map<string, number>();
  const healTotals = new Map<string, number>();
  let order = 0;
  for (const row of run.log) {
    const e = row.event;
    if (row.castIndex !== null) {
      // A spell's own effects belong to the cast step, but a teleport still
      // moves the hero for everything that follows.
      if (e.type === "teleport") where.set(e.heroId, e.toRoomId);
      continue;
    }
    if (e.type === "spawn") {
      where.set(e.heroId, e.roomId);
      if (!firstEntry.has(e.roomId)) firstEntry.set(e.roomId, order++);
    } else if (e.type === "enter") {
      where.set(e.heroId, e.roomId);
      entries.set(`${e.roomId}|${e.heroId}`, (entries.get(`${e.roomId}|${e.heroId}`) ?? 0) + 1);
      if (!firstEntry.has(e.roomId)) firstEntry.set(e.roomId, order++);
      if (e.heroId === 0 && route[route.length - 1] !== e.roomId) route.push(e.roomId);
    } else if (e.type === "teleport") {
      add(e.fromRoomId, fact("teleported", { hero: names[e.heroId]!, to: label(e.toRoomId) }, ["FR-15"]));
      where.set(e.heroId, e.toRoomId);
    } else if (e.type === "wait_room") {
      const r = where.get(e.heroId);
      if (r) add(r, fact("waiting_room", { hero: names[e.heroId]! }, ["FR-15"]));
    } else if (e.type === "damage") {
      const r = where.get(e.heroId);
      const k = `${r}|${e.heroId}`;
      if (r && e.amount > 0) damageTotals.set(k, (damageTotals.get(k) ?? 0) + e.amount);
      if (r && e.amount < 0) healTotals.set(k, (healTotals.get(k) ?? 0) - e.amount);
    } else if (e.type === "pickup") {
      add(e.roomId, fact("gold_picked", { hero: names[e.heroId]!, amount: e.amount }, ["FR-16"]));
    } else if (e.type === "toll") {
      const r = where.get(e.heroId);
      if (r) add(r, fact("toll_paid", { hero: names[e.heroId]!, amount: e.amount }, ["FR-17"]));
    } else if (e.type === "death") {
      const r = where.get(e.heroId);
      if (r) add(r, fact("hero_killed", { hero: names[e.heroId]!, step: row.step }, ["FR-28"]));
    }
  }
  // Spawn room of hero 0 starts the route.
  const spawn = run.log.find((r) => r.event.type === "spawn");
  if (spawn && spawn.event.type === "spawn") route.unshift(spawn.event.roomId);

  const steps: ExplanationStep[] = [];
  let index = 0;

  // 1. Orientation.
  {
    const why: ReasonFact[] = [];
    const others = VALID_ORIENTATIONS.filter((o) => o !== solution.orientation);
    const fails = others
      .map((o) => ({ o, f: outcomeOf(level, { ...solution, orientation: o }, names) }))
      .filter(({ f }) => f.kind !== "win" && f.kind !== "illegal");
    if (fails.length > 0) {
      const { o, f } = fails[0]!;
      why.push(fact("rotated_loses", { orientation: o, outcome: failureText(f) }, ["FR-31", ...failureRules(f)]));
    } else {
      why.push(fact("rotated_still_wins", {}, ["FR-7"]));
    }
    steps.push(
      finish({
        index: index++,
        kind: "orientation",
        orientation: solution.orientation,
        does: [fact("orientation_set", { orientation: solution.orientation }, ["FR-7", "FR-31"])],
        why,
      }),
    );
  }

  // 2. Rooms.
  const roomOrder = [...solution.placements].sort((a, b) => {
    const rank = (id: string) => {
      const t = byId.get(id)?.def.type;
      if (t === "A") return -1;
      if (t === "Z") return 1e9;
      return firstEntry.get(id) ?? 1e6;
    };
    return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
  });
  for (const p of roomOrder) {
    const def = byId.get(p.id)!.def;
    const rule = ROOM_RULE[def.type] ?? "FR-5";
    const does: ReasonFact[] = [];
    if (def.type === "A") does.push(fact("spawn_room", {}, ["FR-11"]));
    if (def.type === "Z") does.push(fact("goal_room", {}, ["FR-12", ...heroRules(0)]));
    for (const [k, amount] of healTotals) {
      const [roomId, heroId] = k.split("|");
      if (roomId === p.id) does.push(fact("hero_healed", { hero: names[Number(heroId)]!, amount }, [rule]));
    }
    for (const [k, amount] of damageTotals) {
      const [roomId, heroId] = k.split("|");
      if (roomId !== p.id) continue;
      does.push(fact("hero_damaged", { hero: names[Number(heroId)]!, amount, entries: entries.get(k) ?? 1 }, [rule]));
    }
    does.push(...(perRoom.get(p.id) ?? []));
    if (does.length === 0) {
      const at = route.indexOf(p.id);
      if (at > 0 && at < route.length - 1) {
        does.push(fact("path_link", { hero: names[0]!, from: label(route[at - 1]!), to: label(route[at + 1]!) }, ["FR-6", ...heroRules(0)]));
      }
    }
    const unentered = does.length === 0 && !firstEntry.has(p.id);
    // Why: move this room to every other legal spot (swap with another room
    // or an empty neighbouring cell) and replay.
    const why: ReasonFact[] = [];
    const alternatives: StoredSolution[] = [];
    for (const q of solution.placements) {
      if (q.id === p.id) continue;
      if (byId.get(q.id)!.def.type === def.type && JSON.stringify(byId.get(q.id)!.def) === JSON.stringify(def)) continue;
      alternatives.push({
        ...solution,
        placements: solution.placements.map((r) => (r.id === p.id ? { ...r, x: q.x, y: q.y } : r.id === q.id ? { ...r, x: p.x, y: p.y } : r)),
      });
    }
    const taken = new Set(solution.placements.map((r) => `${r.x},${r.y}`));
    const empties = new Set<string>();
    for (const r of solution.placements) {
      for (const [dx, dy] of [
        [1, 0],
        [0, -1],
        [-1, 0],
        [0, 1],
      ] as const) {
        const k = `${r.x + dx},${r.y + dy}`;
        if (!taken.has(k)) empties.add(k);
      }
    }
    for (const k of [...empties].sort()) {
      const [x, y] = k.split(",").map(Number);
      alternatives.push({ ...solution, placements: solution.placements.map((r) => (r.id === p.id ? { ...r, x: x!, y: y! } : r)) });
    }
    const results = alternatives.map((alt) => outcomeOf(level, alt, names)).filter((f) => f.kind !== "illegal");
    const failing = results.filter((f) => f.kind !== "win");
    if (unentered) {
      does.push(failing.length > 0 ? fact("shapes_path", {}, ["FR-6", ...heroRules(0)]) : fact("off_path", {}, ["FR-5"]));
    }
    if (failing.length > 0) {
      const example = failing.find((f) => f.kind === "loss") ?? failing[0]!;
      why.push(
        fact("moved_loses", { example: failureText(example), failing: failing.length, tried: results.length }, [rule, ...failureRules(example)]),
      );
    } else if (results.length > 0) {
      why.push(fact("moved_still_wins", { tried: results.length }, ["FR-5"]));
    }
    steps.push(finish({ index: index++, kind: "place", roomId: p.id, room: roomLabel(def), x: p.x, y: p.y, orientation: solution.orientation, does, why }));
  }

  // 3. Casts.
  const spellDefs = run.state.spells;
  solution.casts.forEach((c, i) => {
    const def = spellDefs.find((s) => s.id === c.cast.spellId)?.def;
    const spell = def ? spellLabel(def) : `spell ${c.cast.spellId}`;
    const rule = SPELL_RULE[def?.type ?? ""] ?? "FR-32";
    const caused = run.log.filter((r) => r.castIndex === i).map((r) => r.event);
    const effects: string[] = [];
    const killed: string[] = [];
    for (const e of caused) {
      if (e.type === "damage") effects.push(`${names[e.heroId]} ${e.amount >= 0 ? `takes ${e.amount} damage` : `heals ${-e.amount}`}`);
      if (e.type === "teleport") effects.push(`${names[e.heroId]} goes back to ${label(e.toRoomId)}`);
      if (e.type === "wait_room") effects.push(`${names[e.heroId]} goes to the waiting room`);
      if (e.type === "death") killed.push(names[e.heroId]!);
    }
    const does = [
      fact(
        "spell_cast",
        { spell, step: c.afterSteps, effect: effects.join(", ") || "no visible effect", ...(killed.length ? { killed: killed.join(", ") } : {}) },
        [rule, "FR-32", "FR-33", ...(killed.length ? ["FR-28"] : [])],
      ),
    ];
    const without = solution.casts.filter((_, j) => j !== i);
    const removed = outcomeOf(level, { ...solution, casts: without }, names);
    const why: ReasonFact[] = [
      removed.kind === "win"
        ? fact("removed_still_wins", {}, [rule])
        : fact("removed_loses", { outcome: failureText(removed) }, [rule, ...failureRules(removed)]),
    ];
    for (const [delta, code] of [
      [-1, "earlier_result"],
      [1, "later_result"],
    ] as const) {
      const at = c.afterSteps + delta;
      if (at < 0) continue;
      const shifted = solution.casts.map((d, j) => (j === i ? { ...d, afterSteps: at } : d));
      const f = outcomeOf(level, { ...solution, casts: shifted }, names);
      why.push(fact(code, { outcome: failureText(f) }, [rule, ...failureRules(f)]));
    }
    steps.push(finish({ index: index++, kind: "cast", afterSteps: c.afterSteps, spellId: c.cast.spellId, spell, does, why }));
  });

  // 4. Result.
  {
    const score = scoreLevel(level, layout, { castScripts: { normal: solution.casts } });
    const lastDeath = [...run.log].reverse().find((r) => r.event.type === "death");
    const does = [fact("run_won", { step: lastDeath?.step ?? run.state.stepCount }, ["FR-28", "FR-43"])];
    for (const c of score.constraints) {
      if (c.status === "held") does.push(
          fact("constraint_holds", { constraintId: c.id, kind: c.kind, rule: constraintText(c) }, c.kind === "distance" ? ["FR-10", "FR-44"] : ["FR-44"]),
        );
    }
    steps.push(finish({ index: index++, kind: "result", does, why: [] }));
  }

  return { levelId: level.id, steps };
}
