// Campaign catalog over authored fixtures (NFR-2).
// Lists non-quarantine pack text, grouped by source Difficulté.
// Does not implement FR-4 gating. C rooms (FR-18 / S2) and Gunner duration
// (S3) stay unavailable — we do not invent those rules (NFR-8).

import { CONTRACTS, type ContractRecord } from "./contracts.js";
import {
  ELEMENT_TYPES,
  flattenRooms,
  isChoixDef,
  isElementType,
  isSpellRepeat,
  substituteVariables,
  type ChoixDef,
  type ChoixVariableDef,
  type HeroSlot,
  type LevelDef,
  type PlayerChoice,
  type RoomSlot,
  type SpellSlot,
  type VariableDomain,
} from "./level.js";
import { parseLevel } from "./loader.js";
import { expandSpells } from "./spells.js";
import { enumerateSuppliedRooms } from "./placement.js";

export const UNSPECIFIED_DIFFICULTY = "unspecified";

export type CampaignPack = "base-classic" | "base-extras" | "contracts" | "other";

export type UnavailableReason = "parse_error" | "c_room" | "gunner_duration" | "unresolved";

export interface CampaignFile {
  path: string;
  text: string;
}

export interface CampaignPlayability {
  playable: boolean;
  reasons: UnavailableReason[];
  needsChoix: boolean;
}

export interface InlineChoixSlot {
  kind: "room" | "hero" | "spell";
  index: number;
  n: number;
  options: unknown[];
}

export interface InlineChoixPicks {
  rooms: number[][];
  heroes: number[][];
  spells: number[][];
}

export interface CampaignEntry {
  id: string;
  name: string;
  path: string;
  pack: CampaignPack;
  difficulty: number | string | null;
  difficultyBand: string;
  contractId: string | null;
  contractName: string | null;
  contractCost: number | null;
  contractCostNote: string | null;
  playable: boolean;
  unavailableReasons: UnavailableReason[];
  needsChoix: boolean;
  text: string;
}

export function isQuarantineFixturePath(path: string): boolean {
  return /(?:^|[\\/])quarantine(?:[\\/]|$)/i.test(path.replace(/\\/g, "/"));
}

export function campaignPackFromPath(path: string): CampaignPack {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.includes("base-classic")) return "base-classic";
  if (normalized.includes("base-extras")) return "base-extras";
  if (normalized.includes("/contracts/") || normalized.startsWith("contracts/")) {
    return "contracts";
  }
  return "other";
}

/** Source Difficulté / Difficulty line only — same keywords as the loader. */
export function parseDifficultyFromText(text: string): number | string | undefined {
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^(?:difficult[eé]|difficulty)\s*:\s*(.*)$/i);
    if (!match) continue;
    const raw = (match[1] ?? "").trim();
    if (!raw) return undefined;
    const num = Number(raw);
    return !Number.isNaN(num) && String(num) === raw ? num : raw;
  }
  return undefined;
}

export function difficultyBand(raw: number | string | undefined | null): string {
  if (raw === undefined || raw === null || raw === "") return UNSPECIFIED_DIFFICULTY;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  const leading = String(raw)
    .trim()
    .match(/^(\d+)/);
  return leading?.[1] ?? UNSPECIFIED_DIFFICULTY;
}

export function unavailableReasonLabel(reason: UnavailableReason): string {
  switch (reason) {
    case "c_room":
      return "C room (FR-18 deferred)";
    case "gunner_duration":
      return "Gunner duration (S3 deferred)";
    case "unresolved":
      return "Unresolved authored tokens";
    case "parse_error":
      return "Unparseable fixture";
  }
}

export function authoredCampaignContracts(
  contracts: readonly ContractRecord[] = CONTRACTS,
): ContractRecord[] {
  return contracts.filter((c) => !c.stub && c.levelIds.length > 0);
}

