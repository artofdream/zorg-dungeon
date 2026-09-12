// Covers generateLevel: parseable DSL, FR-5–FR-8 placement, FR-46 solvability
// within NFR-4 caps, seed stability. Does not claim FR-4 gating, FR-18 C,
// Gunner duration, or a live probe.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyCampaignPlayability,
  difficultyBand,
  isQuarantineFixturePath,
  parseDifficultyFromText,
} from "./campaign.js";
import {
  GENERATION_BANDS,
  GENERATION_PROFILES,
  generateLevel,
  generatedCampaignEntry,
  hashGenerationSeed,
  resolveGenerationBand,
} from "./generator.js";
import { flattenRooms, isChoixDef } from "./level.js";
import { parseLevel, validateLevel } from "./loader.js";
import { canStartExtermination, validateLayout } from "./placement.js";
import { DEFAULT_SOLVABILITY_CAPS } from "./solvability.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function listTxtRecursive(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "sponsor-extract") continue;
      listTxtRecursive(path, acc);
    } else if (name.name.endsWith(".txt")) {
      acc.push(path);
    }
  }
  return acc.sort();
}

interface AuthoredEnvelope {
  band: string;
  n: number;
  rooms: { min: number; max: number };
  heroes: { min: number; max: number };
  spells: { min: number; max: number };
}

function authoredEnvelopes(): AuthoredEnvelope[] {
  const buckets = new Map<string, { rooms: number[]; heroes: number[]; spells: number[] }>();
  for (const abs of listTxtRecursive(fixturesRoot)) {
    const rel = abs.slice(fixturesRoot.length + 1).replace(/\\/g, "/");
    if (isQuarantineFixturePath(rel)) continue;
    const text = readFileSync(abs, "utf8");
    let level;
    try {
      level = parseLevel(text);
    } catch {
      continue;
    }
    if (!classifyCampaignPlayability(level).playable) continue;
    const raw = level.difficulty ?? parseDifficultyFromText(text);
    const band = difficultyBand(raw);
    if (!GENERATION_BANDS.includes(band as (typeof GENERATION_BANDS)[number])) continue;
    const rooms = flattenRooms(level.rooms).length;
    const heroes = level.heroes.flatMap((h) => (isChoixDef(h) ? h.options : [h])).length;
    const spells = (level.spells ?? []).length;
    const bucket = buckets.get(band) ?? { rooms: [], heroes: [], spells: [] };
    bucket.rooms.push(rooms);
    bucket.heroes.push(heroes);
    bucket.spells.push(spells);
    buckets.set(band, bucket);
  }
  return GENERATION_BANDS.map((band) => {
    const bucket = buckets.get(band);
    if (!bucket || bucket.rooms.length === 0) {
      throw new Error(`No playable authored levels in Difficulté ${band}`);
    }
    const span = (xs: number[]) => ({ min: Math.min(...xs), max: Math.max(...xs) });
    return {
      band,
      n: bucket.rooms.length,
      rooms: span(bucket.rooms),
      heroes: span(bucket.heroes),
      spells: span(bucket.spells),
    };
  });
}

describe("generation difficulty model (corpus-grounded)", () => {
  it("resolves only authored numeric Difficulté bands 1–4", () => {
    expect(resolveGenerationBand(1)).toBe("1");
    expect(resolveGenerationBand("4")).toBe("4");
    expect(resolveGenerationBand("3 (note)")).toBe("3");
    expect(() => resolveGenerationBand("unspecified")).toThrow(/authored Difficulté bands/);
    expect(hashGenerationSeed(undefined)).toBe(1);
    expect(hashGenerationSeed(9)).toBe(9);
    expect(hashGenerationSeed("alpha")).toBe(hashGenerationSeed("alpha"));
    expect(hashGenerationSeed("alpha")).not.toBe(hashGenerationSeed("beta"));
  });

  it("keeps knobs inside playable authored envelopes for each band", () => {
    const envelopes = authoredEnvelopes();
    expect(envelopes.map((e) => e.band)).toEqual([...GENERATION_BANDS]);
    for (const env of envelopes) {
      const profile = GENERATION_PROFILES[env.band as (typeof GENERATION_BANDS)[number]];
      expect(profile.roomCount).toBeGreaterThanOrEqual(env.rooms.min);
      expect(profile.roomCount).toBeLessThanOrEqual(env.rooms.max);
      expect(profile.heroCount).toBeGreaterThanOrEqual(env.heroes.min);
      expect(profile.heroCount).toBeLessThanOrEqual(env.heroes.max);
      expect(profile.spellCount).toBeGreaterThanOrEqual(env.spells.min);
      expect(profile.spellCount).toBeLessThanOrEqual(env.spells.max);
    }
    // Harder bands do not shrink the generated board vs band 1 (hypothesis check).
    expect(GENERATION_PROFILES["2"].roomCount).toBeGreaterThan(GENERATION_PROFILES["1"].roomCount);
    expect(GENERATION_PROFILES["4"].roomCount).toBeGreaterThan(GENERATION_PROFILES["3"].roomCount);
    expect(GENERATION_PROFILES["4"].spellCount).toBeGreaterThan(GENERATION_PROFILES["1"].spellCount);
  });
});

