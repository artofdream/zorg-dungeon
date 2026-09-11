// Implements FR-1: Level data model parser (rooms with multiplicities, ordered hero
// spawn list, optional spell list, constraints, bonuses, variables).
// Implements FR-2: Parser for choix(n, E) player-chosen variables.
// Implements FR-3: Parser for order and orientation options on choix(n, E).
// FR-9: Mirror / M′ / Monde miroir blocks become level.mirrorWorlds.
// Supports NFR-2 (Data-driven content) and NFR-9 (Authoring ergonomics).

import {
  BonusDef,
  ChoixVariableDef,
  ConstraintDef,
  ElementType,
  flattenRooms,
  HeroSlot,
  HeroType,
  isChoixDef,
  isSpellRepeat,
  LevelDef,
  RoomMultiplicity,
  RoomSlot,
  RoomType,
  SpellDef,
  SpellSlot,
  SpellType,
} from "./level.js";

/** Split on separators only at brace/paren depth 0. */
export function splitTopLevel(text: string, separator = ","): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? "";
    if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") depth--;
    else if (char === separator && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function foldKey(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const ELEMENT_ALIASES: Record<string, ElementType> = {
  fire: "fire",
  feu: "fire",
  water: "water",
  eau: "water",
  ice: "ice",
  glace: "ice",
  poison: "poison",
};

function canonicalizeElement(raw: string): ElementType | string {
  const key = foldKey(raw.trim());
  return ELEMENT_ALIASES[key] ?? raw.trim();
}

const HERO_ALIASES: Record<string, HeroType> = {
  warrior: "Warrior",
  guerrier: "Warrior",
  elf: "Elf",
  elfe: "Elf",
  gunner: "Gunner",
  artilleur: "Gunner",
  mechanic: "Mechanic",
  mecanicien: "Mechanic",
  princess: "Princess",
  princesse: "Princess",
};

function canonicalizeHeroType(raw: string): HeroType | string {
  return HERO_ALIASES[foldKey(raw)] ?? raw;
}

const SPELL_ALIASES: Record<string, SpellType> = {
  attack: "Attack",
  attaque: "Attack",
  teleport: "Teleport",
  teleportation: "Teleport",
  move: "Move",
  deplacement: "Move",
  swap: "Swap",
  echange: "Swap",
  selection: "Selection",
  sleep: "Sleep",
  somnolence: "Sleep",
  wake: "Wake",
  reveil: "Wake",
  banality: "Banality",
  banalite: "Banality",
};

function canonicalizeSpellType(raw: string): SpellType | string {
  return SPELL_ALIASES[foldKey(raw)] ?? raw;
}

function isChoixToken(token: string): boolean {
  return /^choix\s*\(/i.test(token.trim());
}

function parseChoixRaw(token: string): { n: number | string; items: string[] } {
  const trimmed = token.trim();
  const match = trimmed.match(/^choix\s*\(\s*(.+)\)$/is);
  if (!match?.[1]) {
    throw new Error(`Invalid choix expression: "${trimmed}"`);
  }
  const parts = splitTopLevel(match[1]);
  const nRaw = parts[0] ?? "1";
  const n = Number.isNaN(Number(nRaw)) ? nRaw : Number(nRaw);
  const domainPart = parts[1] ?? "";
  let items: string[];
  if (
    (domainPart.startsWith("{") && domainPart.endsWith("}")) ||
    (domainPart.startsWith("[") && domainPart.endsWith("]"))
  ) {
    items = splitTopLevel(domainPart.slice(1, -1));
  } else {
    items = domainPart ? [domainPart] : [];
  }
  return { n, items };
}

function parseDict(raw: string): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  const trimmed = raw.trim();
  try {
    Object.assign(out, JSON.parse(trimmed));
    return out;
  } catch {
    try {
      const jsonLike = trimmed.replace(/([a-zA-Z0-9_]+):/g, '"$1":');
      Object.assign(out, JSON.parse(jsonLike));
      return out;
    } catch {
      const pairs = trimmed.replace(/[{}]/g, "").split(",");
      for (const pair of pairs) {
        const [k, v] = pair.split(":").map((s) => s.trim());
        if (k && v) out[k] = Number.isNaN(Number(v)) ? v : Number(v);
      }
      return out;
    }
  }
}

function unquoteTitle(raw: string): string {
  const t = raw.trim();
  if (/^[“"«].+[”"»]$/.test(t)) return t.slice(1, -1);
  return t;
}

/** FR-1: Parse a room token, e.g. "A", "Z", "D(5)", "E(fire)", "P(3, i->i)", "O(10)", "T(5, ice)", "C(1)". */
export function parseRoom(token: string): RoomSlot {
  const trimmed = token.trim();
  if (isChoixToken(trimmed)) {
    const { n, items } = parseChoixRaw(trimmed);
    return { type: "Choix", n, options: items.map((item) => parseRoom(item)) };
  }
  if (trimmed === "A") return { type: "A" };
  if (trimmed === "Z") return { type: "Z" };

  const match = trimmed.match(/^([A-Z])\((.*)\)$/s);
  if (!match || !match[1]) {
    throw new Error(`Invalid room specification: "${trimmed}"`);
  }

  const typeChar = match[1];
  const rawArgs = match[2] ?? "";
  const args = splitTopLevel(rawArgs);

  switch (typeChar as RoomType) {
    case "D": {
      const dmg = Number(args[0]);
      return { type: "D", damage: Number.isNaN(dmg) ? (args[0] ?? 0) : dmg };
    }
    case "E": {
      return { type: "E", element: canonicalizeElement(args[0] ?? "fire") };
    }
    case "P": {
      const entries = Number(args[0]);
      const formula = args.slice(1).join(",").trim();
      return {
        type: "P",
        entries: Number.isNaN(entries) ? (args[0] ?? 1) : entries,
        formula: formula || "i->i",
      };
    }
    case "O": {
      const gold = Number(args[0]);
      return { type: "O", gold: Number.isNaN(gold) ? (args[0] ?? 0) : gold };
    }
    case "T": {
      const cost = Number(args[0]);
      const element = canonicalizeElement(args[1] ?? "fire");
      return {
        type: "T",
        cost: Number.isNaN(cost) ? (args[0] ?? 0) : cost,
        element,
      };
    }
    case "C": {
      // S2 / NFR-8: C is undefined in the rooms chapter. Keep args opaque.
      return {
        type: "C",
        args: args.map((a) => (Number.isNaN(Number(a)) ? a : Number(a))),
      };
    }
    default:
      throw new Error(`Unknown room type: "${typeChar}"`);
  }
}

/** FR-1: Parse a room list with multiplicities, e.g. "2 A, 1 Z, 3 D(2), E(fire)" */
export function parseRooms(text: string): RoomMultiplicity[] {
  if (!text.trim()) return [];

  // Split on comma not inside parentheses
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") depth--;
    else if ((char === "," || char === "\n") && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) tokens.push(current.trim());

  return tokens.map((tok) => {
    // Check for multiplicity prefix like "2 A", "3*D(2)", "2x Z", "3 * D(2)"
    const multMatch =
      tok.match(/^(\d+)\s*(?:\*|x)\s*(.+)$/i) || tok.match(/^(\d+)\s+(.+)$/);
    if (multMatch && multMatch[1] && multMatch[2]) {
      const count = parseInt(multMatch[1], 10);
      const room = parseRoom(multMatch[2]);
      return { count, room };
    }
    return { count: 1, room: parseRoom(tok) };
  });
}

/** FR-1: Parse a hero definition, e.g. "Warrior(10)", "Elf(8, [fire, water])", "Gunner(6, 3)" */
export function parseHero(token: string): HeroSlot {
  const trimmed = token.trim();
  if (isChoixToken(trimmed)) {
    const { n, items } = parseChoixRaw(trimmed);
    return { type: "Choix", n, options: items.map((item) => parseHero(item)) };
  }
  const match = trimmed.match(/^(\p{L}[\p{L}\p{M}\d]*)\((.*)\)$/su);
  if (!match || !match[1]) {
    throw new Error(`Invalid hero specification: "${trimmed}"`);
  }

  const heroName = canonicalizeHeroType(match[1]);
  const rawArgs = match[2] ?? "";
  const args = splitTopLevel(rawArgs);

  const hp = Number.isNaN(Number(args[0])) ? (args[0] ?? 1) : Number(args[0]);

  switch (heroName as HeroType) {
    case "Warrior":
      return { type: "Warrior", hp };
    case "Elf": {
      let immunities: (ElementType | string)[] = [];
      if (args[1]) {
        const raw = args[1].replace(/[\[\]{}]/g, "");
        immunities = raw
          .split(/[,+]/)
          .map((s) => canonicalizeElement(s.trim()))
          .filter(Boolean);
      }
      return { type: "Elf", hp, immunities };
    }
    case "Gunner": {
      // S3 / NFR-8: accept optional 3rd arg; do not encode duration semantics.
      let shots: number | string;
      if (args[1] === "inf" || args[1] === "∞") {
        shots = "inf";
      } else {
        shots = Number.isNaN(Number(args[1])) ? (args[1] ?? 1) : Number(args[1]);
      }
      let duration: number | string | "inf" | undefined = undefined;
      if (args[2]) {
        if (args[2] === "inf" || args[2] === "∞") {
          duration = "inf";
        } else {
          const d = Number(args[2]);
          duration = Number.isNaN(d) ? args[2] : d;
        }
      }
      return { type: "Gunner", hp, shots, duration };
    }
    case "Mechanic": {
      const powerSteps = args[1] ? parseDict(args[1]) : {};
      return { type: "Mechanic", hp, powerSteps };
    }
    case "Princess": {
      const weights: Record<string, number | string> = { Z: 1 };
      if (args[1]) Object.assign(weights, parseDict(args[1]));
      const pull = args[2] ? (Number.isNaN(Number(args[2])) ? args[2] : Number(args[2])) : 1;
      return { type: "Princess", hp, weights, pull };
    }
    default:
      throw new Error(`Unknown hero type: "${match[1]}"`);
  }
}

/** FR-1: Parse an ordered hero spawn list. */
export function parseHeroes(text: string): HeroSlot[] {
  if (!text.trim()) return [];
  const tokens = splitTopLevel(text.replace(/\n/g, ","));
  return tokens.map((tok) => parseHero(tok));
}

/** FR-1: Parse a spell definition, e.g. "Attack(3)", "Teleport(2)", "Move", "Selection(false)". */
export function parseSpell(token: string): SpellDef {
  const trimmed = token.trim();
  const match = trimmed.match(/^(\p{L}[\p{L}\p{M}\d]*)(?:\((.*)\))?$/su);
  if (!match || !match[1]) {
    throw new Error(`Invalid spell specification: "${trimmed}"`);
  }

  const spellName = canonicalizeSpellType(match[1]);
  const rawArgs = match[2] ?? "";
  const args = splitTopLevel(rawArgs);

  switch (spellName as SpellType) {
    case "Attack":
      return {
        type: "Attack",
        damage: Number.isNaN(Number(args[0])) ? (args[0] ?? 1) : Number(args[0]),
      };
    case "Teleport":
      return {
        type: "Teleport",
        steps: Number.isNaN(Number(args[0])) ? (args[0] ?? 1) : Number(args[0]),
      };
    case "Move":
      return { type: "Move" };
    case "Swap":
      return { type: "Swap" };
    case "Selection":
      return {
        type: "Selection",
        allowCorpses: args[0] === "true" || args[0] === "1",
      };
    case "Sleep":
      return { type: "Sleep" };
    case "Wake":
      return { type: "Wake" };
    case "Banality":
      return { type: "Banality" };
    default:
      throw new Error(`Unknown spell type: "${match[1]}"`);
  }
}

/** Parse a spell list item, including `choix(...)` and `λ*Somnolence` repeats. */
export function parseSpellEntry(token: string): SpellSlot {
  const trimmed = token.trim();
  if (isChoixToken(trimmed)) {
    const { n, items } = parseChoixRaw(trimmed);
    return { type: "Choix", n, options: items.map((item) => parseSpellEntry(item)) };
  }
  const repeat = trimmed.match(/^([^\s*x]+)\s*[*x]\s*(\p{L}.*)$/iu);
  if (repeat?.[1] && repeat[2] && !/^[A-Za-z]/u.test(repeat[1])) {
    const countRaw = repeat[1];
    const count = Number.isNaN(Number(countRaw)) ? countRaw : Number(countRaw);
    const inner = parseSpellEntry(repeat[2]);
    if (inner.type === "Choix" || inner.type === "Repeat") {
      throw new Error(`Nested spell multiplicity is not supported: "${trimmed}"`);
    }
    return { type: "Repeat", count, spell: inner };
  }
  return parseSpell(trimmed);
}

/** FR-1: Parse a one-time spell list. */
export function parseSpells(text: string): SpellSlot[] {
  if (!text.trim()) return [];
  const tokens = splitTopLevel(text.replace(/\n/g, ","));
  return tokens.map((tok) => parseSpellEntry(tok));
}

/**
 * FR-2 & FR-3: Parse a variable definition, e.g.:
 * "X = choix(1, {1, 2, 3})"
 * "Y = choix(2, [A, Z], order=true, orientation=true)"
 * "Z = choix(1, N)"
 * "L = choix(3, liste(1, 2, 3))"
 */
export function parseVariable(line: string): ChoixVariableDef {
  const trimmed = line.trim();
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) {
    throw new Error(`Variable definition missing '=' in: "${trimmed}"`);
  }

  const name = trimmed.slice(0, eqIndex).trim();
  const rest = trimmed.slice(eqIndex + 1).trim();

  const choixMatch = rest.match(/^choix\s*\(\s*(\d+)\s*,\s*(.+)\)$/s);
  if (!choixMatch || !choixMatch[1] || !choixMatch[2]) {
    throw new Error(`Expected choix(n, E) expression, got: "${rest}"`);
  }

  const n = parseInt(choixMatch[1], 10);
  const rawBody = choixMatch[2].trim();

  let allowRepeats = false;
  let captureOrder = false;
  let captureOrientation = false;

  // Tokenize rawBody by comma at depth 0
  const parts: string[] = [];
  let curr = "";
  let d = 0;
  for (let i = 0; i < rawBody.length; i++) {
    const c = rawBody[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    else if (c === "," && d === 0) {
      if (curr.trim()) parts.push(curr.trim());
      curr = "";
      continue;
    }
    curr += c;
  }
  if (curr.trim()) parts.push(curr.trim());

  const domainPart = parts[0] ?? "";
  const optionParts = parts.slice(1);
  for (const opt of optionParts) {
    if (/^order(?:=true)?$/i.test(opt)) captureOrder = true;
    if (/^orientation(?:=true)?$/i.test(opt)) captureOrientation = true;
  }

  let domain: any;
  if (domainPart === "N" || domainPart === "ℕ") {
    domain = "N";
  } else if (domainPart === "R" || domainPart === "ℝ") {
    domain = "R";
  } else if (domainPart.startsWith("liste(") && domainPart.endsWith(")")) {
    allowRepeats = true;
    const inner = domainPart.slice(6, -1).trim();
    domain = inner.split(",").map((s) => {
      const t = s.trim();
      return Number.isNaN(Number(t)) ? t : Number(t);
    });
  } else if (
    (domainPart.startsWith("{") && domainPart.endsWith("}")) ||
    (domainPart.startsWith("[") && domainPart.endsWith("]"))
  ) {
    const inner = domainPart.slice(1, -1).trim();
    domain = inner.split(",").map((s) => {
      const t = s.trim();
      return Number.isNaN(Number(t)) ? t : Number(t);
    });
  } else {
    // Single or fallback
    domain = [domainPart];
  }

  return {
    name,
    n,
    domain,
    allowRepeats,
    captureOrder,
    captureOrientation,
  };
}

/** FR-2: Parse a multi-line variables block (also `λ = choix(...), μ = choix(...)`). */
export function parseVariables(text: string): ChoixVariableDef[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const defs = splitTopLevel(lines.join(", "));
  return defs.map((l) => parseVariable(l));
}

function appendListed(
  list: { id: string; expression: string }[],
  prefix: string,
  line: string,
): void {
  const cleaned = line.replace(/^-\s*/, "").trim();
  if (!cleaned) return;
  const last = list[list.length - 1];
  if (last && !/^-/.test(line.trim())) {
    last.expression = `${last.expression}\n${cleaned}`;
    return;
  }
  list.push({ id: `${prefix}-${list.length + 1}`, expression: cleaned });
}

/** FR-9: split `Mirror:` / `M':` / `Monde miroir:` blocks from the parent DSL. */
function mirrorHeaderLabel(trimmed: string): string | null {
  const named = trimmed.match(/^(?:mirror(?:\s+world)?|monde miroir)(?:\s+(.+?))?\s*:\s*$/i);
  if (named) {
    const label = (named[1] ?? "").trim();
    return label || "M'";
  }
  const primes = trimmed.match(/^M([′'ʼʹ″‴‛]+)\s*:\s*$/);
  if (primes?.[1]) return `M${primes[1]}`;
  return null;
}

function extractMirrorBlocks(dsl: string): { head: string; mirrors: { label: string; body: string }[] } {
  const head: string[] = [];
  const mirrors: { label: string; body: string[] }[] = [];
  let current: { label: string; body: string[] } | undefined;
  for (const line of dsl.split("\n")) {
    const label = mirrorHeaderLabel(line.trim());
    if (label !== null) {
      current = { label, body: [] };
      mirrors.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else head.push(line);
  }
  return {
    head: head.join("\n"),
    mirrors: mirrors.map((m) => ({ label: m.label, body: m.body.join("\n") })),
  };
}

/** FR-1: Parse a multi-line level definition DSL (English or base-classic French). */
export function parseLevel(dsl: string): LevelDef {
  const { head, mirrors } = extractMirrorBlocks(dsl);
  const parsed = parseLevelBody(head);
  if (mirrors.length > 0) {
    parsed.mirrorWorlds = mirrors.map((block, i) => {
      const child = parseLevel(block.body);
      const fallback = `${parsed.id}-${block.label.replace(/\s+/g, "-") || `M${"'".repeat(i + 1)}`}`;
      if (child.id === "level-0") child.id = fallback;
      if (child.name === "Untitled Level") child.name = block.label || fallback;
      return child;
    });
  }
  return parsed;
}

function parseLevelBody(dsl: string): LevelDef {
  const lines = dsl.split("\n");
  let id = "level-0";
  let name = "Untitled Level";
  let contractId: string | undefined = undefined;
  let difficulty: number | string | undefined = undefined;

  let roomsText = "";
  let heroesText = "";
  let spellsText = "";
  let variablesText = "";
  const constraints: ConstraintDef[] = [];
  const bonuses: BonusDef[] = [];
  const variants: BonusDef[] = [];

  let currentSection:
    | "none"
    | "rooms"
    | "heroes"
    | "spells"
    | "variables"
    | "constraints"
    | "bonuses"
    | "variants" = "none";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const niveauMatch = trimmed.match(/^Niveau\s+(\d+)\s*:\s*(.+)$/i);
    if (niveauMatch?.[1] && niveauMatch[2]) {
      id = `base-classic-${niveauMatch[1]}`;
      name = unquoteTitle(niveauMatch[2]);
      currentSection = "none";
      continue;
    }

    // Header checks
    const idMatch = trimmed.match(/^id:\s*(.+)$/i);
    if (idMatch && idMatch[1]) {
      id = idMatch[1].trim();
      continue;
    }
    const nameMatch = trimmed.match(/^(?:level|name):\s*(.+)$/i);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
      continue;
    }
    const contractMatch = trimmed.match(/^contract(?:Id)?:\s*(.+)$/i);
    if (contractMatch && contractMatch[1]) {
      contractId = contractMatch[1].trim();
      continue;
    }

    const difficultyMatch = trimmed.match(/^(?:difficult[eé]|difficulty)\s*:\s*(.*)$/i);
    if (difficultyMatch) {
      const raw = (difficultyMatch[1] ?? "").trim();
      if (raw) {
        const num = Number(raw);
        difficulty = !Number.isNaN(num) && String(num) === raw ? num : raw;
      }
      currentSection = "none";
      continue;
    }

    // Section headers (English + French manual keywords)
    if (/^(?:salles|rooms|pi|Π)\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "rooms";
      const inline = trimmed.replace(/^(?:salles|rooms|pi|Π)\s*:\s*/i, "");
      if (inline) roomsText += (roomsText ? ", " : "") + inline;
      continue;
    }
    if (/^(?:h[eé]ros|heroes|gamma|Γ)\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "heroes";
      const inline = trimmed.replace(/^(?:h[eé]ros|heroes|gamma|Γ)\s*:\s*/i, "");
      if (inline) heroesText += (heroesText ? ", " : "") + inline;
      continue;
    }
    if (/^(?:sortil[eè]ges?|spells|phi|Φ)\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "spells";
      const inline = trimmed.replace(/^(?:sortil[eè]ges?|spells|phi|Φ)\s*:\s*/i, "");
      if (inline) spellsText += (spellsText ? ", " : "") + inline;
      continue;
    }
    if (/^variables?\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "variables";
      const inline = trimmed.replace(/^variables?\s*:\s*/i, "");
      if (inline) variablesText += "\n" + inline;
      continue;
    }
    if (/^(?:contrainte suppl[eé]mentaire|contraintes?|constraints?)\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "constraints";
      const inline = trimmed.replace(
        /^(?:contrainte suppl[eé]mentaire|contraintes?|constraints?)\s*:\s*/i,
        "",
      );
      if (inline) appendListed(constraints, "c", inline);
      continue;
    }
    if (/^(?:variantes?|variants?)\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "variants";
      const inline = trimmed.replace(/^(?:variantes?|variants?)\s*:\s*/i, "");
      if (inline) appendListed(variants, "v", inline);
      continue;
    }
    if (/^bonuses?\s*:\s*(.*)$/i.test(trimmed)) {
      currentSection = "bonuses";
      const inline = trimmed.replace(/^bonuses?\s*:\s*/i, "");
      if (inline) appendListed(bonuses, "b", inline);
      continue;
    }

    // Accumulate under current section
    switch (currentSection) {
      case "rooms":
        roomsText += (roomsText ? ", " : "") + trimmed;
        break;
      case "heroes":
        heroesText += (heroesText ? ", " : "") + trimmed;
        break;
      case "spells":
        spellsText += (spellsText ? ", " : "") + trimmed;
        break;
      case "variables":
        variablesText += "\n" + trimmed;
        break;
      case "constraints":
        appendListed(constraints, "c", trimmed);
        break;
      case "bonuses":
        appendListed(bonuses, "b", trimmed);
        break;
      case "variants":
        appendListed(variants, "v", trimmed);
        break;
    }
  }

  const rooms = parseRooms(roomsText);
  const heroes = parseHeroes(heroesText);
  const spells = spellsText ? parseSpells(spellsText) : undefined;
  const variables = variablesText.trim() ? parseVariables(variablesText) : undefined;

  return {
    id,
    name,
    contractId,
    rooms,
    heroes,
    spells,
    variables,
    constraints: constraints.length ? constraints : undefined,
    bonuses: bonuses.length ? bonuses : undefined,
    variants: variants.length ? variants : undefined,
    difficulty,
  };
}

function roomSlotHasType(room: RoomSlot, type: RoomType): boolean {
  if (isChoixDef(room)) return room.options.some((opt) => roomSlotHasType(opt, type));
  return room.type === type;
}

function validateHeroSlot(hero: HeroSlot, label: string, errors: string[]): void {
  if (isChoixDef(hero)) {
    if (typeof hero.n === "number" && hero.n <= 0) {
      errors.push(`${label} choix must have n > 0, got ${hero.n}`);
    }
    hero.options.forEach((opt, i) => validateHeroSlot(opt, `${label} option ${i}`, errors));
    return;
  }
  if (typeof hero.hp === "number" && hero.hp <= 0) {
    errors.push(`${label} (${hero.type}) must have HP > 0, got ${hero.hp}`);
  }
}

/** NFR-9: Validate a level structure and return any ergonomic or logical errors. */
export function validateLevel(level: LevelDef): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // FR-1: Level must have at least one A room and one Z room
  const hasA = level.rooms.some((r) => r.count > 0 && roomSlotHasType(r.room, "A"));
  const hasZ = level.rooms.some((r) => r.count > 0 && roomSlotHasType(r.room, "Z"));
  if (!hasA) errors.push("Level must contain at least one spawn room ('A').");
  if (!hasZ) errors.push("Level must contain at least one Zorg room ('Z').");

  // Multiplicities must be positive
  for (const [idx, r] of level.rooms.entries()) {
    if (r.count <= 0) {
      errors.push(`Room multiplicity at index ${idx} must be positive, got ${r.count}`);
    }
  }

  // Heroes must have positive HP if numeric
  for (const [idx, h] of level.heroes.entries()) {
    validateHeroSlot(h, `Hero at index ${idx}`, errors);
  }

  // FR-9: each mirror world's flattened room list must be 1:1 with the base.
  if (level.mirrorWorlds?.length && !level.rooms.some((r) => isChoixDef(r.room))) {
    const baseCount = flattenRooms(level.rooms).length;
    for (const [i, world] of level.mirrorWorlds.entries()) {
      if (world.rooms.some((r) => isChoixDef(r.room))) continue;
      const n = flattenRooms(world.rooms).length;
      if (n !== baseCount) {
        errors.push(
          `FR-9: mirror world ${i} has ${n} rooms; base has ${baseCount} (1:1 by declaration order).`,
        );
      }
    }
  }

  // Variables validation
  if (level.variables) {
    for (const v of level.variables) {
      if (v.n <= 0) {
        errors.push(`Variable "${v.name}" must require n > 0 selections, got ${v.n}`);
      }
      if (Array.isArray(v.domain) && !v.allowRepeats && v.domain.length < v.n) {
        errors.push(
          `Variable "${v.name}" domain size (${v.domain.length}) is smaller than required picks (${v.n}) with repeats disallowed.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** NFR-2 & NFR-9: Serialize a LevelDef back to canonical DSL string. */
export function serializeLevel(level: LevelDef): string {
  const lines: string[] = [];
  lines.push(`id: ${level.id}`);
  lines.push(`Level: ${level.name}`);
  if (level.contractId) lines.push(`Contract: ${level.contractId}`);

  const roomStrs = level.rooms.map((r) => {
    const roomStr = serializeRoom(r.room);
    return r.count === 1 ? roomStr : `${r.count} ${roomStr}`;
  });
  lines.push(`Rooms: ${roomStrs.join(", ")}`);

  const heroStrs = level.heroes.map(serializeHero);
  lines.push(`Heroes: ${heroStrs.join(", ")}`);

  if (level.spells && level.spells.length > 0) {
    lines.push(`Spells: ${level.spells.map(serializeSpell).join(", ")}`);
  }

  if (level.variables && level.variables.length > 0) {
    lines.push("Variables:");
    for (const v of level.variables) {
      let domainStr = "";
      if (v.domain === "N" || v.domain === "R") {
        domainStr = v.domain;
      } else if (v.allowRepeats) {
        domainStr = `liste(${v.domain.join(", ")})`;
      } else {
        domainStr = `[${v.domain.join(", ")}]`;
      }
      const opts: string[] = [];
      if (v.captureOrder) opts.push("order=true");
      if (v.captureOrientation) opts.push("orientation=true");
      const optsStr = opts.length ? `, ${opts.join(", ")}` : "";
      lines.push(`  ${v.name} = choix(${v.n}, ${domainStr}${optsStr})`);
    }
  }

  if (level.constraints && level.constraints.length > 0) {
    lines.push("Constraints:");
    for (const c of level.constraints) {
      lines.push(`  - ${c.expression}`);
    }
  }

  if (level.bonuses && level.bonuses.length > 0) {
    lines.push("Bonuses:");
    for (const b of level.bonuses) {
      lines.push(`  - ${b.expression}`);
    }
  }

  if (level.variants && level.variants.length > 0) {
    lines.push("Variants:");
    for (const v of level.variants) {
      lines.push(`  - ${v.expression}`);
    }
  }

  if (level.difficulty !== undefined) {
    lines.push(`Difficulty: ${level.difficulty}`);
  }

  if (level.mirrorWorlds && level.mirrorWorlds.length > 0) {
    for (const [i, world] of level.mirrorWorlds.entries()) {
      const label = world.id !== "level-0" && world.id !== level.id ? world.name || world.id : `M${"'".repeat(i + 1)}`;
      lines.push(`Mirror ${label}:`);
      const { mirrorWorlds: _nested, ...flat } = world;
      lines.push(serializeLevel(flat));
    }
  }

  return lines.join("\n");
}

function serializeChoix<T>(n: number | string, options: T[], serializeItem: (item: T) => string): string {
  return `choix(${n}, {${options.map(serializeItem).join(", ")}})`;
}

function serializeRoom(room: RoomSlot): string {
  if (isChoixDef(room)) return serializeChoix(room.n, room.options, serializeRoom);
  switch (room.type) {
    case "A":
    case "Z":
      return room.type;
    case "D":
      return `D(${room.damage})`;
    case "E":
      return `E(${room.element})`;
    case "P":
      return `P(${room.entries}, ${room.formula})`;
    case "O":
      return `O(${room.gold})`;
    case "T":
      return `T(${room.cost}, ${room.element})`;
    case "C":
      return `C(${room.args.join(", ")})`;
  }
}

function serializeHero(hero: HeroSlot): string {
  if (isChoixDef(hero)) return serializeChoix(hero.n, hero.options, serializeHero);
  switch (hero.type) {
    case "Warrior":
      return `Warrior(${hero.hp})`;
    case "Elf":
      return `Elf(${hero.hp}, [${hero.immunities.join(", ")}])`;
    case "Gunner":
      return hero.duration !== undefined
        ? `Gunner(${hero.hp}, ${hero.shots}, ${hero.duration})`
        : `Gunner(${hero.hp}, ${hero.shots})`;
    case "Mechanic":
      return `Mechanic(${hero.hp}, ${JSON.stringify(hero.powerSteps)})`;
    case "Princess":
      return `Princess(${hero.hp}, ${JSON.stringify(hero.weights)}, ${hero.pull})`;
  }
}

function serializeSpell(spell: SpellSlot): string {
  if (isChoixDef(spell)) return serializeChoix(spell.n, spell.options, serializeSpell);
  if (isSpellRepeat(spell)) return `${spell.count}*${serializeSpell(spell.spell)}`;
  switch (spell.type) {
    case "Attack":
      return `Attack(${spell.damage})`;
    case "Teleport":
      return `Teleport(${spell.steps})`;
    case "Move":
    case "Swap":
    case "Sleep":
    case "Wake":
    case "Banality":
      return `${spell.type}()`;
    case "Selection":
      return `Selection(${spell.allowCorpses})`;
  }
}
