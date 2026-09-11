// Implements FR-46: a solvability check — does any spell-cast sequence let
// a given world's heroes all die before reaching Z.
// Implements NFR-4: the search is bounded (one-time spells, finite legal
// candidates per window, hard node/branch caps). It does not enumerate
// Selection subsets or an infinite empty grid.

import type { RoomPosition } from "./geometry.js";
import type { DungeonLayout } from "./placement.js";
import type { LevelDef } from "./level.js";
import {
  canCastNow,
  castSpell,
  createRun,
  stepRun,
  type CastRequest,
  type SimulationState,
} from "./simulation.js";
import { occupiedCells, SpellCastError } from "./spells.js";

export const DEFAULT_SOLVABILITY_CAPS = {
  /** Hard expansion budget (NFR-4). */
  maxNodes: 512,
  /** Per-leaf simulate / step cap. */
  maxSteps: 256,
  /** At most this many legal casts are tried at one window (NFR-4). */
  maxBranch: 8,
} as const;

export type SolvabilityCaps = {
  maxNodes: number;
  maxSteps: number;
  maxBranch: number;
};

export type SolvabilityVerdict = "solvable" | "not_solvable" | "budget";

export interface SolvabilityResult {
  /** FR-46: true iff a winning sequence was found. */
  solvable: boolean;
  /**
   * `not_solvable` means the bounded candidate model was exhausted with no
   * win — not a proof over Selection subsets or arbitrary Move cells.
   * `budget` means NFR-4 caps stopped the search before exhaustion.
   */
  verdict: SolvabilityVerdict;
  exhausted: boolean;
  nodes: number;
  maxNodes: number;
  sequence?: ReadonlyArray<{ afterSteps: number; cast: CastRequest }>;
}

export function cloneRun(state: SimulationState): SimulationState {
  return structuredClone(state);
}

function fingerprint(state: SimulationState): string {
  return JSON.stringify({
    o: state.outcome,
    a: state.mainAId,
    h: state.heroes.map((h) => ({
      id: h.id,
      hp: h.hp,
      d: h.dead,
      k: h.stuck,
      s: h.sleeping,
      p: h.spawned,
      c: h.cell,
      r: h.roomId,
      g: h.gold.length,
      sh: h.shotsLeft,
      v: h.visits,
      pe: [...h.portalEntries.entries()].sort(([x], [y]) => x.localeCompare(y)),
      sv: [...h.shoveLeft.entries()].sort(([x], [y]) => x.localeCompare(y)),
      // Banality rewrites def (type / immunities / pull) without touching the
      // fields above; omitting it collapses distinct FR-42 targets into one key.
      df: h.def,
    })),
    sp: state.spells.map((s) => (s.consumed ? 1 : 0)),
    rm: state.layout.rooms
      .map((r) => [r.id, r.position.x, r.position.y] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
    rg: [...state.roomGold.entries()].sort(([x], [y]) => x.localeCompare(y)),
    pv: [...state.poisonVisits].sort(),
    cc: [...state.clearedCells].sort(),
    cm: [...state.clearedMonsters].sort(),
  });
}

function emptyHalo(layout: DungeonLayout): RoomPosition[] {
  const occupied = occupiedCells(layout);
  const keys = new Set<string>();
  const out: RoomPosition[] = [];
  for (const room of layout.rooms) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const dest = { x: room.position.x + dx, y: room.position.y + dy };
      const key = `${dest.x},${dest.y}`;
      if (occupied.has(key) || keys.has(key)) continue;
      keys.add(key);
      out.push(dest);
    }
  }
  out.sort((a, b) => a.x - b.x || a.y - b.y);
  return out;
}

function castKey(cast: CastRequest): string {
  return JSON.stringify([
    cast.spellId,
    cast.heroId ?? null,
    cast.heroIds ?? null,
    cast.dest ?? null,
    cast.otherRoomId ?? null,
    cast.innerSpellId ?? null,
  ]);
}

/**
 * NFR-4 candidate generator: linear in unused spells × (heroes + rooms).
 * Selection is not auto-enumerated (subset explosion). Move only considers
 * cardinal empty cells touching the current bounding occupancy.
 */
