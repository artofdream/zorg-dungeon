import type { Cardinal } from "./tiles.js";

/** One completed hero action (a walk, a Mechanic shove, or a Gunner fire). */
export type HeroAction =
  | { type: "walk"; dir: Cardinal }
  | { type: "shove"; dir: Cardinal }
  | { type: "fire"; dir: Cardinal };
