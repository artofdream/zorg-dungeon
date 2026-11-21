// Implements FR-47: "Show a solution" — one stored, verified winning
// solution per shipped level (room placement + shared orientation + spell
// casts). Builds on FR-5–FR-8 (validateLayout), FR-43/FR-44 (scoreLevel)
// and FR-46 (checkSolvability).
// Implements NFR-4: the layout search is bounded — at most `maxLayouts`
// legal layouts are scored, and each spell search uses capped
// checkSolvability. A level the bounded search can't solve is reported as
// such; nothing is invented.
// Implements NFR-1: the engine decides which layout wins; presentation
// layers (Godot) only replay a stored solution.

import type { RoomPosition } from "./geometry.js";
import type { LevelDef, Orientation } from "./level.js";
import { enumerateSuppliedRooms, validateLayout, type DungeonLayout } from "./placement.js";
import { scoreLevel } from "./constraints.js";
import { checkSolvability, type SolvabilityCaps } from "./solvability.js";
import { canCastNow, castSpell, createRun, simulate, stepRun, type SimulationState } from "./simulation.js";
import { SpellCastError } from "./spells.js";
import type { CastRequest } from "./spells.js";

export interface SolutionPlacement {
  id: string;
  x: number;
  y: number;
}

export interface SolutionCast {
  afterSteps: number;
  cast: CastRequest;
}

/** One stored solution, as written to fixtures/solutions/*.json. */
export interface StoredSolution {
  levelId: string;
  /** FR-7: one shared orientation for every room. */
  orientation: Orientation;
  placements: SolutionPlacement[];
  /** Casts for the single (normal) world, in order. Empty when none are needed. */
  casts: SolutionCast[];
}

export interface SolutionSearchOptions {
  /** Hard cap on legal layouts scored (NFR-4). */
  maxLayouts?: number;
  /** Caps passed to checkSolvability for levels with spells. */
  solvabilityCaps?: Partial<SolvabilityCaps>;
  /** Orientations tried, in order (outermost loop). */
  orientations?: Orientation[];
  /** Split the shape list across workers: only shapes with index % count === index. */
  shard?: { index: number; count: number };
  /** Wall-clock budget (NFR-4); past it the verdict is `budget`. */
  deadlineMs?: number;
  /**
   * Resume an interrupted run from its last checkpoint: skip every
   * (orientation, shape) before this one. `scored`/`capped` carry the
   * checkpoint's counts so the totals stay right.
   */
  resumeAt?: { orientation: number; shape: number; scored: number; capped: number };
  /** Called every 500 scored layouts and at the end (checkpoints). */
  onProgress?: (p: {
    scored: number;
    capped: number;
    orientation: number;
    shape: number;
    shapes: number;
    /** Counts when the current shape began (what a resume restarts from). */
    shapeStartScored: number;
    shapeStartCapped: number;
  }) => void;
}

export interface SolutionSearchResult {
  found: boolean;
  /**
   * `budget` = maxLayouts reached, or some layout's FR-46 cast search hit its
   * caps (so a win may exist there); `exhausted` = every layout fully tried,
   * none wins.
   */
  verdict: "found" | "exhausted" | "budget" | "unsupported";
  layoutsScored: number;
  /** Layouts whose cast search stopped on NFR-4 caps. */
  castSearchCapped?: number;
  solution?: StoredSolution;
  /** Search-order position of the solution [orientation, shape, assignment]; lower = found first in an unsharded run. */
  rank?: [number, number, number];
  reason?: string;
}

export const DEFAULT_SOLUTION_SEARCH = {
  maxLayouts: 2_000_000,
  orientations: [0, 90, 180, 270] as Orientation[],
  solvabilityCaps: { maxNodes: 256, maxSteps: 256, maxBranch: 8 },
} as const;

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Every fixed polyomino with `n` cells, normalised to min x = min y = 0,
 * sorted by bounding-box area, then width, then cell list (deterministic;
 * compact shapes first so a found solution fits small screens).
 */
