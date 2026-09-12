// Procedural levels after the authored campaign (sponsor: authored first).
// Uses only rooms/heroes/spells the engine already implements.
// Does not invent C (FR-18 / S2), Gunner duration (S3), FR-4 gating (S6),
// or contracts 11–15 (S4). Quarantine stays out of the green corpus (CF-005).
//
// Difficulty knobs are grounded in authored Difficulté 1–4 envelopes
// (base-classic + base-extras). Harder bands add rooms / heroes / spells and
// interaction rooms (E, O) — not a fantasy 1–10 scale. Deluxe contracts with
// no Difficulté line are unspecified and are not a generation target.
//
// Solvability construction (FR-46): A → lethal D → … → Z in a 4-connected
// line. First D damage ≥ every hero's HP, so the empty cast sequence wins
// under the NFR-4 bounded search. No mirror worlds — this slice does not
// emit not_solvable-mirror constraints.

import {
  classifyCampaignPlayability,
  difficultyBand,
  type CampaignEntry,
} from "./campaign.js";
import {
  flattenRooms,
  type HeroDef,
  type LevelDef,
  type RoomDef,
  type SpellDef,
} from "./level.js";
import { serializeLevel, validateLevel } from "./loader.js";
import {
  enumerateSuppliedRooms,
  validateLayout,
  type DungeonLayout,
  type PlacedRoom,
} from "./placement.js";
import {
  checkSolvability,
  type SolvabilityCaps,
  type SolvabilityResult,
} from "./solvability.js";

/** Authored numeric Difficulté values that actually appear on green fixtures. */
export const GENERATION_BANDS = ["1", "2", "3", "4"] as const;
export type GenerationBand = (typeof GENERATION_BANDS)[number];

export interface GenerationProfile {
  band: GenerationBand;
  /** Flattened room count, including A and Z. */
  roomCount: number;
  heroCount: number;
  spellCount: number;
  allowElemental: boolean;
  allowGold: boolean;
  allowElf: boolean;
  /**
   * Why these knobs: observed on playable authored levels in this band
   * (quarantine excluded). Not a claim that every authored level matches.
   */
  corpusNote: string;
}

/**
 * Generation knobs per Difficulté band.
 *
 * Authored envelopes (playable, non-quarantine, numeric Difficulté) as of
 * this slice, from fixture parse — see generator.test.ts:
 * - Band 1: typically 4–6 rooms, 1–2 heroes, 0–1 spells; A/Z/D/E (Foundations).
 * - Band 2: typically 5–7 rooms, 1–2 heroes, 0–2 spells; gold/toll/portals appear.
 * - Band 3: room count does not jump (often 5–8); more spells / constraints.
 * - Band 4: one authored level (Stupidity Award) — 8 rooms, 2 heroes, 3 spells.
 *
 * Generator stays inside those envelopes. It does **not** emit P / T / C /
 * Gunner / Mechanic / Princess: those are legal in the engine but break the
 * lethal-corridor construction (portals, unpaid tolls, shoves, shots).
 * Band 2+ authored gold is represented as O only (pickup flavour; FR-4 still
 * not an economy).
 */
export const GENERATION_PROFILES: Record<GenerationBand, GenerationProfile> = {
  "1": {
    band: "1",
    roomCount: 4,
    heroCount: 1,
    spellCount: 0,
    allowElemental: true,
    allowGold: false,
    allowElf: false,
    corpusNote: "Foundations / Light Magic envelope: A, Z, D, E; one hero.",
  },
  "2": {
    band: "2",
    roomCount: 6,
    heroCount: 2,
    spellCount: 1,
    allowElemental: true,
    allowGold: false,
    allowElf: true,
    corpusNote: "Band 2 authored boards are typically 6 rooms (Cross / Gold Rush / Human Beast).",
  },
  "3": {
    band: "3",
    roomCount: 6,
    heroCount: 2,
    spellCount: 1,
    allowElemental: true,
    allowGold: true,
    allowElf: true,
    corpusNote: "Band 3 authored is not a bigger board — add O interaction, keep 2 heroes.",
  },
  "4": {
    band: "4",
    roomCount: 8,
    heroCount: 2,
    spellCount: 3,
    allowElemental: true,
    allowGold: true,
    allowElf: true,
    corpusNote: "Stupidity Award envelope (8 rooms, 2 heroes, 3 spells) minus T / Gunner / Move.",
  },
};

export interface GenerateLevelInput {
  /** Authored Difficulté or band ("1"–"4"). */
  difficulty: number | string;
  /** Deterministic seed. Omitted seed is 1 (documented, not wall-clock). */
  seed?: number | string;
  /** Optional FR-46 / NFR-4 caps forwarded to checkSolvability. */
  caps?: Partial<SolvabilityCaps>;
}

export interface GeneratedLevel {
  level: LevelDef;
  text: string;
  layout: DungeonLayout;
  seed: number;
  difficulty: number;
  difficultyBand: GenerationBand;
  profile: GenerationProfile;
  /** FR-46 result on the suggested layout (Simulated, not a live probe). */
  solvability: SolvabilityResult;
}

export function isGenerationBand(value: string): value is GenerationBand {
  return (GENERATION_BANDS as readonly string[]).includes(value);
}

