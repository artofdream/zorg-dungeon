// Implements FR-15: Portal Room P(n, f) — on a hero's i-th entry into this
// P (i ≤ n), teleport to the first cell of their f(i)-th-most-recent room
// visit. If f(i) overshoots history, the waiting room is the fallback.
//
// History used by f(i) is visits *before* this portal entry (the entry is
// the trigger, not a destination candidate). Official per-type art is not
// in the extract; a visit's "first cell" is the cell the hero occupied
// when that visit began (spawn uses the room center).

export interface RoomVisit {
  roomId: string;
  firstCell: { x: number; y: number };
}

export class PortalFormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalFormulaError";
  }
}

/**
 * FR-15: evaluate f(i). Accepts a constant (`1`), an identity (`i` / `x`),
 * or a linear map (`i->i-1`, `x↦7x-6`). The bound variable may be i/x/n.
 */
export function evalPortalIndex(formula: string, i: number): number {
  const trimmed = formula.trim();
  if (!trimmed) {
    throw new PortalFormulaError("Portal formula is empty.");
  }

  const parts = trimmed.split(/\s*(?:↦|->|=>)\s*/);
  const expr = (parts.length === 2 ? parts[1] : parts[0])?.trim() ?? "";
  const token = expr.replace(/\s+/g, "").replace(/[xn]/gi, "i");

  if (/^-?\d+$/.test(token)) {
    return Number(token);
  }

  const match = token.match(/^(-?\d*)\*?i([+-]\d+)?$/);
  if (!match) {
    throw new PortalFormulaError(`Unsupported portal formula "${formula}".`);
  }

  const aTok = match[1];
  const a = aTok === "" || aTok === "+" ? 1 : aTok === "-" ? -1 : Number(aTok);
  const b = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new PortalFormulaError(`Unsupported portal formula "${formula}".`);
  }
  return a * i + b;
}

/**
 * FR-15: k-th-most-recent visit (k = 1 is the latest). Undefined when k
 * is not a positive index inside `visits`.
 */
export function lookupVisit(visits: readonly RoomVisit[], k: number): RoomVisit | undefined {
  if (!Number.isInteger(k) || k < 1 || k > visits.length) return undefined;
  return visits[visits.length - k];
}

/** True when this P still teleports (entry index i is 1-based and i ≤ n). */
export function portalStillActive(entryIndex: number, maxEntries: number): boolean {
  return entryIndex >= 1 && entryIndex <= maxEntries;
}