export function fixedPolyominoes(n: number): RoomPosition[][] {
  if (n <= 0) return [];
  let layer = new Map<string, RoomPosition[]>([["0,0", [{ x: 0, y: 0 }]]]);
  for (let size = 1; size < n; size += 1) {
    const next = new Map<string, RoomPosition[]>();
    for (const cells of layer.values()) {
      const taken = new Set(cells.map((c) => key(c.x, c.y)));
      for (const c of cells) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (taken.has(key(nx, ny))) continue;
          const grown = normalise([...cells, { x: nx, y: ny }]);
          const k = grown.map((p) => key(p.x, p.y)).join(";");
          if (!next.has(k)) next.set(k, grown);
        }
      }
    }
    layer = next;
  }
  const shapes = [...layer.values()];
  const dims = (s: RoomPosition[]) => {
    const w = Math.max(...s.map((p) => p.x)) + 1;
    const h = Math.max(...s.map((p) => p.y)) + 1;
    return { w, h, area: w * h };
  };
  shapes.sort((a, b) => {
    const da = dims(a);
    const db = dims(b);
    return (
      da.area - db.area ||
      Math.max(da.w, da.h) - Math.max(db.w, db.h) ||
      db.w - da.w ||
      a.map((p) => key(p.x, p.y)).join(";").localeCompare(b.map((p) => key(p.x, p.y)).join(";"))
    );
  });
  return shapes;
}

function normalise(cells: RoomPosition[]): RoomPosition[] {
  const mx = Math.min(...cells.map((c) => c.x));
  const my = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => ({ x: c.x - mx, y: c.y - my })).sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Assignments of room indexes to shape cells. Interchangeable rooms (same
 * def) only appear in ascending cell order, so swapping two identical rooms
 * is not scored twice.
 */
function* assignments(groups: number[], n: number): Generator<number[]> {
  const cellOf = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);
  function* place(i: number): Generator<number[]> {
    if (i === n) {
      yield cellOf.slice();
      return;
    }
    for (let cell = 0; cell < n; cell += 1) {
      if (used[cell]) continue;
      // Same def as the previous room → must take a later cell.
      if (i > 0 && groups[i] === groups[i - 1] && cell < cellOf[i - 1]!) continue;
      used[cell] = true;
      cellOf[i] = cell;
      yield* place(i + 1);
      used[cell] = false;
    }
    cellOf[i] = -1;
  }
  yield* place(0);
}

/**
 * NFR-4 caps for the target-free cast search. `stallSteps`: a run in which
 * no hero's HP, death or purse and no room's gold changed for that many
 * actions is cut (counted as capped, so the verdict stays `budget`, never
 * `exhausted`) — such a run is almost always a damage-free loop.
 */
export const TARGET_FREE_CAST_CAPS = { maxRuns: 20_000, maxSteps: 300, stallSteps: 40 } as const;

function progressKey(state: SimulationState): string {
  let s = "";
  for (const h of state.heroes) s += `${h.hp},${h.dead ? 1 : 0},${h.gold.length};`;
  for (const [, g] of state.roomGold) s += `${g},`;
  return s;
}

/**
 * FR-46 for target-free spells (Attack, Teleport), NFR-4 bounded: the run
 * is deterministic, so every cast plan is "which unused spell after which
 * completed action". Depth-first over those choices (identical unused
 * spells tried once), no node cap and no branch cap. Returns the first plan
 * whose run ends in a win; `capped` when `maxRuns` branches were opened or
 * a run was cut at `maxSteps` actions (then a win may exist).
 */
export function searchTargetFreeCasts(
  level: LevelDef,
  layout: DungeonLayout,
  caps: { maxRuns: number; maxSteps: number; stallSteps?: number } = TARGET_FREE_CAST_CAPS,
): { sequence?: SolutionCast[]; capped: boolean } {
  let runs = 0;
  let capped = false;
  // Post-cast states already explored. The run is deterministic and its
  // future depends only on this state (not on stepCount or the event log),
  // so casting the same spell at two moments that lead to the same state —
  // e.g. two steps inside one room before a Teleport — is tried once.
  const explored = new Set<string>();
  const dfs = (state: SimulationState, seq: SolutionCast[]): SolutionCast[] | undefined => {
    let progress = progressKey(state);
    let progressAt = state.stepCount;
    for (;;) {
      if (state.outcome !== "in_progress") return state.outcome === "win" ? seq : undefined;
      if (state.stepCount >= caps.maxSteps) {
        capped = true;
        return undefined;
      }
      if (caps.stallSteps !== undefined) {
        const now = progressKey(state);
        if (now !== progress) {
          progress = now;
          progressAt = state.stepCount;
        } else if (state.stepCount - progressAt >= caps.stallSteps) {
          capped = true;
          return undefined;
        }
      }
      if (canCastNow(state)) {
        const tried = new Set<string>();
        for (const spell of state.spells) {
          if (spell.consumed) continue;
          const key = JSON.stringify(spell.def);
          if (tried.has(key)) continue;
          tried.add(key);
          if (runs >= caps.maxRuns) {
            capped = true;
            return undefined;
          }
          runs += 1;
          const next = cloneForSearch(state);
          try {
            castSpell(next, { spellId: spell.id });
          } catch (err) {
            if (err instanceof SpellCastError) continue;
            throw err;
          }
          const fp = searchStateKey(next);
          if (explored.has(fp)) continue;
          explored.add(fp);
          const found = dfs(next, [...seq, { afterSteps: next.stepCount, cast: { spellId: spell.id } }]);
          if (found) return found;
        }
      }
      const before = state.stepCount;
      const { events } = stepRun(state);
      if (events.length === 0 && state.stepCount === before) return undefined;
    }
  };
  const sequence = dfs(createRun(level, layout), []);
  return { sequence, capped };
}

