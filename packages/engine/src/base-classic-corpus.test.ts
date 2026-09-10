// Covers NFR-2: data-driven parse of the sponsor base-classic Niveau 1–20 pack.
// Covers NFR-9: authoring/validation of dense source notation (choix, dist, Π, variables).
// S5: N11 Dream Trap and N18 Math Bath live under fixtures/base-classic/quarantine
// and must not fail the green corpus suite.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isChoixDef, isSpellRepeat } from "./level.js";
import { parseLevel, serializeLevel, validateLevel } from "./loader.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "base-classic");
const quarantineRoot = join(fixturesRoot, "quarantine");

function listTxt(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".txt"))
    .sort();
}

function readFixture(dir: string, name: string): string {
  return readFileSync(join(dir, name), "utf8");
}

const GREEN_FILES = listTxt(fixturesRoot);
const QUARANTINE_FILES = listTxt(quarantineRoot);

describe("NFR-2: base-classic corpus parse (green pack)", () => {
  it("loads every non-quarantined fixture from disk (18 of Niveau 1–20)", () => {
    expect(GREEN_FILES).toHaveLength(18);
    expect(GREEN_FILES.some((name) => name.startsWith("11-") || name.startsWith("18-"))).toBe(
      false,
    );
  });

  it.each(GREEN_FILES)("parses %s without error", (name) => {
    const level = parseLevel(readFixture(fixturesRoot, name));
    expect(level.rooms.length).toBeGreaterThan(0);
    expect(level.heroes.length).toBeGreaterThan(0);
    expect(level.id).toMatch(/^base-classic-\d+$/);
  });

  it("parses Niveau 1 Foundations as structured data, not per-level code", () => {
    const level = parseLevel(readFixture(fixturesRoot, "01-foundations.txt"));
    expect(level.id).toBe("base-classic-1");
    expect(level.name).toBe("Foundations");
    expect(level.difficulty).toBe(1);
    expect(level.rooms).toEqual([
      { count: 1, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 1, room: { type: "D", damage: 2 } },
      { count: 1, room: { type: "E", element: "fire" } },
    ]);
    expect(level.heroes).toEqual([{ type: "Warrior", hp: 5 }]);
  });

  it("parses Niveau 12 inline hero choix and multiline Variante", () => {
    const level = parseLevel(readFixture(fixturesRoot, "12-chemical-loophole.txt"));
    expect(level.heroes).toHaveLength(1);
    const hero = level.heroes[0];
    expect(isChoixDef(hero)).toBe(true);
    if (!isChoixDef(hero)) throw new Error("expected choix hero");
    expect(hero.n).toBe(1);
    expect(hero.options).toEqual([
      { type: "Warrior", hp: 1 },
      { type: "Elf", hp: 1, immunities: [] },
      { type: "Gunner", hp: 1, shots: 1, duration: undefined },
    ]);
    expect(level.constraints?.[0]?.expression).toContain("dist(A, Z) = 1");
    expect(level.variants?.[0]?.expression).toContain("dist(A, P) = dist(A, E) + 2");
  });

  it("parses Niveau 14/15 named variables and λ* spell repeats", () => {
    const sleep = parseLevel(readFixture(fixturesRoot, "14-sleep-cycle.txt"));
    expect(sleep.variables).toEqual([
      { name: "λ", n: 1, domain: "N", allowRepeats: false, captureOrder: false, captureOrientation: false },
    ]);
    expect(sleep.spells).toHaveLength(2);
    expect(sleep.spells?.[0]).toEqual({ type: "Repeat", count: "λ", spell: { type: "Sleep" } });
    expect(sleep.spells?.[1]).toEqual({ type: "Repeat", count: "λ", spell: { type: "Wake" } });
    expect(isSpellRepeat(sleep.spells?.[0])).toBe(true);

    const inflation = parseLevel(readFixture(fixturesRoot, "15-a-lesson-on-inflation.txt"));
    expect(inflation.variables?.map((v) => v.name)).toEqual(["λ", "μ"]);
    expect(inflation.rooms.map((r) => r.room)).toEqual([
      { type: "A" },
      { type: "Z" },
      { type: "O", gold: "λ" },
      { type: "O", gold: "μ" },
      { type: "T", cost: "λ", element: "fire" },
      { type: "T", cost: "μ", element: "ice" },
    ]);
  });

  it("keeps N9 portal formula and N10 Π/dist constraint as opaque source text", () => {
    const n9 = parseLevel(readFixture(fixturesRoot, "09-dimensional-settings.txt"));
    const portal = n9.rooms.find((r) => !isChoixDef(r.room) && r.room.type === "P");
    expect(portal?.room).toEqual({ type: "P", entries: 2, formula: "x↦7x-6" });

    const n10 = parseLevel(readFixture(fixturesRoot, "10-checkerline.txt"));
    const expr = n10.constraints?.[0]?.expression ?? "";
    expect(expr).toContain("Π");
    expect(expr).toContain("dist(r, s)");
    expect(n10.spells).toEqual([{ type: "Swap" }, { type: "Move" }]);
  });

  it("notes residual: Niveau 21–24 were not in this extract", () => {
    const ids = GREEN_FILES.map((name) => parseLevel(readFixture(fixturesRoot, name)).id);
    expect(ids.some((id) => /^base-classic-2[1-4]$/.test(id))).toBe(false);
  });
});

describe("NFR-9: authoring/validation of real base-classic levels", () => {
  it.each(GREEN_FILES)("validateLevel accepts %s", (name) => {
    const level = parseLevel(readFixture(fixturesRoot, name));
    const result = validateLevel(level);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(GREEN_FILES)("serialize/parse round-trip preserves %s", (name) => {
    const parsed = parseLevel(readFixture(fixturesRoot, name));
    const again = parseLevel(serializeLevel(parsed));
    expect(again).toEqual(parsed);
  });
});

describe("S5 quarantine folder is excluded from the green suite", () => {
  it("keeps Dream Trap and Math Bath only under quarantine/", () => {
    expect(QUARANTINE_FILES).toEqual(["11-dream-trap.txt", "18-math-bath.txt"]);
  });
});

// S5: author-flagged / malformed levels must not fail CI. These stay skipped.
describe.skip("S5 quarantine (Dream Trap + Math Bath) — do not run in CI", () => {
  it("N11 Dream Trap — author-flagged bug", () => {
    parseLevel(readFixture(quarantineRoot, "11-dream-trap.txt"));
  });

  it("N18 Math Bath — malformed choix/heroes", () => {
    parseLevel(readFixture(quarantineRoot, "18-math-bath.txt"));
  });
});
