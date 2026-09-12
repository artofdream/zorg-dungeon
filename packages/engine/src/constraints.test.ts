// Covers FR-43: cross-world win/loss aggregate on top of FR-45 resolve.
// Covers FR-44: blocking constraints vs separately-tracked non-blocking bonuses.
// Opaque authored prose stays UnsupportedConstraint — never guessed (NFR-8).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyExpression,
  normalizeExpression,
  scoreLevel,
  UnsupportedConstraint,
} from "./constraints.js";
import { parseLevel } from "./loader.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import { corridorLine } from "./phase3-fixtures.js";
import { adzLine, azAdjacent } from "./phase6-fixtures.js";
import { resolveWorlds } from "./mirrors.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function listTxtRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "sponsor-extract") continue;
      out.push(...listTxtRecursive(path));
    } else if (name.name.endsWith(".txt")) {
      out.push(path);
    }
  }
  return out.sort();
}

describe("FR-43 cross-world win/loss aggregate", () => {
  it("wins a single cleared world with no extra constraints", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const score = scoreLevel(level, layout);
    expect(score.outcome).toBe("win");
    expect(score.worlds).toHaveLength(1);
    expect(score.worlds[0]?.retirement).toBe("cleared");
    expect(score.constraints).toEqual([]);
  });

  it("loses when any world reaches Z, even if another world cleared", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const mirror = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 5 }],
      "m-z",
    );
    const parent = { ...level, mirrorWorlds: [mirror] };
    const worlds = resolveWorlds(parent, layout);
    expect(worlds[0]?.retirement).toBe("cleared");
    expect(worlds[1]?.retirement).toBe("z_reached");

    const score = scoreLevel(parent, layout);
    expect(score.outcome).toBe("loss");
    expect(score.worlds.map((w) => w.id)).toEqual(["normal", "M'"]);
    expect(score.reason).toMatch(/entered Z/);
  });

  it("wins only after every world's heroes are dead", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const mirror = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
      "m-clear",
    );
    const score = scoreLevel({ ...level, mirrorWorlds: [mirror] }, layout);
    expect(score.outcome).toBe("win");
    expect(score.worlds.every((w) => w.retirement === "cleared")).toBe(true);
  });

  it("stays unresolved when a world still has a living hero", () => {
    const { level, layout } = azAdjacent([{ type: "Princess", hp: 5, weights: { A: 5, Z: 1 }, pull: 1 }]);
    const score = scoreLevel(level, layout);
    expect(score.outcome).toBe("unresolved");
    expect(score.reason).toMatch(/living hero/);
    expect(score.worlds[0]?.retirement).toBe("idle");
  });

  it("does not treat a failed blocking constraint as a Z-loss", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const blocked = {
      ...level,
      constraints: [{ id: "c-1", expression: "dist(A, Z) = 1" }],
    };
    // A–D–Z is dist(A,Z)=2.
    const score = scoreLevel(blocked, layout);
    expect(score.outcome).toBe("unresolved");
    expect(score.constraints[0]).toMatchObject({ status: "failed", kind: "distance" });
    expect(score.reason).toMatch(/blocking constraint failed/);
  });

  it("wins when heroes are dead and a grounded dist constraint holds", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const constrained = {
      ...level,
      constraints: [{ id: "c-1", expression: "dist(A, Z) = 2" }],
    };
    const score = scoreLevel(constrained, layout);
    expect(score.outcome).toBe("win");
    expect(score.constraints[0]?.status).toBe("held");
  });

  it("refuses a win when a blocking constraint is unsupported", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const opaque = {
      ...level,
      constraints: [{ id: "c-1", expression: "Le donjon doit être carré." }],
    };
    const score = scoreLevel(opaque, layout);
    expect(score.outcome).toBe("unresolved");
    expect(score.constraints[0]).toMatchObject({
      status: "unsupported",
      kind: "unsupported",
    });
    expect(score.constraints[0]?.detail).toMatch(/no grounded evaluator/);
    expect(score.reason).toMatch(/unsupported/);
  });
});

describe("FR-44 blocking constraints vs non-blocking bonuses", () => {
  it("still wins when a bonus fails", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const withBonus = {
      ...level,
      bonuses: [{ id: "b-1", expression: "dist(A, Z) = 1" }],
    };
    const score = scoreLevel(withBonus, layout);
    expect(score.outcome).toBe("win");
    expect(score.bonuses[0]).toMatchObject({ role: "bonus", status: "failed", kind: "distance" });
  });

  it("tracks a held bonus without requiring other bonuses", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const withBonuses = {
      ...level,
      bonuses: [
        { id: "b-1", expression: "dist(A, Z) = 2" },
        { id: "b-2", expression: "Le donjon doit être carré." },
      ],
    };
    const score = scoreLevel(withBonuses, layout);
    expect(score.outcome).toBe("win");
    expect(score.bonuses.map((b) => b.status)).toEqual(["held", "unsupported"]);
  });

  it("does not let a failed variant block a win", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const withVariant = {
      ...level,
      variants: [{ id: "v-1", expression: "dist(A, Z) = 9" }],
    };
    const score = scoreLevel(withVariant, layout);
    expect(score.outcome).toBe("win");
    expect(score.variants[0]).toMatchObject({ role: "variant", status: "failed" });
  });
});