/**
 * Clone a run for a search branch without copying the append-only event log
 * or the immutable level (both are only read by presenters and scoring; the
 * winning branch is re-verified from scratch with verifySolution).
 */
function cloneForSearch(state: SimulationState): SimulationState {
  const { events, level, ...rest } = state;
  const copy = structuredClone(rest) as Omit<SimulationState, "events" | "level">;
  void events;
  return { ...copy, level, events: [] };
}

/** Every field that decides how a run continues (all but stepCount, the event log and the level). */
export function searchStateKey(state: SimulationState): string {
  const { events, level, stepCount, ...rest } = state;
  void events;
  void level;
  void stepCount;
  return JSON.stringify(rest, (_k, v) =>
    v instanceof Map ? [...v.entries()].sort() : v instanceof Set ? [...v].sort() : v,
  );
}

function targetFreeOnly(level: LevelDef): boolean {
  return (level.spells ?? []).every((s) => {
    const t = (s as { type?: string }).type;
    return t === "Attack" || t === "Teleport";
  });
}

/** Build the layout a stored solution describes. */
export function layoutFromSolution(level: LevelDef, solution: StoredSolution): DungeonLayout {
  const supplied = enumerateSuppliedRooms(level);
  const at = new Map(solution.placements.map((p) => [p.id, p]));
  return {
    rooms: supplied
      .filter((s) => at.has(s.id))
      .map((s) => ({
        id: s.id,
        def: s.def,
        position: { x: at.get(s.id)!.x, y: at.get(s.id)!.y },
        orientation: solution.orientation,
      })),
  };
}

export interface SolutionVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * FR-47 replay check: the layout is legal (FR-5–FR-8) and the run with the
 * stored casts is a level win under FR-43/FR-44 (every hero dead in every
 * world, nobody reached Z, every constraint satisfied).
 */
export function verifySolution(level: LevelDef, solution: StoredSolution): SolutionVerdict {
  if (solution.levelId !== level.id) {
    return { ok: false, reason: `solution is for ${solution.levelId}, not ${level.id}` };
  }
  const layout = layoutFromSolution(level, solution);
  const report = validateLayout(level, layout);
  if (!report.ok) {
    return { ok: false, reason: `illegal layout: ${report.issues.map((i) => i.code).join(", ")}` };
  }
  let score;
  try {
    score = scoreLevel(level, layout, { castScripts: { normal: solution.casts } });
  } catch (err) {
    if (err instanceof SpellCastError) return { ok: false, reason: `cast refused: ${err.message}` };
    throw err;
  }
  if (score.outcome !== "win") return { ok: false, reason: `outcome ${score.outcome}: ${score.reason}` };
  return { ok: true };
}

/**
 * FR-47 / NFR-4: bounded search for one winning layout + cast sequence.
 * Shapes are tried compact-first, then room assignments, then
 * orientations. Each legal layout is scored without casts; levels with
 * spells also get a cast search: the uncapped-branch target-free search
 * when every spell is Attack/Teleport, else the capped FR-46 search. The first verified win is
 * returned.
 */