/** Domains this slice can actually pick — not source shorthands like ℕ* / éléments / Π. */
const OPAQUE_DOMAIN = /^(ℕ\*|N\*|éléments|elements|Π|pi)$/iu;
const ROOM_KEY = /^[AZDEPOTC](\(.*\))?$/;

export function isBindableDomain(domain: VariableDomain): boolean {
  if (domain === "N" || domain === "R") return true;
  if (!Array.isArray(domain) || domain.length === 0) return false;
  return domain.every((item) => {
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "boolean") return true;
    if (item && typeof item === "object") return true;
    if (typeof item !== "string") return false;
    if (OPAQUE_DOMAIN.test(item)) return false;
    if (/choix\s*\(/i.test(item)) return false;
    return true;
  });
}

function namedChoixNames(level: LevelDef): Set<string> {
  return new Set((level.variables ?? []).filter((v) => isBindableDomain(v.domain)).map((v) => v.name));
}

function addToken(tokens: Set<string>, value: number | string | undefined): void {
  if (typeof value === "string" && value !== "inf" && value !== "∞") tokens.add(value);
}

function addElementToken(tokens: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  if (!isElementType(value) && !(ELEMENT_TYPES as readonly string[]).includes(value)) {
    tokens.add(value);
  }
}

function walkRoomSlot(room: RoomSlot, tokens: Set<string>, flags: Set<UnavailableReason>): void {
  if (isChoixDef(room)) {
    addToken(tokens, typeof room.n === "string" ? room.n : room.n);
    for (const opt of room.options) walkRoomSlot(opt, tokens, flags);
    return;
  }
  if (room.type === "C") flags.add("c_room");
  if (room.type === "D") addToken(tokens, room.damage);
  if (room.type === "O") addToken(tokens, room.gold);
  if (room.type === "P") addToken(tokens, room.entries);
  if (room.type === "E") addElementToken(tokens, room.element);
  if (room.type === "T") {
    addToken(tokens, room.cost);
    addElementToken(tokens, room.element);
  }
}

function walkHeroSlot(hero: HeroSlot, tokens: Set<string>, flags: Set<UnavailableReason>): void {
  if (isChoixDef(hero)) {
    addToken(tokens, typeof hero.n === "string" ? hero.n : hero.n);
    for (const opt of hero.options) walkHeroSlot(opt, tokens, flags);
    return;
  }
  addToken(tokens, hero.hp);
  if (hero.type === "Gunner") {
    addToken(tokens, hero.shots);
    if (hero.duration !== undefined) flags.add("gunner_duration");
  }
  if (hero.type === "Mechanic") {
    for (const [key, value] of Object.entries(hero.powerSteps)) {
      if (!ROOM_KEY.test(key)) addToken(tokens, key);
      addToken(tokens, value);
    }
  }
  if (hero.type === "Princess") {
    addToken(tokens, hero.pull);
    for (const [key, value] of Object.entries(hero.weights)) {
      if (!ROOM_KEY.test(key)) addToken(tokens, key);
      addToken(tokens, value);
    }
  }
}

function walkSpellSlot(spell: SpellSlot, tokens: Set<string>, flags: Set<UnavailableReason>): void {
  if (isChoixDef(spell)) {
    addToken(tokens, typeof spell.n === "string" ? spell.n : spell.n);
    for (const opt of spell.options) walkSpellSlot(opt, tokens, flags);
    return;
  }
  if (isSpellRepeat(spell)) {
    addToken(tokens, spell.count);
    walkSpellSlot(spell.spell, tokens, flags);
    return;
  }
  if (spell.type === "Attack") addToken(tokens, spell.damage);
  if (spell.type === "Teleport") addToken(tokens, spell.steps);
}

function hasInlineChoix(level: LevelDef): boolean {
  if (level.rooms.some((m) => isChoixDef(m.room))) return true;
  if (level.heroes.some((h) => isChoixDef(h))) return true;
  if ((level.spells ?? []).some((s) => isChoixDef(s) || (isSpellRepeat(s) && isChoixDef(s.spell)))) {
    return true;
  }
  return false;
}