export function resolveGenerationBand(raw: number | string): GenerationBand {
  const numeric = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  const band = difficultyBand(numeric);
  if (!isGenerationBand(band)) {
    throw new Error(
      `generateLevel targets authored Difficulté bands ${GENERATION_BANDS.join(", ")}; got ${JSON.stringify(raw)}`,
    );
  }
  return band;
}

/** Stable uint32 seed. Numbers truncate; strings FNV-1a. */
export function hashGenerationSeed(seed: number | string | undefined): number {
  if (seed === undefined) return 1;
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intIn(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick() on empty list");
  return item;
}

function buildRooms(profile: GenerationProfile, rng: () => number, lethal: number): RoomDef[] {
  const rooms: RoomDef[] = [{ type: "A" }, { type: "D", damage: lethal }];
  while (rooms.length < profile.roomCount - 1) {
    const options: RoomDef[] = [{ type: "D", damage: intIn(rng, 1, 3) }];
    if (profile.allowElemental) options.push({ type: "E", element: "fire" });
    if (profile.allowGold) options.push({ type: "O", gold: 1 });
    rooms.push(pick(rng, options));
  }
  rooms.push({ type: "Z" });
  return rooms;
}

function buildHeroes(profile: GenerationProfile, rng: () => number, hp: number): HeroDef[] {
  const heroes: HeroDef[] = [{ type: "Warrior", hp }];
  while (heroes.length < profile.heroCount) {
    if (profile.allowElf && rng() < 0.5) {
      heroes.push({ type: "Elf", hp, immunities: ["fire"] });
    } else {
      heroes.push({ type: "Warrior", hp });
    }
  }
  return heroes;
}

function buildSpells(profile: GenerationProfile, hp: number): SpellDef[] {
  const spells: SpellDef[] = [];
  if (profile.spellCount >= 1) spells.push({ type: "Attack", damage: hp });
  if (profile.spellCount >= 2) spells.push({ type: "Banality" });
  if (profile.spellCount >= 3) spells.push({ type: "Attack", damage: hp });
  return spells;
}

/**
 * FR-5–FR-8: one 4-connected line, A first, Z last, shared orientation 0.
 * Default 4-hatch tiles match across every shared side (FR-6).
 */
export function placeGeneratedLayout(level: LevelDef): DungeonLayout {
  const supplied = enumerateSuppliedRooms(level);
  const ordered = [
    ...supplied.filter((spec) => spec.def.type === "A"),
    ...supplied.filter((spec) => spec.def.type !== "A" && spec.def.type !== "Z"),
    ...supplied.filter((spec) => spec.def.type === "Z"),
  ];
  const rooms: PlacedRoom[] = ordered.map((spec, index) => ({
    id: spec.id,
    def: spec.def,
    position: { x: index, y: 0 },
    orientation: 0,
  }));
  return { rooms, mainAId: rooms.find((room) => room.def.type === "A")?.id };
}

export function generatedCampaignEntry(generated: GeneratedLevel): CampaignEntry {
  const play = classifyCampaignPlayability(generated.level);
  return {
    id: generated.level.id,
    name: generated.level.name,
    path: `generated/${generated.level.id}.txt`,
    pack: "generated",
    difficulty: generated.difficulty,
    difficultyBand: generated.difficultyBand,
    contractId: null,
    contractName: null,
    contractCost: null,
    contractCostNote: null,
    playable: play.playable,
    unavailableReasons: play.reasons,
    needsChoix: play.needsChoix,
    text: generated.text,
  };
}

/**
 * Pure engine API: deterministic given `{ difficulty, seed }`.
 * Returns a parseable LevelDef + DSL text + a legal Maker layout.
 */
export function generateLevel(input: GenerateLevelInput): GeneratedLevel {
  const band = resolveGenerationBand(input.difficulty);
  const profile = GENERATION_PROFILES[band];
  const seed = hashGenerationSeed(input.seed);
  const rng = mulberry32(seed);

  const lethal = intIn(rng, 1, 3);
  const hp = intIn(rng, 1, lethal);
  const rooms = buildRooms(profile, rng, lethal);
  const heroes = buildHeroes(profile, rng, hp);
  const spells = buildSpells(profile, hp);

  const level: LevelDef = {
    id: `generated-${band}-${seed}`,
    name: `Generated Difficulté ${band}`,
    rooms: rooms.map((room) => ({ count: 1, room })),
    heroes,
    spells: spells.length ? spells : undefined,
    difficulty: Number(band),
  };

  const check = validateLevel(level);
  if (!check.valid) {
    throw new Error(`generateLevel produced an invalid level: ${check.errors.join("; ")}`);
  }

  const flat = flattenRooms(level.rooms);
  if (flat.some((room) => room.type === "C")) {
    throw new Error("generateLevel must not emit C rooms (FR-18 / S2).");
  }
  if (level.heroes.some((hero) => !("type" in hero) || hero.type === "Gunner")) {
    throw new Error("generateLevel skips Gunner so S3 duration cannot appear.");
  }

  const text = serializeLevel(level);
  const layout = placeGeneratedLayout(level);
  const placement = validateLayout(level, layout);
  if (!placement.canStartExtermination) {
    throw new Error(
      `generateLevel layout failed FR-5–FR-8: ${placement.issues.map((i) => i.code).join(", ")}`,
    );
  }

  const solvability = checkSolvability(level, layout, input.caps);
  return {
    level,
    text,
    layout,
    seed,
    difficulty: Number(band),
    difficultyBand: band,
    profile,
    solvability,
  };
}
