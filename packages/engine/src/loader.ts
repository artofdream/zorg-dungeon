// Implements FR-1: Level data model parser (rooms with multiplicities, ordered hero
// spawn list, optional spell list, constraints, bonuses, variables).
// Implements FR-2: Parser for choix(n, E) player-chosen variables.
// Implements FR-3: Parser for order and orientation options on choix(n, E).
// Supports NFR-2 (Data-driven content) and NFR-9 (Authoring ergonomics).

import {
  BonusDef,
  ChoixVariableDef,
  ConstraintDef,
  ElementType,
  HeroDef,
  HeroType,
  LevelDef,
  RoomDef,
  RoomMultiplicity,
  RoomType,
  SpellDef,
  SpellType,
} from "./level.js";

/** FR-1: Parse a room token, e.g. "A", "Z", "D(5)", "E(fire)", "P(3, i->i)", "O(10)", "T(5, ice)", "C(1)". */
export function parseRoom(token: string): RoomDef {
  const trimmed = token.trim();
  if (trimmed === "A") return { type: "A" };
  if (trimmed === "Z") return { type: "Z" };

  const match = trimmed.match(/^([A-Z])\((.*)\)$/s);
  if (!match || !match[1]) {
    throw new Error(`Invalid room specification: "${trimmed}"`);
  }

  const typeChar = match[1];
  const rawArgs = match[2] ?? "";
  const args = rawArgs
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  switch (typeChar as RoomType) {
    case "D": {
      const dmg = Number(args[0]);
      return { type: "D", damage: Number.isNaN(dmg) ? (args[0] ?? 0) : dmg };
    }
    case "E": {
      return { type: "E", element: (args[0] ?? "fire") as ElementType };
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
      const element = (args[1] ?? "fire") as ElementType;
      return {
        type: "T",
        cost: Number.isNaN(cost) ? (args[0] ?? 0) : cost,
        element,
      };
    }
    case "C": {
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
export function parseHero(token: string): HeroDef {
  const trimmed = token.trim();
  const match = trimmed.match(/^([A-Za-z]+)\((.*)\)$/s);
  if (!match || !match[1]) {
    throw new Error(`Invalid hero specification: "${trimmed}"`);
  }

  const heroName = match[1];
  const rawArgs = match[2] ?? "";
  const args = rawArgs
    .split(/,(?![^\[\{]*[\]\}])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const hp = Number.isNaN(Number(args[0])) ? (args[0] ?? 1) : Number(args[0]);

  switch (heroName as HeroType) {
    case "Warrior":
      return { type: "Warrior", hp };
    case "Elf": {
      let immunities: (ElementType | string)[] = [];
      if (args[1]) {
        const raw = args[1].replace(/[\[\]]/g, "");
        immunities = raw
          .split(/[,+]/)
          .map((s) => s.trim() as ElementType)
          .filter(Boolean);
      }
      return { type: "Elf", hp, immunities };
    }
    case "Gunner": {
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
      const powerSteps: Record<string, number | string> = {};
      if (args[1]) {
        try {
          const jsonLike = args[1].replace(/([a-zA-Z0-9_]+):/g, '"$1":');
          Object.assign(powerSteps, JSON.parse(jsonLike));
        } catch {
          // fallback dictionary parsing
          const pairs = args[1].replace(/[\{\}]/g, "").split(",");
          for (const pair of pairs) {
            const [k, v] = pair.split(":").map((s) => s.trim());
            if (k && v) powerSteps[k] = Number.isNaN(Number(v)) ? v : Number(v);
          }
        }
      }
      return { type: "Mechanic", hp, powerSteps };
    }
    case "Princess": {
      const weights: Record<string, number | string> = { Z: 1 };
      if (args[1]) {
        try {
          const jsonLike = args[1].replace(/([a-zA-Z0-9_]+):/g, '"$1":');
          Object.assign(weights, JSON.parse(jsonLike));
        } catch {
          const pairs = args[1].replace(/[\{\}]/g, "").split(",");
          for (const pair of pairs) {
            const [k, v] = pair.split(":").map((s) => s.trim());
            if (k && v) weights[k] = Number.isNaN(Number(v)) ? v : Number(v);
          }
        }
      }
      const pull = args[2] ? (Number.isNaN(Number(args[2])) ? args[2] : Number(args[2])) : 1;
      return { type: "Princess", hp, weights, pull };
    }
    default:
      throw new Error(`Unknown hero type: "${heroName}"`);
  }
}

/** FR-1: Parse an ordered hero spawn list. */
export function parseHeroes(text: string): HeroDef[] {
  if (!text.trim()) return [];

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

  return tokens.map((tok) => parseHero(tok));
}

/** FR-1: Parse a spell definition, e.g. "Attack(3)", "Teleport(2)", "Move", "Selection(false)". */
export function parseSpell(token: string): SpellDef {
  const trimmed = token.trim();
  const match = trimmed.match(/^([A-Za-z]+)(?:\((.*)\))?$/s);
  if (!match || !match[1]) {
    throw new Error(`Invalid spell specification: "${trimmed}"`);
  }

  const spellName = match[1];
  const rawArgs = match[2] ?? "";
  const args = rawArgs
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

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
      throw new Error(`Unknown spell type: "${spellName}"`);
  }
}

/** FR-1: Parse a one-time spell list. */
export function parseSpells(text: string): SpellDef[] {
  if (!text.trim()) return [];

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

  return tokens.map((tok) => parseSpell(tok));
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

/** FR-2: Parse a multi-line variables block. */
export function parseVariables(text: string): ChoixVariableDef[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  return lines.map((l) => parseVariable(l));
}

/** FR-1: Parse a multi-line level definition DSL. */
export function parseLevel(dsl: string): LevelDef {
  const lines = dsl.split("\n");
  let id = "level-0";
  let name = "Untitled Level";
  let contractId: string | undefined = undefined;

  let roomsText = "";
  let heroesText = "";
  let spellsText = "";
  let variablesText = "";
  const constraints: ConstraintDef[] = [];
  const bonuses: BonusDef[] = [];

  let currentSection: "none" | "rooms" | "heroes" | "spells" | "variables" | "constraints" | "bonuses" =
    "none";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

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

    // Section headers
    if (/^(?:rooms|pi|Π):\s*(.*)$/i.test(trimmed)) {
      currentSection = "rooms";
      const inline = trimmed.replace(/^(?:rooms|pi|Π):\s*/i, "");
      if (inline) roomsText += (roomsText ? ", " : "") + inline;
      continue;
    }
    if (/^(?:heroes|gamma|Γ):\s*(.*)$/i.test(trimmed)) {
      currentSection = "heroes";
      const inline = trimmed.replace(/^(?:heroes|gamma|Γ):\s*/i, "");
      if (inline) heroesText += (heroesText ? ", " : "") + inline;
      continue;
    }
    if (/^(?:spells|phi|Φ):\s*(.*)$/i.test(trimmed)) {
      currentSection = "spells";
      const inline = trimmed.replace(/^(?:spells|phi|Φ):\s*/i, "");
      if (inline) spellsText += (spellsText ? ", " : "") + inline;
      continue;
    }
    if (/^variables:\s*(.*)$/i.test(trimmed)) {
      currentSection = "variables";
      const inline = trimmed.replace(/^variables:\s*/i, "");
      if (inline) variablesText += "\n" + inline;
      continue;
    }
    if (/^constraints:\s*(.*)$/i.test(trimmed)) {
      currentSection = "constraints";
      const inline = trimmed.replace(/^constraints:\s*/i, "");
      if (inline) {
        constraints.push({
          id: `c-${constraints.length + 1}`,
          expression: inline.replace(/^-\s*/, "").trim(),
        });
      }
      continue;
    }
    if (/^bonuses:\s*(.*)$/i.test(trimmed)) {
      currentSection = "bonuses";
      const inline = trimmed.replace(/^bonuses:\s*/i, "");
      if (inline) {
        bonuses.push({
          id: `b-${bonuses.length + 1}`,
          expression: inline.replace(/^-\s*/, "").trim(),
        });
      }
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
        constraints.push({
          id: `c-${constraints.length + 1}`,
          expression: trimmed.replace(/^-\s*/, "").trim(),
        });
        break;
      case "bonuses":
        bonuses.push({
          id: `b-${bonuses.length + 1}`,
          expression: trimmed.replace(/^-\s*/, "").trim(),
        });
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
  };
}

/** NFR-9: Validate a level structure and return any ergonomic or logical errors. */
export function validateLevel(level: LevelDef): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // FR-1: Level must have at least one A room and one Z room
  const hasA = level.rooms.some((r) => r.room.type === "A" && r.count > 0);
  const hasZ = level.rooms.some((r) => r.room.type === "Z" && r.count > 0);
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
    if (typeof h.hp === "number" && h.hp <= 0) {
      errors.push(`Hero at index ${idx} (${h.type}) must have HP > 0, got ${h.hp}`);
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

  return lines.join("\n");
}

function serializeRoom(room: RoomDef): string {
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

function serializeHero(hero: HeroDef): string {
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

function serializeSpell(spell: SpellDef): string {
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
