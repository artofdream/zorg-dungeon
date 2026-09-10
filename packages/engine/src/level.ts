// Implements FR-1: Level data model (rooms with multiplicities, ordered hero spawn
// list, optional spell list, constraints, bonuses, variables).
// Implements FR-2: Player-chosen choix(n, E) variables with substitution.
// Implements FR-3: Order and orientation capture for player choices.
// Supports NFR-2 (Data-driven content) and NFR-9 (Authoring ergonomics).

export type ElementType = "fire" | "water" | "ice" | "poison";

export type RoomType = "A" | "Z" | "D" | "E" | "P" | "O" | "T" | "C";

export type RoomDef =
  | { type: "A" }
  | { type: "Z" }
  | { type: "D"; damage: number | string }
  | { type: "E"; element: ElementType | string }
  | { type: "P"; entries: number | string; formula: string }
  | { type: "O"; gold: number | string }
  | { type: "T"; cost: number | string; element: ElementType | string }
  | { type: "C"; args: (number | string)[] };

export interface RoomMultiplicity {
  count: number;
  room: RoomDef;
}

export type HeroType = "Warrior" | "Elf" | "Gunner" | "Mechanic" | "Princess";

export type HeroDef =
  | { type: "Warrior"; hp: number | string }
  | { type: "Elf"; hp: number | string; immunities: (ElementType | string)[] }
  | { type: "Gunner"; hp: number | string; shots: number | string; duration?: number | string | "inf" }
  | { type: "Mechanic"; hp: number | string; powerSteps: Record<string, number | string> }
  | { type: "Princess"; hp: number | string; weights: Record<string, number | string>; pull: number | string };

export type SpellType =
  | "Attack"
  | "Teleport"
  | "Move"
  | "Swap"
  | "Selection"
  | "Sleep"
  | "Wake"
  | "Banality";

export type SpellDef =
  | { type: "Attack"; damage: number | string }
  | { type: "Teleport"; steps: number | string }
  | { type: "Move" }
  | { type: "Swap" }
  | { type: "Selection"; allowCorpses: boolean }
  | { type: "Sleep" }
  | { type: "Wake" }
  | { type: "Banality" };

export type VariableDomain<T = unknown> = T[] | "N" | "R";

export interface ChoixVariableDef<T = unknown> {
  name: string;
  n: number;
  domain: VariableDomain<T>;
  allowRepeats?: boolean;
  /** FR-3: When true, the order in which the player picks items matters for evaluation. */
  captureOrder?: boolean;
  /** FR-3: When true, each chosen item captures a player-selected orientation (0, 90, 180, 270 deg). */
  captureOrientation?: boolean;
}

export const VALID_ORIENTATIONS = [0, 90, 180, 270] as const;
export type Orientation = (typeof VALID_ORIENTATIONS)[number];

export interface PlayerChoice<T = unknown> {
  variableName: string;
  selected: T[];
  /** FR-3: Orientations chosen for each item, in degrees (0, 90, 180, 270). */
  orientations?: Orientation[];
}

export interface ConstraintDef {
  id: string;
  description?: string;
  kind?: "distance" | "death_order" | "hp_floor" | "gold" | "solvability" | "custom";
  expression: string;
}

export interface BonusDef {
  id: string;
  description?: string;
  kind?: string;
  expression: string;
}

/** FR-1: Canonical structured representation of a level. */
export interface LevelDef {
  id: string;
  name: string;
  contractId?: string;
  rooms: RoomMultiplicity[];
  heroes: HeroDef[];
  spells?: SpellDef[];
  variables?: ChoixVariableDef[];
  constraints?: ConstraintDef[];
  bonuses?: BonusDef[];
  mirrorWorlds?: LevelDef[];
}

/** FR-1: Flatten room multiplicities into an individual RoomDef array. */
export function flattenRooms(multiplicities: RoomMultiplicity[]): RoomDef[] {
  const result: RoomDef[] = [];
  for (const m of multiplicities) {
    for (let i = 0; i < m.count; i++) {
      result.push(JSON.parse(JSON.stringify(m.room)));
    }
  }
  return result;
}

/**
 * FR-2 & FR-3: Validate that player choices satisfy variable domain, multiplicity,
 * and order/orientation constraints.
 */