function walkLevelTokens(
  level: LevelDef,
  tokens: Set<string>,
  flags: Set<UnavailableReason>,
): void {
  for (const m of level.rooms) {
    addToken(tokens, typeof m.count === "string" ? m.count : m.count);
    walkRoomSlot(m.room, tokens, flags);
  }
  for (const hero of level.heroes) walkHeroSlot(hero, tokens, flags);
  for (const spell of level.spells ?? []) walkSpellSlot(spell, tokens, flags);
}

/** Classify whether the Maker can start a Simulated run without inventing deferred rules. */
export function classifyCampaignPlayability(level: LevelDef): CampaignPlayability {
  const flags = new Set<UnavailableReason>();
  const tokens = new Set<string>();
  walkLevelTokens(level, tokens, flags);
  const names = namedChoixNames(level);
  for (const token of tokens) {
    if (!names.has(token)) flags.add("unresolved");
  }
  const canFlatten =
    !level.rooms.some((m) => isChoixDef(m.room)) &&
    level.rooms.every((m) => typeof m.count === "number");
  if (canFlatten) {
    try {
      const flat = flattenRooms(level.rooms);
      if (!flat.some((r) => r.type === "A") || !flat.some((r) => r.type === "Z")) {
        flags.add("unresolved");
      }
    } catch {
      flags.add("unresolved");
    }
  }
  const needsChoix =
    (level.variables ?? []).some((v) => isBindableDomain(v.domain)) || hasInlineChoix(level);
  if (flags.size === 0) {
    const prepared = tryPrepareCampaignLevel(level);
    if (!prepared.ok) flags.add("unresolved");
  }
  const reasons = [...flags];
  return { playable: reasons.length === 0, reasons, needsChoix };
}

function bindStringLeaves(value: unknown, map: Record<string, unknown>): unknown {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  if (Array.isArray(value)) return value.map((item) => bindStringLeaves(item, map));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = bindStringLeaves(child, map);
    }
    return out;
  }
  return value;
}

function choiceValue(choice: PlayerChoice): unknown {
  return choice.selected.length === 1 ? choice.selected[0] : choice.selected;
}

/** FR-2: bind named choix, including authored `λ*Spell` counts stored as the name string. */
export function bindNamedChoix(
  level: LevelDef,
  choices: Record<string, PlayerChoice>,
): LevelDef {
  const substituted = Object.keys(choices).length ? substituteVariables(level, choices) : level;
  const map: Record<string, unknown> = {};
  for (const [name, choice] of Object.entries(choices)) {
    map[name] = choiceValue(choice);
  }
  const bound = bindStringLeaves(substituted, map) as LevelDef;
  return { ...bound, variables: undefined };
}

export function listInlineChoixSlots(level: LevelDef): InlineChoixSlot[] {
  const slots: InlineChoixSlot[] = [];
  level.rooms.forEach((m, index) => {
    if (!isChoixDef(m.room) || typeof m.room.n !== "number") return;
    slots.push({ kind: "room", index, n: m.room.n, options: m.room.options });
  });
  level.heroes.forEach((hero, index) => {
    if (!isChoixDef(hero) || typeof hero.n !== "number") return;
    slots.push({ kind: "hero", index, n: hero.n, options: hero.options });
  });
  (level.spells ?? []).forEach((spell, index) => {
    if (!isChoixDef(spell) || typeof spell.n !== "number") return;
    slots.push({ kind: "spell", index, n: spell.n, options: spell.options });
  });
  return slots;
}

function pickChoix<T>(slot: ChoixDef<T>, indices: readonly number[]): T[] {
  return indices.map((i) => {
    const opt = slot.options[i];
    if (opt === undefined) {
      throw new Error(`Choix pick ${i} is outside 0..${slot.options.length - 1}`);
    }
    return structuredClone(opt);
  });
}