describe("grounded evaluators (GAME_SPEC + existing sensors only)", () => {
  it("evaluates HP-floor prose from damage events", () => {
    const negative = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 5 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const floor = {
      ...negative.level,
      constraints: [
        { id: "c-1", expression: "Aucun héros ne peut atteindre un nombre de points de vie strictement négatif." },
      ],
    };
    const failed = scoreLevel(floor, negative.layout);
    expect(failed.constraints[0]).toMatchObject({ kind: "hp_floor", status: "failed" });
    expect(failed.outcome).toBe("unresolved");

    const exact = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 2 }],
    );
    const held = scoreLevel(
      {
        ...exact.level,
        constraints: [
          { id: "c-1", expression: "Aucun héros ne peut atteindre un nombre de points de vie strictement négatif" },
        ],
      },
      exact.layout,
    );
    expect(held.constraints[0]?.status).toBe("held");
    expect(held.outcome).toBe("win");
  });

  it("evaluates gold-at-death from gold_drop events", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "O", gold: 1 }, { type: "D", damage: 5 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const layout = corridorLine(level, ["A:0", "O:0", "D:0", "Z:0"]);
    const withGold = {
      ...level,
      constraints: [{ id: "c-1", expression: "Chaque héros doit posséder de l'or au moment de sa mort." }],
    };
    const held = scoreLevel(withGold, layout);
    expect(held.constraints[0]).toMatchObject({ kind: "gold_at_death", status: "held" });
    expect(held.outcome).toBe("win");

    const noGold = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const failed = scoreLevel(
      {
        ...noGold.level,
        constraints: [{ id: "c-1", expression: "Chaque héros doit posséder 1 en or au moment de sa mort" }],
      },
      noGold.layout,
    );
    expect(failed.constraints[0]?.status).toBe("failed");
    expect(failed.outcome).toBe("unresolved");
  });

  it("evaluates reverse death-order from death events", () => {
    const { level, layout } = adzLine(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [
        { type: "Warrior", hp: 1 },
        { type: "Warrior", hp: 1 },
      ],
    );
    const constrained = {
      ...level,
      constraints: [
        { id: "c-1", expression: "Les héros doivent mourir dans l'ordre inverse de leur ordre d'apparition." },
      ],
    };
    // Single-active-hero: first warrior dies, then the second — spawn order, not reverse.
    const score = scoreLevel(constrained, layout);
    expect(score.constraints[0]).toMatchObject({ kind: "death_order", status: "failed" });
    expect(score.outcome).toBe("unresolved");
  });

  it("evaluates exists-adjacent and D-pair dist forms", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 1 }, { type: "D", damage: 3 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "D:1": { x: 0, y: 1 },
      "Z:0": { x: 1, y: 1 },
    });
    const exists = classifyExpression("∃s ∈ Π, dist(s, A) = dist(s, Z) = 1.");
    expect(exists.kind).toBe("distance");
    const pair = classifyExpression("∃(s, r) ∈ {D}x{D}, dist(s, r) = 3.");
    expect(pair.kind).toBe("distance");

    const score = scoreLevel(
      {
        ...level,
        constraints: [
          { id: "c-1", expression: "∃s ∈ Π, dist(s, A) = dist(s, Z) = 1." },
          { id: "c-2", expression: "∃(s, r) ∈ {D}², dist(s, r) = 2." },
          { id: "c-3", expression: "dist(D(1), D(3)) = 2" },
        ],
      },
      layout,
    );
    // Warrior walks A→D(1) (hp 0) and dies — never reaches Z.
    expect(score.constraints.map((c) => c.status)).toEqual(["held", "held", "held"]);
    expect(score.outcome).toBe("win");
  });

  it("evaluates named-world solvability via FR-46 and treats budget as unsupported", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }]);
    const solvableMirror = {
      ...makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 5 }], "m-solvable"),
      spells: [{ type: "Attack", damage: 5 } as const],
    };
    const parent = {
      ...level,
      mirrorWorlds: [solvableMirror],
      constraints: [{ id: "c-1", expression: "(M’) est solvable." }],
      bonuses: [{ id: "b-1", expression: "(M’) n’est pas solvable." }],
    };
    const score = scoreLevel(parent, layout);
    expect(score.constraints[0]).toMatchObject({ kind: "solvability", status: "held" });
    expect(score.bonuses[0]).toMatchObject({ kind: "solvability", status: "failed" });
    // Normal world walks into Z → overall loss, but the bonus/constraint still evaluated.
    expect(score.outcome).toBe("loss");

    const budgeted = scoreLevel(
      {
        ...parent,
        constraints: [{ id: "c-1", expression: "(M') n'est pas solvable" }],
      },
      layout,
      { solvabilityCaps: { maxNodes: 1, maxBranch: 1, maxSteps: 1 } },
    );
    expect(budgeted.constraints[0]?.status).toBe("unsupported");
    expect(budgeted.constraints[0]?.detail).toMatch(/budget/);
  });

  it("compares dist atoms and refuses an ambiguous D without args", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 1 }, { type: "D", damage: 3 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
      "D:1": { x: 3, y: 0 },
    });
    const score = scoreLevel(
      {
        ...level,
        constraints: [
          { id: "c-1", expression: "dist(A, Z) = 2" },
          { id: "c-2", expression: "dist(A, D) = 1" },
        ],
      },
      layout,
    );
    expect(score.constraints[0]?.status).toBe("held");
    expect(score.constraints[1]).toMatchObject({ status: "unsupported" });
    expect(score.constraints[1]?.detail).toMatch(/ambiguous/);
  });
});