export function validatePlayerChoice(
  variable: ChoixVariableDef,
  choice: PlayerChoice,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (choice.variableName !== variable.name) {
    errors.push(`Choice variable name "${choice.variableName}" does not match "${variable.name}"`);
  }

  if (choice.selected.length !== variable.n) {
    errors.push(
      `Variable "${variable.name}" requires exactly ${variable.n} selections, but received ${choice.selected.length}`,
    );
  }

  if (!variable.allowRepeats) {
    const unique = new Set(choice.selected.map((item) => JSON.stringify(item)));
    if (unique.size !== choice.selected.length) {
      errors.push(`Variable "${variable.name}" does not permit repeated selections.`);
    }
  }

  // Domain checks
  if (variable.domain === "N") {
    for (const item of choice.selected) {
      const num = Number(item);
      if (!Number.isInteger(num) || num < 0) {
        errors.push(`Item ${JSON.stringify(item)} is not a natural number in domain ℕ`);
      }
    }
  } else if (variable.domain === "R") {
    for (const item of choice.selected) {
      const num = Number(item);
      if (typeof num !== "number" || Number.isNaN(num)) {
        errors.push(`Item ${JSON.stringify(item)} is not a valid real number in domain ℝ`);
      }
    }
  } else if (Array.isArray(variable.domain)) {
    const domainStrs = new Set(variable.domain.map((d) => JSON.stringify(d)));
    for (const item of choice.selected) {
      if (!domainStrs.has(JSON.stringify(item))) {
        errors.push(
          `Item ${JSON.stringify(item)} is not in the allowed domain: ${JSON.stringify(variable.domain)}`,
        );
      }
    }
  }

  // FR-3: Orientation validation
  if (variable.captureOrientation) {
    if (!choice.orientations || choice.orientations.length !== variable.n) {
      errors.push(
        `Variable "${variable.name}" requires ${variable.n} orientation values per FR-3.`,
      );
    } else {
      for (const [idx, o] of choice.orientations.entries()) {
        if (!VALID_ORIENTATIONS.includes(o as Orientation)) {
          errors.push(
            `Invalid orientation ${o} at index ${idx}. Must be one of: 0, 90, 180, 270 degrees.`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * FR-2 & FR-3: Substitute player-selected choices for variables across level rooms,
 * heroes, spells, and constraint expressions.
 */
export function substituteVariables(
  level: LevelDef,
  choices: Record<string, PlayerChoice>,
): LevelDef {
  // Validate that all required variables have valid choices
  if (level.variables) {
    for (const v of level.variables) {
      const choice = choices[v.name];
      if (!choice) {
        throw new Error(`Missing choice for variable "${v.name}"`);
      }
      const validation = validatePlayerChoice(v, choice);
      if (!validation.valid) {
        throw new Error(
          `Invalid choice for variable "${v.name}": ${validation.errors.join("; ")}`,
        );
      }
    }
  }

  // Deep clone level before substitution
  let substitutedStr = JSON.stringify(level);

  for (const [varName, choice] of Object.entries(choices)) {
    const single = choice.selected.length === 1 ? choice.selected[0] : null;

    if (single !== null) {
      if (typeof single === "number" || typeof single === "boolean") {
        // Replace quoted variable token e.g. "$X" -> 5 (number/bool literal)
        const quotedPattern = new RegExp(`"\\$${varName}"|\\{\\s*${varName}\\s*\\}`, "g");
        substitutedStr = substitutedStr.replace(quotedPattern, String(single));

        // Replace inside strings/expressions e.g. "dist(A, Z) >= $X"
        const inlinePattern = new RegExp(`\\$${varName}\\b|\\{${varName}\\}`, "g");
        substitutedStr = substitutedStr.replace(inlinePattern, String(single));
      } else if (typeof single === "string") {
        // Replace inside strings/expressions
        const inlinePattern = new RegExp(`\\$${varName}\\b|\\{${varName}\\}`, "g");
        substitutedStr = substitutedStr.replace(inlinePattern, single);
      } else if (typeof single === "object") {
        // Replace full object reference
        const quotedPattern = new RegExp(`"\\$${varName}"`, "g");
        substitutedStr = substitutedStr.replace(quotedPattern, JSON.stringify(single));
      }
    } else {
      // Multiple items selected — whole JSON token and inline $name/{name} (FR-2)
      const serialized = JSON.stringify(choice.selected);
      const quotedPattern = new RegExp(`"\\$${varName}"`, "g");
      substitutedStr = substitutedStr.replace(quotedPattern, serialized);

      // Remaining tokens are inside strings (constraints, bonuses, formulas).
      // Escape so string-valued picks do not break the JSON document.
      const inlinePattern = new RegExp(`\\$${varName}\\b|\\{${varName}\\}`, "g");
      const inlineReplacement = JSON.stringify(serialized).slice(1, -1);
      substitutedStr = substitutedStr.replace(inlinePattern, inlineReplacement);
    }
  }

  const result: LevelDef = JSON.parse(substitutedStr);
  return result;
}