describe("generateLevel (FR-1 / FR-5–FR-8 / FR-46 / NFR-4)", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const a = generateLevel({ difficulty: 2, seed: 42 });
    const b = generateLevel({ difficulty: 2, seed: 42 });
    const c = generateLevel({ difficulty: 2, seed: 43 });
    expect(a.text).toBe(b.text);
    expect(a.level).toEqual(b.level);
    expect(a.layout).toEqual(b.layout);
    expect(a.solvability).toEqual(b.solvability);
    expect(c.text).not.toBe(a.text);
    expect(a.seed).toBe(42);
  });

  it.each(GENERATION_BANDS)(
    "band %s parses, places, and is FR-46 solvable within NFR-4 caps",
    (band) => {
      const generated = generateLevel({ difficulty: band, seed: 7 });
      expect(generated.difficultyBand).toBe(band);
      expect(generated.profile.band).toBe(band);

      const parsed = parseLevel(generated.text);
      expect(parsed.id).toBe(generated.level.id);
      expect(parsed.difficulty).toBe(Number(band));
      expect(validateLevel(parsed).valid).toBe(true);

      const flat = flattenRooms(parsed.rooms);
      expect(flat.some((r) => r.type === "A")).toBe(true);
      expect(flat.some((r) => r.type === "Z")).toBe(true);
      expect(flat.some((r) => r.type === "C")).toBe(false);
      expect(flat).toHaveLength(generated.profile.roomCount);
      expect(parsed.heroes).toHaveLength(generated.profile.heroCount);

      const play = classifyCampaignPlayability(parsed);
      expect(play).toEqual({ playable: true, reasons: [], needsChoix: false });

      const report = validateLayout(parsed, generated.layout);
      expect(report.ok).toBe(true);
      expect(report.canStartExtermination).toBe(true);
      expect(canStartExtermination(parsed, generated.layout)).toBe(true);

      expect(generated.solvability.verdict).toBe("solvable");
      expect(generated.solvability.solvable).toBe(true);
      expect(generated.solvability.nodes).toBeLessThanOrEqual(DEFAULT_SOLVABILITY_CAPS.maxNodes);
    },
  );

  it("never emits C rooms, Gunner, choix, or mirrors (NFR-8 / S2 / S3)", () => {
    for (const band of GENERATION_BANDS) {
      for (const seed of [1, 2, 11, 99, 12345]) {
        const generated = generateLevel({ difficulty: band, seed });
        const text = generated.text;
        expect(text).not.toMatch(/\bC\(/);
        expect(text).not.toMatch(/Gunner|Artilleur/i);
        expect(text).not.toMatch(/choix\s*\(/i);
        expect(generated.level.mirrorWorlds).toBeUndefined();
        expect(generated.level.heroes.every((h) => !isChoixDef(h))).toBe(true);
        expect(generated.solvability.verdict).toBe("solvable");
        expect(generated.solvability.nodes).toBeLessThanOrEqual(DEFAULT_SOLVABILITY_CAPS.maxNodes);
      }
    }
  });

  it("builds a playable generated campaign card without a contract gate", () => {
    const generated = generateLevel({ difficulty: 1, seed: 1 });
    const entry = generatedCampaignEntry(generated);
    expect(entry.pack).toBe("generated");
    expect(entry.playable).toBe(true);
    expect(entry.contractId).toBeNull();
    expect(entry.contractCost).toBeNull();
    expect(entry.path).toMatch(/^generated\//);
    expect(entry.difficultyBand).toBe("1");
  });
});
