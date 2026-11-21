// Covers FR-47: every stored solution (fixtures/solutions/*.json) replays
// through the real simulation to a level win — all heroes dead, nobody in
// Z, every constraint held — and its step-by-step explanation is exactly
// what the engine derives today. Unsolved levels carry an honest search
// verdict and no solution.
// Covers NFR-4: the layout search is bounded (maxLayouts) and deterministic.
// Covers NFR-1: reasons are engine facts (codes + params + rule IDs).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scoreLevel } from "./constraints.js";
import { parseLevel } from "./loader.js";
import { createRun, simulate, stepRun } from "./simulation.js";
import {
  TARGET_FREE_CAST_CAPS,
  cycleStateKey,
  fixedPolyominoes,
  historyHorizon,
  layoutFromSolution,
  searchSolution,
  searchTargetFreeCasts,
  verifySolution,
  type StoredSolution,
} from "./solution.js";
import { explainSolution, type ExplanationStep } from "./solution-explain.js";
import { azAdjacent } from "./phase6-fixtures.js";
import { makeLevel } from "./phase1-fixtures.js";

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(engineRoot, "..", "..");
const solutionsDir = join(engineRoot, "fixtures", "solutions");
const files = readdirSync(solutionsDir).filter((f) => f.endsWith(".json")).sort();
const shipped: Array<{ id: string }> = JSON.parse(readFileSync(join(repoRoot, "apps/godot/levels/index.json"), "utf8")).levels;

type Stored = {
  levelId: string;
  source: string;
  sourceSha256: string;
  status: "solved" | "unsolved";
  search: { verdict: string };
  solution?: StoredSolution;
  explanation?: ExplanationStep[];
};

function load(file: string) {
  const stored = JSON.parse(readFileSync(join(solutionsDir, file), "utf8")) as Stored;
  const text = readFileSync(join(repoRoot, stored.source), "utf8");
  return { stored, text, level: parseLevel(text) };
}

describe("FR-47 stored solutions", () => {
  it("has one file per level the Godot port ships", () => {
    expect(files).toEqual(shipped.map((l) => `${l.id}.json`).sort());
  });

  for (const file of files) {
    const { stored, text, level } = load(file);
    describe(stored.levelId, () => {
      it("matches its source fixture", () => {
        expect(createHash("sha256").update(text).digest("hex")).toBe(stored.sourceSha256);
        expect(level.id).toBe(stored.levelId);
      });

      if (stored.status === "unsolved") {
        it("is honestly unsolved: a search verdict, no solution", () => {
          expect(stored.solution).toBeUndefined();
          expect(stored.explanation).toBeUndefined();
          expect(["exhausted", "budget", "unsupported"]).toContain(stored.search.verdict);
        });
        return;
      }

      const solution = stored.solution!;
      it("replays to a win in the real simulation", () => {
        const layout = layoutFromSolution(level, solution);
        const state = simulate(level, layout, { castScript: solution.casts });
        expect(state.outcome).toBe("win");
        expect(state.heroes.every((h) => h.dead)).toBe(true);
        expect(state.events.some((e) => e.type === "loss")).toBe(false);
        const score = scoreLevel(level, layout, { castScripts: { normal: solution.casts } });
        expect(score.outcome).toBe("win");
        expect(score.constraints.every((c) => c.status === "held")).toBe(true);
        expect(verifySolution(level, solution)).toEqual({ ok: true });
      });

      it("stores the explanation the engine derives now", () => {
        expect(explainSolution(level, solution).steps).toEqual(stored.explanation);
      });

      it("explains every placement and every cast with facts and rule IDs", () => {
        const steps = stored.explanation!;
        const placed = steps.filter((s) => s.kind === "place").map((s) => s.roomId).sort();
        expect(placed).toEqual(solution.placements.map((p) => p.id).sort());
        expect(steps.filter((s) => s.kind === "cast")).toHaveLength(solution.casts.length);
        expect(steps[0]!.kind).toBe("orientation");
        expect(steps[steps.length - 1]!.kind).toBe("result");
        for (const s of steps) {
          expect(s.does.length).toBeGreaterThan(0);
          if (s.kind !== "result") expect(s.why.length).toBeGreaterThan(0);
          expect(s.text.length).toBeGreaterThan(0);
          for (const f of [...s.does, ...s.why]) {
            expect(f.rules.length).toBeGreaterThan(0);
            for (const r of f.rules) expect(r).toMatch(/^FR-\d+$/);
          }
        }
      });

      it("only claims a step is needed when the altered replay really fails", () => {
        for (const s of stored.explanation!) {
          if (s.kind !== "cast") continue;
          const removed = s.why.find((f) => f.code === "removed_loses");
          if (!removed) continue;
          const i = solution.casts.findIndex((c) => c.afterSteps === s.afterSteps && c.cast.spellId === s.spellId);
          const without = { ...solution, casts: solution.casts.filter((_, j) => j !== i) };
          expect(verifySolution(level, without).ok).toBe(false);
        }
      });
    });
  }
});