describe("authored corpus: classify only, never invent", () => {
  it("normalizes French apostrophes and trailing periods", () => {
    expect(normalizeExpression("(M’) n’est pas solvable.")).toBe("(M') n'est pas solvable");
    expect(classifyExpression("miroir non solvable").kind).toBe("solvability");
    expect(classifyExpression("(M') et (M'') sont solvables").kind).toBe("solvability");
    expect(classifyExpression("(M') est solvable, mais pas (M'')").kind).toBe("solvability");
    expect(classifyExpression("dist(A, P) = dist(A, E) + 2").kind).toBe("distance");
    expect(classifyExpression("On doit également avoir dist(A, P) = dist(A, E) + 2").kind).toBe(
      "distance",
    );
    expect(classifyExpression("Le donjon doit être carré.")).toEqual({
      kind: "unsupported",
      reason: "authored prose has no grounded evaluator",
    });
    expect(new UnsupportedConstraint("x", "y")).toMatchObject({ expression: "x", reason: "y" });
  });

  it("classifies every green-fixture constraint/bonus/variant without guessing opaque lines", () => {
    const files = listTxtRecursive(fixturesRoot);
    expect(files.length).toBeGreaterThan(50);

    const kinds = new Map<string, number>();
    const unsupported: string[] = [];
    const grounded: string[] = [];
    for (const file of files) {
      const level = parseLevel(readFileSync(file, "utf8"));
      for (const item of [...(level.constraints ?? []), ...(level.bonuses ?? []), ...(level.variants ?? [])]) {
        const lines = item.expression.split("\n").map((l) => l.trim()).filter(Boolean);
        const parts = lines.length > 1 && classifyExpression(item.expression).kind === "unsupported" ? lines : [item.expression];
        for (const expr of parts) {
          const parsed = classifyExpression(expr);
          kinds.set(parsed.kind, (kinds.get(parsed.kind) ?? 0) + 1);
          if (parsed.kind === "unsupported") unsupported.push(expr.replace(/\s+/g, " "));
          else grounded.push(`${parsed.kind}: ${normalizeExpression(expr)}`);
        }
      }
    }

    expect(kinds.get("solvability") ?? 0).toBeGreaterThan(0);
    expect(kinds.get("distance") ?? 0).toBeGreaterThan(0);
    expect(kinds.get("hp_floor") ?? 0).toBeGreaterThan(0);
    expect(kinds.get("gold_at_death") ?? 0).toBeGreaterThan(0);
    expect(kinds.get("unsupported") ?? 0).toBeGreaterThan(0);

    // Representative opaque lines must stay unsupported (do not invent).
    const opaqueSample = [
      "Le donjon doit être carré.",
      "Tous les sortilèges doivent être utilisés.",
      "Chaque héros doit mourir dans une salle différente.",
      "Remplacer Elfe par Guerrier(5)",
    ];
    for (const line of opaqueSample) {
      expect(classifyExpression(line).kind, line).toBe("unsupported");
      expect(unsupported.some((u) => normalizeExpression(u) === normalizeExpression(line))).toBe(true);
    }

    expect(grounded.some((g) => g.startsWith("solvability:"))).toBe(true);
    expect(grounded.some((g) => g.startsWith("distance:"))).toBe(true);
  });
});
