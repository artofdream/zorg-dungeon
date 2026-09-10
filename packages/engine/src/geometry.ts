// Implements FR-10: distance queries between placed rooms, defined as the
// Manhattan distance between their grid positions (GAME_SPEC.md, "Dungeon
// construction" section).
//
// This is deliberately the first real piece of the engine: it is pure,
// trivial to test exhaustively, and gives the requirements-trace gate
// (.github/workflows/governance.yml) one true FR -> code -> test edge to
// validate against instead of checking an empty graph.

export interface RoomPosition {
  x: number;
  y: number;
}

/** FR-10: dist(r, s) = |Δx| + |Δy| between two placed rooms. */
export function manhattanDistance(r: RoomPosition, s: RoomPosition): number {
  return Math.abs(r.x - s.x) + Math.abs(r.y - s.y);
}