describe("FR-47 verifier agrees with the Godot golden recordings", () => {
  // Every valid golden layout (hand-picked wins and losses) must get the
  // same win / not-win verdict from verifySolution, and its shape must be
  // one the search enumerates — so an "unsolved" level is not an artefact
  // of a stricter verifier or a missing shape.
  for (const { id } of shipped) {
    it(id, () => {
      const { level } = load(`${id}.json`);
      const golden = JSON.parse(readFileSync(join(repoRoot, "apps/godot/tests/golden", `${id}.json`), "utf8")) as {
        cases: Array<{
          name: string;
          orientation: 0 | 90 | 180 | 270;
          placements: Array<{ id: string; x: number; y: number }>;
          validation: { ok: boolean };
          castLog?: Array<{ afterSteps: number; spellId: number; result: string }>;
          score?: { outcome: string };
        }>;
      };
      for (const c of golden.cases) {
        if (!c.validation.ok || c.name === "stored-solution") continue;
        const casts = (c.castLog ?? []).filter((r) => r.result === "ok").map((r) => ({ afterSteps: r.afterSteps, cast: { spellId: r.spellId } }));
        const v = verifySolution(level, { levelId: level.id, orientation: c.orientation, placements: c.placements, casts });
        expect(v.ok, `${id}/${c.name}`).toBe(c.score?.outcome === "win");
        const mx = Math.min(...c.placements.map((p) => p.x));
        const my = Math.min(...c.placements.map((p) => p.y));
        const key = c.placements
          .map((p) => ({ x: p.x - mx, y: p.y - my }))
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((p) => `${p.x},${p.y}`)
          .join(";");
        const shapes = new Set(fixedPolyominoes(c.placements.length).map((sh) => sh.map((p) => `${p.x},${p.y}`).join(";")));
        expect(shapes.has(key), `${id}/${c.name} shape enumerated`).toBe(true);
      }
    });
  }
});

describe("NFR-4 bounded layout search", () => {
  it("enumerates fixed polyominoes (OEIS A001168)", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => fixedPolyominoes(n).length)).toEqual([1, 2, 6, 19, 63, 216]);
  });

  it("finds and verifies a winning layout for a small level", () => {
    const { level } = load("deluxe-1.1.json");
    const r = searchSolution(level);
    expect(r.verdict).toBe("found");
    expect(verifySolution(level, r.solution!)).toEqual({ ok: true });
    expect(searchSolution(level)).toEqual(r);
  });

  it("stops at maxLayouts with a budget verdict, not a fake solution", () => {
    const { level } = load("deluxe-1.2.json");
    const r = searchSolution(level, { maxLayouts: 1 });
    expect(r.found).toBe(false);
    expect(r.verdict).toBe("budget");
    expect(r.solution).toBeUndefined();
  });

  it("reports exhausted when no layout can win", () => {
    const { level } = azAdjacent([{ type: "Warrior", hp: 5 }]);
    const r = searchSolution(level);
    expect(r.verdict).toBe("exhausted");
  });

  it("refuses mirror-world levels instead of guessing", () => {
    const { level } = azAdjacent([{ type: "Warrior", hp: 5 }]);
    const r = searchSolution({ ...level, mirrorWorlds: [makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 5 }], "m")] });
    expect(r.verdict).toBe("unsupported");
  });
});