export function searchSolution(level: LevelDef, options?: SolutionSearchOptions): SolutionSearchResult {
  const maxLayouts = options?.maxLayouts ?? DEFAULT_SOLUTION_SEARCH.maxLayouts;
  const orientations = options?.orientations ?? DEFAULT_SOLUTION_SEARCH.orientations;
  const caps = options?.solvabilityCaps ?? DEFAULT_SOLUTION_SEARCH.solvabilityCaps;
  if ((level.mirrorWorlds?.length ?? 0) > 0) {
    return {
      found: false,
      verdict: "unsupported",
      layoutsScored: 0,
      reason: "mirror worlds need one cast script per world; the search only scripts the normal world",
    };
  }
  let supplied;
  try {
    supplied = enumerateSuppliedRooms(level);
  } catch (err) {
    return { found: false, verdict: "unsupported", layoutsScored: 0, reason: String(err) };
  }
  const n = supplied.length;
  const defKeys = supplied.map((s) => JSON.stringify(s.def));
  const groups = defKeys.map((k) => defKeys.indexOf(k));
  const hasSpells = (level.spells?.length ?? 0) > 0;
  const targetFree = hasSpells && targetFreeOnly(level);
  const resume = options?.resumeAt;
  let scored = resume?.scored ?? 0;
  let capped = resume?.capped ?? 0;

  const shapes = fixedPolyominoes(n);
  const shard = options?.shard;
  const noCasts = { ...level, spells: [] };
  const started = Date.now();
  const deadline = options?.deadlineMs;
  for (const [oi, orientation] of orientations.entries()) {
    for (const [si, shape] of shapes.entries()) {
      if (shard && si % shard.count !== shard.index) continue;
      if (resume && (oi < resume.orientation || (oi === resume.orientation && si < resume.shape))) continue;
      const shapeStartScored = scored;
      const shapeStartCapped = capped;
      let ai = -1;
      for (const cells of assignments(groups, n)) {
        ai += 1;
        // Shapes are normalised (min x = min y = 0); presenters may translate.
        const placements = supplied.map((s, i) => ({ id: s.id, x: shape[cells[i]!]!.x, y: shape[cells[i]!]!.y }));
        const candidate: StoredSolution = { levelId: level.id, orientation, placements, casts: [] };
        const layout = layoutFromSolution(level, candidate);
        if (!validateLayout(level, layout).ok) continue;
        scored += 1;
        if (scored % 500 === 0) {
          options?.onProgress?.({ scored, capped, orientation: oi, shape: si, shapes: shapes.length, shapeStartScored, shapeStartCapped });
          if (deadline !== undefined && Date.now() - started > deadline) {
            return { found: false, verdict: "budget", layoutsScored: scored, castSearchCapped: capped, reason: "deadline" };
          }
        }
        if (scored > maxLayouts) {
          return { found: false, verdict: "budget", layoutsScored: scored - 1, castSearchCapped: capped };
        }
        const rank: [number, number, number] = [oi, si, ai];
        // Cheap pre-check: one plain run; score only a run that wins.
        // With spells, the cast search below also covers the no-cast run, so
        // this pre-check is bounded like it (a damage-free loop would
        // otherwise run the full 10,000-action default).
        const plain = hasSpells ? simulate(noCasts, layout, { maxSteps: TARGET_FREE_CAST_CAPS.maxSteps }) : simulate(level, layout);
        if (plain.outcome === "win" && verifySolution(level, candidate).ok) {
          return { found: true, verdict: "found", layoutsScored: scored, solution: candidate, rank };
        }
        if (!hasSpells) continue;
        let sequence: SolutionCast[] | undefined;
        if (targetFree) {
          const r = searchTargetFreeCasts(level, layout);
          if (r.capped) capped += 1;
          sequence = r.sequence;
        } else {
          const result = checkSolvability(level, layout, caps);
          if (result.verdict === "budget") capped += 1;
          sequence = result.solvable ? result.sequence?.map((row) => ({ ...row })) : undefined;
        }
        if (!sequence) continue;
        const withCasts: StoredSolution = { ...candidate, casts: sequence };
        if (verifySolution(level, withCasts).ok) {
          return { found: true, verdict: "found", layoutsScored: scored, solution: withCasts, rank };
        }
      }
    }
  }
  return capped > 0
    ? { found: false, verdict: "budget", layoutsScored: scored, castSearchCapped: capped }
    : { found: false, verdict: "exhausted", layoutsScored: scored };
}
