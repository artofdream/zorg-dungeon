// Implements FR-43: win only when every hero across every active world is
// dead and every stated blocking constraint holds; lose on any Z entry in
// any world. Sequential world resolve stays in mirrors.ts (FR-45).
// Implements FR-44: blocking constraints vs separately-tracked bonuses.
//
// No invented constraint language (NFR-8). Only authored prose that maps
// onto GAME_SPEC categories + existing engine sensors is evaluated:
//   - solvability of named worlds via checkSolvability (FR-46)
//   - positional dist equations via manhattanDistance (FR-10)
//   - HP floors, gold-at-death, reverse death order (GAME_SPEC §1)
// Everything else is UnsupportedConstraint — never guessed.

import { manhattanDistance } from "./geometry.js";
import type { BonusDef, ConstraintDef, LevelDef, RoomDef, RoomType } from "./level.js";
import {
  resolveWorlds,
  type WorldRecord,
} from "./mirrors.js";
import type { DungeonLayout, PlacedRoom } from "./placement.js";
import {
  checkSolvability,
  type SolvabilityCaps,
  type SolvabilityResult,
} from "./solvability.js";
import type { CastRequest, SimEvent } from "./simulation.js";

export type ConstraintRole = "constraint" | "bonus" | "variant";

export type ConstraintStatus = "held" | "failed" | "unsupported";

export type GroundedConstraintKind =
  | "distance"
  | "hp_floor"
  | "gold_at_death"
  | "solvability"
  | "death_order";

export type LevelScoreOutcome = "win" | "loss" | "unresolved";

export interface ConstraintEval {
  id: string;
  expression: string;
  role: ConstraintRole;
  status: ConstraintStatus;
  kind: GroundedConstraintKind | "unsupported";
  detail?: string;
}

export interface LevelScore {
  /** FR-43 aggregate. Per-world scheduler outcomes stay on `worlds`. */
  outcome: LevelScoreOutcome;
  reason?: string;
  worlds: WorldRecord[];
  constraints: ConstraintEval[];
  /** FR-44: never block `outcome`. */
  bonuses: ConstraintEval[];
  /** Source Variante lines — tracked, never blocking. */
  variants: ConstraintEval[];
}

export class UnsupportedConstraint {
  readonly expression: string;
  readonly reason: string;
  constructor(expression: string, reason: string) {
    this.expression = expression;
    this.reason = reason;
  }
}

type WorldId = string;

type RoomRef = { type: RoomType; arg?: number };

type CompareOp = "=" | "!=" | "<" | ">" | "<=" | ">=";

type DistAtom = { left: RoomRef; right: RoomRef };

type DistRhs = { kind: "number"; value: number } | { kind: "dist"; atom: DistAtom; plus?: number };

type DistanceForm =
  | { type: "compare"; left: DistAtom; op: CompareOp; right: DistRhs }
  | { type: "exists_adj_az"; dist: number }
  | { type: "exists_d_pair"; dist: number };

type ParsedConstraint =
  | { kind: "unsupported"; reason: string }
  | {
      kind: "distance";
      worlds?: WorldId[];
      form: DistanceForm;
    }
  | { kind: "hp_floor"; worlds?: WorldId[]; mode: "none_negative" | "exactly_one_negative" }
  | { kind: "gold_at_death"; worlds?: WorldId[]; amount: "any" | number }
  | { kind: "solvability"; clauses: { worldId: WorldId; want: boolean }[] }
  | { kind: "death_order"; worlds?: WorldId[]; order: "reverse_spawn" };

