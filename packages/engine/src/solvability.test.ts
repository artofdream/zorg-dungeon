// Covers FR-46: solvability — some spell-cast sequence lets a world's heroes
// all die before Z. Covers NFR-4: the search is capped (nodes / branch),
// deterministic, and does not enumerate Selection subsets.
import { describe, expect, it } from "vitest";
import { checkSolvability, legalCastCandidates, DEFAULT_SOLVABILITY_CAPS } from "./solvability.js";
import { azAdjacent, adzLine } from "./phase6-fixtures.js";
import { layoutForWorld, declaredWorlds } from "./mirrors.js";
import { makeLevel } from "./phase1-fixtures.js";
import { createRun, stepRun } from "./simulation.js";

describe("FR-46 solvability of a given world", () => {
  it("reports not_solvable when the only path is walking into Z and Φ is empty", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }]);
    const result = checkSolvability(level, layout);
    expect(result.verdict).toBe("not_solvable");
    expect(result.solvable).toBe(false);
    expect(result.exhausted).toBe(true);
  });

  it("reports solvable with the empty sequence when heroes die on the map", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const result = checkSolvability(level, layout);
    expect(result.verdict).toBe("solvable");
    expect(result.solvable).toBe(true);
    expect(result.sequence).toEqual([]);
  });

  it("finds an Attack cast that kills before Z", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 5 }]);
    const result = checkSolvability(level, layout);
    expect(result.verdict).toBe("solvable");
    expect(result.solvable).toBe(true);
    expect(result.sequence?.some((row) => row.cast.spellId === 0)).toBe(true);
  });

  it("does not treat an insufficient Attack as a solution", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 1 }]);
    const result = checkSolvability(level, layout);
    expect(result.solvable).toBe(false);
    expect(result.verdict).toBe("not_solvable");
    expect(result.exhausted).toBe(true);
  });

  it("checks a mirror world's own heroes/spells after FR-9 substitution", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }]);
    const mirror = {
      ...makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 5 }], "m"),
      spells: [{ type: "Attack", damage: 5 } as const],
    };
    const parent = { ...level, mirrorWorlds: [mirror] };
    const world = declaredWorlds(parent)[1];
    expect(world).toBeDefined();
    const mirrored = layoutForWorld(parent, layout, world!);
    const result = checkSolvability(world!.level, mirrored);
    expect(result.solvable).toBe(true);
    expect(result.verdict).toBe("solvable");
  });
});

describe("NFR-4 bounded, deterministic search", () => {
  it("exposes hard caps and never explores more than maxNodes", () => {
    expect(DEFAULT_SOLVABILITY_CAPS.maxNodes).toBe(512);
    expect(DEFAULT_SOLVABILITY_CAPS.maxBranch).toBe(8);
    const sleeps = Array.from({ length: 10 }, () => ({ type: "Sleep" as const }));
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }], sleeps);
    const result = checkSolvability(level, layout, { maxNodes: 48, maxBranch: 3, maxSteps: 32 });
    expect(result.nodes).toBeLessThanOrEqual(48);
    expect(result.maxNodes).toBe(48);
    expect(result.verdict === "budget" || result.verdict === "not_solvable").toBe(true);
  });

  it("returns the same verdict and sequence on a second call (deterministic)", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 5 }]);
    const a = checkSolvability(level, layout);
    const b = checkSolvability(level, layout);
    expect(a).toEqual(b);
  });

  it("does not enumerate Selection as a candidate (no 2^heroes branch)", () => {
    const { level, layout } = azAdjacent(
      [{ type: "Warrior", hp: 5 }],
      [{ type: "Selection", allowCorpses: false }, { type: "Attack", damage: 5 }],
    );
    const state = createRun(level, layout);
    stepRun(state);
    const types = legalCastCandidates(state).map((c) => state.spells[c.spellId]?.def.type);
    expect(types).toContain("Attack");
    expect(types).not.toContain("Selection");
  });

  it("keeps per-window branching at or under maxBranch", () => {
    const { level, layout } = azAdjacent(
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [{ type: "Sleep" }, { type: "Sleep" }, { type: "Banality" }],
    );
    const state = createRun(level, layout);
    stepRun(state);
    const all = legalCastCandidates(state);
    expect(all.length).toBeGreaterThan(8);
    const result = checkSolvability(level, layout, { maxNodes: 32, maxBranch: 2, maxSteps: 16 });
    expect(result.nodes).toBeLessThanOrEqual(32);
  });
});