function resolveRoomList(level: LevelDef, picks: number[][]): LevelDef["rooms"] {
  return level.rooms.flatMap((m, index) => {
    if (!isChoixDef(m.room)) return [m];
    const chosen = pickChoix(m.room, picks[index] ?? []);
    return chosen.map((room) => ({ count: m.count, room }));
  });
}

function resolveHeroList(level: LevelDef, picks: number[][]): LevelDef["heroes"] {
  return level.heroes.flatMap((hero, index) => {
    if (!isChoixDef(hero)) return [hero];
    return pickChoix(hero, picks[index] ?? []);
  });
}

function resolveSpellList(level: LevelDef, picks: number[][]): LevelDef["spells"] {
  if (!level.spells) return undefined;
  return level.spells.flatMap((spell, index) => {
    if (!isChoixDef(spell)) return [spell];
    return pickChoix(spell, picks[index] ?? []);
  });
}

/** FR-2: replace inline `choix(n, E)` room/hero/spell slots with the player's picks. */
export function resolveInlineChoix(level: LevelDef, picks: InlineChoixPicks): LevelDef {
  return {
    ...level,
    rooms: resolveRoomList(level, picks.rooms),
    heroes: resolveHeroList(level, picks.heroes),
    spells: resolveSpellList(level, picks.spells),
  };
}

export function defaultNamedChoices(level: LevelDef): Record<string, PlayerChoice> {
  const out: Record<string, PlayerChoice> = {};
  for (const variable of level.variables ?? []) {
    if (!isBindableDomain(variable.domain)) continue;
    out[variable.name] = defaultChoiceFor(variable);
  }
  return out;
}

export function defaultChoiceFor(variable: ChoixVariableDef): PlayerChoice {
  const selected: unknown[] = [];
  if (variable.domain === "N" || variable.domain === "R") {
    for (let i = 0; i < variable.n; i++) selected.push(1);
  } else if (Array.isArray(variable.domain)) {
    for (let i = 0; i < variable.n; i++) {
      const item = variable.domain[variable.allowRepeats ? 0 : i] ?? variable.domain[0];
      if (item === undefined) {
        throw new Error(`Variable "${variable.name}" domain is empty.`);
      }
      selected.push(item);
    }
  }
  return { variableName: variable.name, selected };
}

export function defaultInlinePicks(level: LevelDef): InlineChoixPicks {
  const rooms: number[][] = level.rooms.map((m) =>
    isChoixDef(m.room) && typeof m.room.n === "number"
      ? Array.from({ length: m.room.n }, (_, i) => i)
      : [],
  );
  const heroes: number[][] = level.heroes.map((hero) =>
    isChoixDef(hero) && typeof hero.n === "number"
      ? Array.from({ length: hero.n }, (_, i) => i)
      : [],
  );
  const spells: number[][] = (level.spells ?? []).map((spell) =>
    isChoixDef(spell) && typeof spell.n === "number"
      ? Array.from({ length: spell.n }, (_, i) => i)
      : [],
  );
  return { rooms, heroes, spells };
}

export function prepareCampaignLevel(
  level: LevelDef,
  named: Record<string, PlayerChoice> = defaultNamedChoices(level),
  inline: InlineChoixPicks = defaultInlinePicks(level),
): LevelDef {
  return resolveInlineChoix(bindNamedChoix(level, named), inline);
}

