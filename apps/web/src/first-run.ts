import { UNSPECIFIED_DIFFICULTY, type CampaignEntry } from "@zorg/engine";

/** Knowledge companion (published from docs/PLAYER_GUIDE.md). */
export const KNOWLEDGE_GUIDE_HREF = "https://knowledge.zorg.artof.link/guide.html";

/** Persona journeys (UX validation only — GAME_SPEC wins on rules). */
export const KNOWLEDGE_JOURNEYS_HREF = "https://knowledge.zorg.artof.link/journeys.html";

export const HOW_TO_PLAY_TITLE = "How to play";

/** J-KID / J-HELPER first-run steps — keep free of FR / ledger jargon. */
export const HOW_TO_PLAY_STEPS = [
  "Pick an easy level, or press Generate Difficulty 1.",
  "Place rooms so A (where heroes start) connects toward Z (Zorg).",
  "Press Start fight.",
  "You win if the heroes die before they reach Z.",
] as const;

export const KID_LEDE =
  "Build a dungeon, then start the fight. Heroes walk on their own. Stop them before they reach Zorg.";

export const HELPER_BLURB =
  "Success looks like this: every hero falls before anyone enters Zorg's room. One next step at a time.";

export const START_HERE_DIFFICULTY_LABEL = "Start here — Difficulty 1";
export const START_HERE_GENERATE_LABEL = "Start here — Generate Difficulty 1";
export const START_HERE_CARD_BADGE = "Start here";
export const START_FIGHT_LABEL = "Start fight";

export const MAKER_HOW_TO =
  "Place rooms so A connects toward Z. Then Start fight. Heroes must die before they reach Z.";

export const MAKER_GATE_OK = "Looks good — rooms are connected. You can start the fight.";
export const MAKER_GATE_BLOCKED = "Start fight stays off until the rooms make one connected dungeon.";

export const HONESTY_SUMMARY = "This game is still being tested. Every playable level is open right now.";

export const HONESTY_DETAILS =
  "Engineer / honesty notes (not needed to play): Simulated engine tests — not a live production probe. " +
  "Contract costs are labels only (FR-4 gating is not built). Levels with C rooms or Gunner duration stay " +
  "unavailable — those rules are not invented here. Generated levels are Simulated engine output, not a " +
  "live probe. See the honesty ledger and persona journeys.";

export const MAKER_HONESTY_DETAILS =
  "Engineer notes: Simulated engine, not Live. The outcome here is the scheduler result " +
  "(heroes dead, Z reached, or stalemate). Engine scoreLevel (FR-43 / FR-44) is Simulated in tests; " +
  "this view does not score extra constraints, bonuses, or mirror-world aggregates.";

export const MAKER_GENERATED_HONESTY =
  " This dungeon is generator output (parse + placement + FR-46 bounded search) — not a live production probe. FR-4 gating is still not built.";

export const KID_FACING_COPY = [
  HOW_TO_PLAY_TITLE,
  ...HOW_TO_PLAY_STEPS,
  KID_LEDE,
  HELPER_BLURB,
  START_HERE_DIFFICULTY_LABEL,
  START_HERE_GENERATE_LABEL,
  START_HERE_CARD_BADGE,
  START_FIGHT_LABEL,
  MAKER_HOW_TO,
  MAKER_GATE_OK,
  MAKER_GATE_BLOCKED,
  HONESTY_SUMMARY,
].join("\n");

const JARGON = [/FR-4/i, /C rooms?/i, /Gunner duration/i, /ledger/i, /Simulated/i, /choix/i, /extermination/i];

export function kidFacingCopyIsPlain(text: string = KID_FACING_COPY): boolean {
  return JARGON.every((pattern) => !pattern.test(text));
}

export function difficultyChipLabel(band: string, count?: number): string {
  const base =
    band === UNSPECIFIED_DIFFICULTY
      ? "No Difficulty (no Difficulté)"
      : `Difficulty ${band} (Difficulté ${band})`;
  return count === undefined ? base : `${base} (${count})`;
}

export function difficultyEntryLabel(difficulty: number | string | null): string {
  if (difficulty === null) return "";
  return ` · Difficulty ${difficulty}`;
}

export function firstPlayableDifficulty1(
  catalog: readonly CampaignEntry[],
): CampaignEntry | undefined {
  return catalog.find((entry) => entry.playable && entry.difficultyBand === "1");
}