export function legalCastCandidates(state: SimulationState): CastRequest[] {
  const out: CastRequest[] = [];
  for (const spell of state.spells) {
    if (spell.consumed) continue;
    switch (spell.def.type) {
      case "Attack":
      case "Teleport":
        out.push({ spellId: spell.id });
        break;
      case "Sleep":
        for (const hero of state.heroes) {
          if (!hero.dead && !hero.sleeping) out.push({ spellId: spell.id, heroId: hero.id });
        }
        break;
      case "Wake":
        for (const hero of state.heroes) {
          if (hero.sleeping) out.push({ spellId: spell.id, heroId: hero.id });
        }
        break;
      case "Banality":
        for (const hero of state.heroes) {
          if (!hero.dead) out.push({ spellId: spell.id, heroId: hero.id });
        }
        break;
      case "Move":
        for (const dest of emptyHalo(state.layout)) {
          out.push({ spellId: spell.id, dest });
        }
        break;
      case "Swap": {
        const active = state.heroes.find((h) => !h.dead && !h.stuck) ?? state.heroes.find((h) => !h.dead);
        const here = active?.roomId;
        if (!here) break;
        const others = state.layout.rooms.map((r) => r.id).filter((id) => id !== here).sort();
        for (const otherRoomId of others) {
          out.push({ spellId: spell.id, otherRoomId });
        }
        break;
      }
      case "Selection":
        // NFR-4: do not enumerate 2^heroes subsets or inner×target products.
        break;
    }
  }
  out.sort((a, b) => castKey(a).localeCompare(castKey(b)));
  return out;
}

function tryCast(state: SimulationState, cast: CastRequest): SimulationState | undefined {
  const next = cloneRun(state);
  try {
    castSpell(next, cast);
    return next;
  } catch (err) {
    if (err instanceof SpellCastError) return undefined;
    throw err;
  }
}

function isSolved(state: SimulationState): boolean {
  return (
    state.outcome === "win" &&
    state.heroes.every((h) => h.dead) &&
    !state.events.some((e) => e.type === "loss")
  );
}

function isLost(state: SimulationState): boolean {
  return state.outcome === "loss" || state.events.some((e) => e.type === "loss");
}

/**
 * FR-46 / NFR-4: BFS over (step | legal capped cast) from a fresh run.
 * Each spell is still one-time (FR-32). Casts only at FR-33 windows.
 */
export function checkSolvability(
  level: LevelDef,
  layout: DungeonLayout,
  caps?: Partial<SolvabilityCaps>,
): SolvabilityResult {
  const maxNodes = caps?.maxNodes ?? DEFAULT_SOLVABILITY_CAPS.maxNodes;
  const maxSteps = caps?.maxSteps ?? DEFAULT_SOLVABILITY_CAPS.maxSteps;
  const maxBranch = caps?.maxBranch ?? DEFAULT_SOLVABILITY_CAPS.maxBranch;

  type Node = {
    state: SimulationState;
    sequence: Array<{ afterSteps: number; cast: CastRequest }>;
  };

  const start = createRun(level, layout);
  const queue: Node[] = [{ state: start, sequence: [] }];
  const seen = new Set<string>([fingerprint(start)]);
  let nodes = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    const { state, sequence } = node;
    // A winning node already in the queue must be reported even if the
    // remaining expansion budget is zero — otherwise BFS can discard a
    // generated win and return `budget` (NFR-4 / FR-46).
    if (isSolved(state)) {
      return {
        solvable: true,
        verdict: "solvable",
        exhausted: false,
        nodes: nodes + 1,
        maxNodes,
        sequence,
      };
    }
    if (nodes >= maxNodes) {
      return { solvable: false, verdict: "budget", exhausted: false, nodes, maxNodes };
    }
    nodes += 1;
    if (isLost(state) || state.outcome !== "in_progress") continue;
    if (state.stepCount >= maxSteps) continue;

    if (canCastNow(state)) {
      const candidates = legalCastCandidates(state).slice(0, maxBranch);
      for (const cast of candidates) {
        const next = tryCast(state, cast);
        if (!next) continue;
        const fp = fingerprint(next);
        if (seen.has(fp)) continue;
        seen.add(fp);
        queue.push({
          state: next,
          sequence: [...sequence, { afterSteps: next.stepCount, cast }],
        });
      }
    }

    const stepped = cloneRun(state);
    const before = stepped.stepCount;
    const { events } = stepRun(stepped);
    if (events.length === 0 && stepped.outcome === "in_progress" && stepped.stepCount === before) {
      continue;
    }
    const fp = fingerprint(stepped);
    if (seen.has(fp)) continue;
    seen.add(fp);
    queue.push({ state: stepped, sequence });
  }

  return {
    solvable: false,
    verdict: "not_solvable",
    exhausted: true,
    nodes,
    maxNodes,
  };
}