export function tryPrepareCampaignLevel(
  level: LevelDef,
  named: Record<string, PlayerChoice> = defaultNamedChoices(level),
  inline: InlineChoixPicks = defaultInlinePicks(level),
): { ok: true; level: LevelDef } | { ok: false; error: string } {
  try {
    const prepared = prepareCampaignLevel(level, named, inline);
    enumerateSuppliedRooms(prepared);
    for (const hero of prepared.heroes) {
      if (isChoixDef(hero)) throw new Error("Unresolved hero choix.");
      if (typeof hero.hp !== "number") throw new Error(`Unresolved HP "${hero.hp}".`);
      if (hero.type === "Gunner" && hero.duration !== undefined) {
        throw new Error("Gunner duration is deferred (S3).");
      }
    }
    expandSpells(prepared.spells);
    if (prepared.rooms.some((m) => !isChoixDef(m.room) && m.room.type === "C")) {
      throw new Error("C room (FR-18 deferred).");
    }
    return { ok: true, level: prepared };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function headerId(text: string): string | undefined {
  const match = text.match(/^id:\s*(.+)$/m);
  return match?.[1]?.trim();
}

function headerName(text: string): string | undefined {
  const niveau = text.match(/^Niveau\s+\d+(?:\.\d+)?\s*:\s*(.*)$/im);
  if (niveau?.[1]) {
    const title = niveau[1].trim().replace(/^["“]|["”]$/g, "").trim();
    if (title) return title;
  }
  const named = text.match(/^(?:level|name):\s*(.+)$/im);
  return named?.[1]?.trim();
}

function lookupContract(
  level: LevelDef,
  contracts: readonly ContractRecord[],
): ContractRecord | undefined {
  const byId = contracts.find((c) => !c.stub && c.levelIds.includes(level.id));
  if (byId) return byId;
  if (level.contractId) {
    return contracts.find((c) => c.id === level.contractId);
  }
  return undefined;
}

export function buildCampaignCatalog(
  files: readonly CampaignFile[],
  contracts: readonly ContractRecord[] = CONTRACTS,
): CampaignEntry[] {
  const entries: CampaignEntry[] = [];
  for (const file of files) {
    if (isQuarantineFixturePath(file.path)) continue;
    if (file.path.replace(/\\/g, "/").includes("sponsor-extract/")) continue;

    let level: LevelDef | undefined;
    let parseError = false;
    try {
      level = parseLevel(file.text);
    } catch {
      parseError = true;
    }

    const id = level?.id && level.id !== "level-0" ? level.id : (headerId(file.text) ?? file.path);
    const name = level?.name && level.name !== "Untitled Level" ? level.name : (headerName(file.text) ?? id);
    const difficulty = level?.difficulty ?? parseDifficultyFromText(file.text) ?? null;
    const play = level
      ? classifyCampaignPlayability(level)
      : { playable: false, reasons: ["parse_error"] as UnavailableReason[], needsChoix: false };
    const reasons = parseError ? (["parse_error"] as UnavailableReason[]) : play.reasons;
    const contract = level ? lookupContract(level, contracts) : undefined;

    entries.push({
      id,
      name,
      path: file.path,
      pack: campaignPackFromPath(file.path),
      difficulty,
      difficultyBand: difficultyBand(difficulty ?? undefined),
      contractId: contract?.id ?? level?.contractId ?? null,
      contractName: contract && !contract.stub ? contract.name : null,
      contractCost: contract && !contract.stub ? contract.costPoints : null,
      contractCostNote: contract && !contract.stub ? contract.costNote : null,
      playable: reasons.length === 0,
      unavailableReasons: reasons,
      needsChoix: play.needsChoix,
      text: file.text,
    });
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
}

export function groupCampaignByDifficulty(
  entries: readonly CampaignEntry[],
): { band: string; entries: CampaignEntry[] }[] {
  const groups = new Map<string, CampaignEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.difficultyBand) ?? [];
    list.push(entry);
    groups.set(entry.difficultyBand, list);
  }
  const bands = [...groups.keys()].sort((a, b) => {
    if (a === UNSPECIFIED_DIFFICULTY) return 1;
    if (b === UNSPECIFIED_DIFFICULTY) return -1;
    return Number(a) - Number(b);
  });
  return bands.map((band) => ({ band, entries: groups.get(band) ?? [] }));
}

export function emptyInlinePicks(): InlineChoixPicks {
  return { rooms: [], heroes: [], spells: [] };
}