describe("NFR-4 state-cycle pruning (target-free cast search)", () => {
  const { level } = load("deluxe-5.5.json");
  // A 5.5 layout whose Warrior bounces between two cells forever, damage-free.
  const looping: StoredSolution = {
    levelId: "deluxe-5.5",
    orientation: 0,
    placements: [
      { id: "A:0", x: 0, y: 0 },
      { id: "Z:0", x: 3, y: 0 },
      { id: "E:0", x: 1, y: 0 },
      { id: "P:0", x: 4, y: 0 },
      { id: "O:0", x: 5, y: 0 },
      { id: "T:0", x: 2, y: 0 },
    ],
    casts: [],
  };

  it("records 5.5 as exhausted with no capped layout (CF-019), not a budget guess", () => {
    const search = load("deluxe-5.5.json").stored.search as { verdict: string; layoutsScored?: number; castSearchCapped?: number };
    expect(search.verdict).toBe("exhausted");
    expect(search.layoutsScored).toBe(622_080);
    expect(search.castSearchCapped).toBe(0);
  });

  it("reads the history horizon from Teleport(n) and every active P entry", () => {
    // 5.5: Teleport(4); P(2, x↦7x-6) looks back f(1) = 1 and f(2) = 8 visits.
    expect(historyHorizon(level)).toBe(8);
  });

  it("keeps histories whole when a P formula is not supported (no throw)", () => {
    const odd = { ...level, rooms: level.rooms.map((r) => (r.room.type === "P" ? { ...r, room: { ...r.room, formula: "x↦??" } } : r)) };
    expect(historyHorizon(odd as typeof level)).toBeUndefined();
  });

  it("keys a run by what can still change it, not by its step count", () => {
    const layout = layoutFromSolution(level, looping);
    const run = createRun({ ...level, spells: [] }, layout);
    const keys: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      stepRun(run);
      keys.push(cycleStateKey(run, historyHorizon(level), new Map([["P:0", 2]])));
    }
    // Once the visit history is 8 long (step 11), the bounce repeats with period 2.
    expect(keys[14]).toBe(keys[12]);
    expect(keys[15]).toBe(keys[13]);
    expect(keys[13]).not.toBe(keys[12]);
  });

  it("ends a damage-free loop as fully searched; without pruning the stall cap marks it capped", () => {
    const layout = layoutFromSolution(level, looping);
    const pruned = searchTargetFreeCasts(level, layout);
    const unpruned = searchTargetFreeCasts(level, layout, { ...TARGET_FREE_CAST_CAPS, cyclePruning: false });
    expect(pruned.sequence).toBeUndefined();
    expect(unpruned.sequence).toBeUndefined();
    expect(pruned.capped).toBe(false);
    expect(unpruned.capped).toBe(true);
  });

  it("finds the same cast plan as the unpruned search on every stored solution that casts", () => {
    for (const file of files) {
      const { stored, level: lv } = load(file);
      if (!stored.solution || stored.solution.casts.length === 0) continue;
      if (!(lv.spells ?? []).every((sp) => ["Attack", "Teleport"].includes((sp as { type: string }).type))) continue;
      const layout = layoutFromSolution(lv, stored.solution);
      const a = searchTargetFreeCasts(lv, layout);
      const b = searchTargetFreeCasts(lv, layout, { ...TARGET_FREE_CAST_CAPS, cyclePruning: false });
      expect(a.sequence, file).toEqual(b.sequence);
      expect(a.sequence, file).toBeDefined();
    }
  });
});