export function normalizeExpression(expression: string): string {
  return expression
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .normalize("NFKC")
    .replace(/[’′‛ʼ`]/g, "'")
    .replace(/[″ʺ]/g, "''")
    .replace(/≠/g, "!=")
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .replace(/[.。]\s*$/g, "")
    .trim();
}

function worldIdFromPrimes(primes: string | undefined): WorldId {
  const n = primes?.length ?? 0;
  return n === 0 ? "normal" : `M${"'".repeat(n)}`;
}

function worldIdFromToken(token: string): WorldId | undefined {
  const t = normalizeExpression(token);
  if (/^M$/i.test(t) || /^normal$/i.test(t)) return "normal";
  const m = t.match(/^M('+)$/i);
  if (m?.[1]) return `M${m[1]}`;
  return undefined;
}

function peelWorldPrefix(expr: string): { worlds?: WorldId[]; body: string } {
  const n = normalizeExpression(expr);
  const m = n.match(/^dans \((M'*)\)(?: et \((M'*)\))?\s*[,:]\s*(.+)$/i);
  if (!m?.[1] || !m[3]) return { body: n };
  const worlds: WorldId[] = [worldIdFromToken(m[1]) ?? worldIdFromPrimes(m[1].slice(1))];
  if (m[2]) worlds.push(worldIdFromToken(m[2]) ?? worldIdFromPrimes(m[2].slice(1)));
  return { worlds, body: m[3] };
}

function parseRoomRef(raw: string): RoomRef | undefined {
  const t = raw.trim();
  const m = t.match(/^([AZDEOPT])(?:\(\s*([+-]?\d+)\s*\))?$/i);
  if (!m?.[1]) return undefined;
  const type = m[1].toUpperCase() as RoomType;
  if (m[2] !== undefined) return { type, arg: Number(m[2]) };
  return { type };
}

function parseDistAtom(raw: string): DistAtom | undefined {
  const t = raw.trim();
  const m = t.match(/^dist\(\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
  if (!m?.[1] || !m[2]) return undefined;
  const left = parseRoomRef(m[1]);
  const right = parseRoomRef(m[2]);
  if (!left || !right) return undefined;
  return { left, right };
}

function parseDistRhs(raw: string): DistRhs | undefined {
  const t = raw.trim();
  if (/^[+-]?\d+$/.test(t)) return { kind: "number", value: Number(t) };
  const plus = t.match(/^(dist\(\s*.+?\s*,\s*.+?\s*\))\s*([+-])\s*(\d+)$/i);
  if (plus?.[1] && plus[2] && plus[3]) {
    const atom = parseDistAtom(plus[1]);
    if (!atom) return undefined;
    const n = Number(plus[3]);
    return { kind: "dist", atom, plus: plus[2] === "-" ? -n : n };
  }
  const atom = parseDistAtom(t);
  if (atom) return { kind: "dist", atom };
  return undefined;
}

function parseDistance(body: string): ParsedConstraint | undefined {
  const n = normalizeExpression(body);
  const also = n.match(/^on doit également avoir\s+(.+)$/i);
  const src = also?.[1] ?? n;

  const adj = src.match(
    /^(?:∃|exists)\s*s\s*∈\s*Π\s*,\s*dist\(\s*s\s*,\s*A\s*\)\s*=\s*dist\(\s*s\s*,\s*Z\s*\)\s*=\s*(\d+)$/i,
  );
  if (adj?.[1]) {
    return { kind: "distance", form: { type: "exists_adj_az", dist: Number(adj[1]) } };
  }

  const pair = src.match(
    /^(?:∃|exists)\s*\(\s*s\s*,\s*r\s*\)\s*∈\s*\{D\}(?:x\{D\}|²|\^2)\s*,\s*dist\(\s*s\s*,\s*r\s*\)\s*=\s*(\d+)$/i,
  );
  if (pair?.[1]) {
    return { kind: "distance", form: { type: "exists_d_pair", dist: Number(pair[1]) } };
  }

  const cmp = src.match(/^(dist\(\s*.+?\s*,\s*.+?\s*\))\s*(=|!=|<=|>=|<|>)\s*(.+)$/i);
  if (cmp?.[1] && cmp[2] && cmp[3]) {
    const left = parseDistAtom(cmp[1]);
    const right = parseDistRhs(cmp[3]);
    if (!left || !right) return undefined;
    return {
      kind: "distance",
      form: { type: "compare", left, op: cmp[2] as CompareOp, right },
    };
  }
  return undefined;
}

function parseSolvability(body: string): ParsedConstraint | undefined {
  const n = normalizeExpression(body);
  if (/^miroir non solvable$/i.test(n)) {
    return { kind: "solvability", clauses: [{ worldId: "M'", want: false }] };
  }

  const bothNo = n.match(/^\(M('*)\) et \(M('*)\) ne sont pas solvables$/i);
  if (bothNo?.[1] !== undefined && bothNo[2] !== undefined) {
    return {
      kind: "solvability",
      clauses: [
        { worldId: worldIdFromPrimes(bothNo[1]), want: false },
        { worldId: worldIdFromPrimes(bothNo[2]), want: false },
      ],
    };
  }
  const bothYes = n.match(/^\(M('*)\) et \(M('*)\) sont solvables$/i);
  if (bothYes?.[1] !== undefined && bothYes[2] !== undefined) {
    return {
      kind: "solvability",
      clauses: [
        { worldId: worldIdFromPrimes(bothYes[1]), want: true },
        { worldId: worldIdFromPrimes(bothYes[2]), want: true },
      ],
    };
  }
  const butNot = n.match(/^\(M('*)\) est solvable,\s*mais pas \(M('*)\)$/i);
  if (butNot?.[1] !== undefined && butNot[2] !== undefined) {
    return {
      kind: "solvability",
      clauses: [
        { worldId: worldIdFromPrimes(butNot[1]), want: true },
        { worldId: worldIdFromPrimes(butNot[2]), want: false },
      ],
    };
  }
  const notOne = n.match(/^\(M('*)\) n'est pas solvable$/i);
  if (notOne?.[1] !== undefined) {
    return { kind: "solvability", clauses: [{ worldId: worldIdFromPrimes(notOne[1]), want: false }] };
  }
  const yesOne = n.match(/^\(M('*)\) est solvable$/i);
  if (yesOne?.[1] !== undefined) {
    return { kind: "solvability", clauses: [{ worldId: worldIdFromPrimes(yesOne[1]), want: true }] };
  }
  return undefined;
}

function parseHpFloor(body: string): ParsedConstraint | undefined {
  const n = normalizeExpression(body);
  if (
    /^(?:aucun héros|le héros) ne peut(?: pas)? atteindre un nombre de points de vie strictement négatif$/i.test(
      n,
    )
  ) {
    return { kind: "hp_floor", mode: "none_negative" };
  }
  if (/^un unique héros doit atteindre un nombre de points de vie strictement négatif$/i.test(n)) {
    return { kind: "hp_floor", mode: "exactly_one_negative" };
  }
  return undefined;
}

function parseGoldAtDeath(body: string): ParsedConstraint | undefined {
  const n = normalizeExpression(body);
  if (/^chaque héros doit posséder de l'or au moment de sa mort$/i.test(n)) {
    return { kind: "gold_at_death", amount: "any" };
  }
  const exact = n.match(/^chaque héros doit posséder (\d+) en or au moment de sa mort$/i);
  if (exact?.[1]) return { kind: "gold_at_death", amount: Number(exact[1]) };
  return undefined;
}

function parseDeathOrder(body: string): ParsedConstraint | undefined {
  const n = normalizeExpression(body);
  if (/^les héros doivent mourir dans l'ordre inverse de leur ordre d'apparition$/i.test(n)) {
    return { kind: "death_order", order: "reverse_spawn" };
  }
  return undefined;
}

/** Classify one authored expression. Unknown prose stays unsupported. */
export function classifyExpression(expression: string): ParsedConstraint {
  const peeled = peelWorldPrefix(expression);
  const body = peeled.body;
  const attach = <T extends ParsedConstraint>(parsed: T): T => {
    if (parsed.kind === "unsupported" || parsed.kind === "solvability") return parsed;
    if (peeled.worlds) return { ...parsed, worlds: peeled.worlds };
    return parsed;
  };

  const solv = parseSolvability(body);
  if (solv) return solv;
  const hp = parseHpFloor(body);
  if (hp) return attach(hp);
  const gold = parseGoldAtDeath(body);
  if (gold) return attach(gold);
  const death = parseDeathOrder(body);
  if (death) return attach(death);
  const dist = parseDistance(body);
  if (dist) return attach(dist);
  return { kind: "unsupported", reason: "authored prose has no grounded evaluator" };
}

function roomMatches(room: PlacedRoom, ref: RoomRef): boolean {
  if (room.def.type !== ref.type) return false;
  if (ref.arg === undefined) return true;
  const def = room.def as RoomDef;
  if (def.type === "D") return Number(def.damage) === ref.arg;
  if (def.type === "O") return Number(def.gold) === ref.arg;
  if (def.type === "T") return Number(def.cost) === ref.arg;
  if (def.type === "P") return Number(def.entries) === ref.arg;
  return false;
}

function findRooms(layout: DungeonLayout, ref: RoomRef): PlacedRoom[] {
  return layout.rooms.filter((room) => roomMatches(room, ref));
}

function uniqueRoom(
  layout: DungeonLayout,
  ref: RoomRef,
): PlacedRoom | UnsupportedConstraint {
  const hits = findRooms(layout, ref);
  if (hits.length === 0) {
    return new UnsupportedConstraint(
      `${ref.type}${ref.arg === undefined ? "" : `(${ref.arg})`}`,
      "no matching placed room",
    );
  }
  if (hits.length > 1) {
    return new UnsupportedConstraint(
      `${ref.type}${ref.arg === undefined ? "" : `(${ref.arg})`}`,
      "ambiguous room match — refusing to guess which instance",
    );
  }
  return hits[0]!;
}

function distOf(layout: DungeonLayout, atom: DistAtom): number | UnsupportedConstraint {
  const a = uniqueRoom(layout, atom.left);
  const b = uniqueRoom(layout, atom.right);
  if (a instanceof UnsupportedConstraint) return a;
  if (b instanceof UnsupportedConstraint) return b;
  return manhattanDistance(a.position, b.position);
}

function rhsValue(layout: DungeonLayout, rhs: DistRhs): number | UnsupportedConstraint {
  if (rhs.kind === "number") return rhs.value;
  const d = distOf(layout, rhs.atom);
  if (d instanceof UnsupportedConstraint) return d;
  return d + (rhs.plus ?? 0);
}

function compare(left: number, op: CompareOp, right: number): boolean {
  switch (op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
  }
}

function selectWorlds(worlds: WorldRecord[], ids?: WorldId[]): WorldRecord[] | UnsupportedConstraint {
  if (!ids?.length) return worlds;
  const out: WorldRecord[] = [];
  for (const id of ids) {
    const hit = worlds.find((w) => w.id === id);
    if (!hit) {
      return new UnsupportedConstraint(id, `no resolved world "${id}"`);
    }
    out.push(hit);
  }
  return out;
}

function layoutFor(worlds: WorldRecord[], ids?: WorldId[]): DungeonLayout | UnsupportedConstraint {
  const selected = selectWorlds(worlds, ids ?? ["normal"]);
  if (selected instanceof UnsupportedConstraint) return selected;
  const first = selected[0];
  if (!first) return new UnsupportedConstraint("layout", "no world to read a layout from");
  return first.layout;
}

function minHpReached(heroId: number, startHp: number, events: readonly SimEvent[]): number {
  let min = startHp;
  for (const event of events) {
    if (event.type === "damage" && event.heroId === heroId) {
      min = Math.min(min, event.hp);
    }
  }
  return min;
}

function goldAtDeath(heroId: number, events: readonly SimEvent[]): number | undefined {
  let lastDrop: number | undefined;
  for (const event of events) {
    if (event.type === "gold_drop" && event.heroId === heroId) lastDrop = event.amount;
    if (event.type === "death" && event.heroId === heroId) {
      return lastDrop ?? 0;
    }
  }
  return undefined;
}

function deathIds(events: readonly SimEvent[]): number[] {
  return events.filter((e): e is Extract<SimEvent, { type: "death" }> => e.type === "death").map((e) => e.heroId);
}

interface EvalContext {
  worlds: WorldRecord[];
  solvability: Map<WorldId, SolvabilityResult>;
  caps?: Partial<SolvabilityCaps>;
}

function solvabilityOf(ctx: EvalContext, worldId: WorldId): SolvabilityResult | UnsupportedConstraint {
  const cached = ctx.solvability.get(worldId);
  if (cached) return cached;
  const world = ctx.worlds.find((w) => w.id === worldId);
  if (!world) return new UnsupportedConstraint(worldId, `no resolved world "${worldId}"`);
  const result = checkSolvability(world.level, world.layout, ctx.caps);
  ctx.solvability.set(worldId, result);
  return result;
}

function heldOrFailed(ok: boolean): ConstraintStatus {
  return ok ? "held" : "failed";
}

/** Switch on `form.type` so `.dist` is never read on the compare arm. */
function evaluateDistanceForm(
  form: DistanceForm,
  layout: DungeonLayout,
): { status: ConstraintStatus; detail?: string } {
  switch (form.type) {
    case "exists_adj_az": {
      const need = form.dist;
      const a = uniqueRoom(layout, { type: "A" });
      const z = uniqueRoom(layout, { type: "Z" });
      if (a instanceof UnsupportedConstraint) return { status: "unsupported", detail: a.reason };
      if (z instanceof UnsupportedConstraint) return { status: "unsupported", detail: z.reason };
      const ok = layout.rooms.some(
        (room) =>
          manhattanDistance(room.position, a.position) === need &&
          manhattanDistance(room.position, z.position) === need,
      );
      return { status: heldOrFailed(ok) };
    }
    case "exists_d_pair": {
      const need = form.dist;
      const ds = layout.rooms.filter((r) => r.def.type === "D");
      for (let i = 0; i < ds.length; i += 1) {
        for (let j = i + 1; j < ds.length; j += 1) {
          const left = ds[i];
          const right = ds[j];
          if (!left || !right) continue;
          if (manhattanDistance(left.position, right.position) === need) {
            return { status: "held" };
          }
        }
      }
      return { status: "failed" };
    }
    case "compare": {
      const left = distOf(layout, form.left);
      if (left instanceof UnsupportedConstraint) return { status: "unsupported", detail: left.reason };
      const right = rhsValue(layout, form.right);
      if (right instanceof UnsupportedConstraint) return { status: "unsupported", detail: right.reason };
      return { status: heldOrFailed(compare(left, form.op, right)) };
    }
  }
}

function evaluateParsed(parsed: ParsedConstraint, ctx: EvalContext): { status: ConstraintStatus; detail?: string } {
  if (parsed.kind === "unsupported") {
    return { status: "unsupported", detail: parsed.reason };
  }

  if (parsed.kind === "solvability") {
    for (const clause of parsed.clauses) {
      const result = solvabilityOf(ctx, clause.worldId);
      if (result instanceof UnsupportedConstraint) {
        return { status: "unsupported", detail: result.reason };
      }
      if (result.verdict === "budget") {
        return {
          status: "unsupported",
          detail: `FR-46 search hit NFR-4 budget on ${clause.worldId} — not a solvability proof`,
        };
      }
      const isSolvable = result.verdict === "solvable";
      if (isSolvable !== clause.want) {
        return {
          status: "failed",
          detail: `${clause.worldId} is ${result.verdict}, wanted ${clause.want ? "solvable" : "not_solvable"}`,
        };
      }
    }
    return { status: "held" };
  }

  if (parsed.kind === "distance") {
    const layout = layoutFor(ctx.worlds, parsed.worlds);
    if (layout instanceof UnsupportedConstraint) {
      return { status: "unsupported", detail: layout.reason };
    }
    return evaluateDistanceForm(parsed.form, layout);
  }

  const scoped = selectWorlds(ctx.worlds, parsed.worlds);
  if (scoped instanceof UnsupportedConstraint) {
    return { status: "unsupported", detail: scoped.reason };
  }

  if (parsed.kind === "hp_floor") {
    let negatives = 0;
    for (const world of scoped) {
      for (const hero of world.state.heroes) {
        const start = typeof hero.def.hp === "number" ? hero.def.hp : hero.hp;
        if (minHpReached(hero.id, start, world.state.events) < 0) negatives += 1;
      }
    }
    if (parsed.mode === "none_negative") return { status: heldOrFailed(negatives === 0) };
    return { status: heldOrFailed(negatives === 1) };
  }

  if (parsed.kind === "gold_at_death") {
    for (const world of scoped) {
      for (const hero of world.state.heroes) {
        const gold = goldAtDeath(hero.id, world.state.events);
        if (gold === undefined) return { status: "failed", detail: `hero ${hero.id} in ${world.id} never died` };
        const ok = parsed.amount === "any" ? gold > 0 : gold === parsed.amount;
        if (!ok) {
          return { status: "failed", detail: `hero ${hero.id} in ${world.id} died with ${gold} gold` };
        }
      }
    }
    return { status: "held" };
  }

  // death_order reverse_spawn
  for (const world of scoped) {
    const expected = world.state.heroes.map((h) => h.id).reverse();
    const actual = deathIds(world.state.events);
    if (actual.length !== expected.length || expected.some((id, i) => actual[i] !== id)) {
      return {
        status: "failed",
        detail: `${world.id} deaths [${actual.join(",")}] vs reverse spawn [${expected.join(",")}]`,
      };
    }
  }
  return { status: "held" };
}

function expandListed(item: { id: string; expression: string }): { id: string; expression: string }[] {
  if (classifyExpression(item.expression).kind !== "unsupported") return [item];
  const lines = item.expression
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  if (lines.length <= 1) return [item];
  return lines.map((expression, i) => ({ id: `${item.id}.${i + 1}`, expression }));
}

function evaluateListed(
  items: ReadonlyArray<ConstraintDef | BonusDef>,
  role: ConstraintRole,
  ctx: EvalContext,
): ConstraintEval[] {
  const out: ConstraintEval[] = [];
  for (const item of items) {
    for (const clause of expandListed(item)) {
      const parsed = classifyExpression(clause.expression);
      const { status, detail } = evaluateParsed(parsed, ctx);
      out.push({
        id: clause.id,
        expression: clause.expression,
        role,
        status,
        kind: parsed.kind === "unsupported" ? "unsupported" : parsed.kind,
        detail,
      });
    }
  }
  return out;
}

function allHeroesDead(worlds: WorldRecord[]): boolean {
  return worlds.length > 0 && worlds.every((w) => w.state.heroes.length > 0 && w.state.heroes.every((h) => h.dead));
}

function anyZReached(worlds: WorldRecord[]): boolean {
  return worlds.some((w) => w.retirement === "z_reached" || w.state.outcome === "loss");
}

/**
 * FR-43 / FR-44: resolve worlds in FR-45 order, then aggregate win/loss
 * and evaluate grounded constraints / bonuses. Opaque prose is
 * `unsupported` and refuses a win claim.
 */
export function scoreLevel(
  level: LevelDef,
  baseLayout: DungeonLayout,
  options?: {
    maxSteps?: number;
    castScripts?: Readonly<Record<string, ReadonlyArray<{ afterSteps: number; cast: CastRequest }>>>;
    solvabilityCaps?: Partial<SolvabilityCaps>;
    /** Tests may inject already-resolved worlds instead of re-simulating. */
    worlds?: WorldRecord[];
  },
): LevelScore {
  const worlds =
    options?.worlds ??
    resolveWorlds(level, baseLayout, {
      maxSteps: options?.maxSteps,
      castScripts: options?.castScripts,
    });
  const ctx: EvalContext = {
    worlds,
    solvability: new Map(),
    caps: options?.solvabilityCaps,
  };

  const constraints = evaluateListed(level.constraints ?? [], "constraint", ctx);
  const bonuses = evaluateListed(level.bonuses ?? [], "bonus", ctx);
  const variants = evaluateListed(level.variants ?? [], "variant", ctx);

  if (anyZReached(worlds)) {
    return {
      outcome: "loss",
      reason: "FR-43: a hero entered Z in at least one world",
      worlds,
      constraints,
      bonuses,
      variants,
    };
  }

  if (!allHeroesDead(worlds)) {
    return {
      outcome: "unresolved",
      reason: "FR-43: a living hero remains in an active world",
      worlds,
      constraints,
      bonuses,
      variants,
    };
  }

  const failed = constraints.filter((c) => c.status === "failed");
  if (failed.length > 0) {
    return {
      outcome: "unresolved",
      reason: `FR-43: blocking constraint failed (${failed.map((c) => c.id).join(", ")})`,
      worlds,
      constraints,
      bonuses,
      variants,
    };
  }

  const unknown = constraints.filter((c) => c.status === "unsupported");
  if (unknown.length > 0) {
    return {
      outcome: "unresolved",
      reason: `FR-43: blocking constraint unsupported — refusing to guess (${unknown.map((c) => c.id).join(", ")})`,
      worlds,
      constraints,
      bonuses,
      variants,
    };
  }

  return {
    outcome: "win",
    reason: "FR-43: every hero across every world is dead and every blocking constraint holds",
    worlds,
    constraints,
    bonuses,
    variants,
  };
}
