// Implements FR-14: Elemental Room E(elem) per-cell rules (fire / water /
// ice / poison) and full immunity bypass. Ice sliding and water
// impassability are movement rules; fire and poison change HP.
//
// Immune heroes ignore the cell entirely — no damage, no slide, no
// impassable water, no poison visit. Official green-cell art is not in the
// extract; which cells are green is a tile fact (see tiles.ts).

import type { ElementType, HeroDef } from "./level.js";
import { isElementType } from "./level.js";

export interface ElementalTick {
  hpDelta: number;
  /** Non-immune hero ended up on water (instant death). */
  die: boolean;
  /** Record this cell as a poison visit (global cell memory). */
  recordPoisonVisit: boolean;
  /** True when the hero has no interaction with this cell. */
  ignored: boolean;
}

/** FR-21 / FR-14: Elf lists immunities; other Phase 2 heroes have none. */
export function heroImmunities(def: HeroDef): ElementType[] {
  if (def.type !== "Elf") return [];
  return def.immunities.filter(isElementType);
}

export function ignoresElement(
  immunities: readonly ElementType[],
  element: ElementType | undefined,
): boolean {
  return element !== undefined && immunities.includes(element);
}

/**
 * FR-14: resolve one entry onto a green cell. `poisonAlreadyVisited` is the
 * cell's visit history (any non-immune hero). Immune → no-op.
 */
export function elementalTick(
  element: ElementType | undefined,
  immunities: readonly ElementType[],
  poisonAlreadyVisited: boolean,
): ElementalTick {
  if (!element || ignoresElement(immunities, element)) {
    return { hpDelta: 0, die: false, recordPoisonVisit: false, ignored: true };
  }

  switch (element) {
    case "fire":
      // 1 damage per entry onto the green cell.
      return { hpDelta: -1, die: false, recordPoisonVisit: false, ignored: false };
    case "water":
      // Impassable for planning; a hero who still ends up here dies.
      return { hpDelta: 0, die: true, recordPoisonVisit: false, ignored: false };
    case "ice":
      // Movement-only (slide). Standing / stopping on ice has no HP effect.
      return { hpDelta: 0, die: false, recordPoisonVisit: false, ignored: false };
    case "poison":
      // First visit +1 HP; every visit after −3 HP.
      return {
        hpDelta: poisonAlreadyVisited ? -3 : 1,
        die: false,
        recordPoisonVisit: true,
        ignored: false,
      };
  }
}
