import { UNSPECIFIED_DIFFICULTY, type CampaignEntry } from "@zorg/engine";

/** Kid-facing rules page (published from docs/LEARN.md). */
export const KNOWLEDGE_LEARN_HREF = "https://knowledge.zorg.artof.link/learn.html";

export const LEARN_THE_RULES_LABEL = "Learn the rules";

/** Knowledge companion (published from docs/PLAYER_GUIDE.md). */
export const KNOWLEDGE_GUIDE_HREF = "https://knowledge.zorg.artof.link/guide.html";

/** Persona journeys (UX validation only — GAME_SPEC wins on rules). */
export const KNOWLEDGE_JOURNEYS_HREF = "https://knowledge.zorg.artof.link/journeys.html";

export const HOW_TO_PLAY_TITLE = "How to play";

/** J-KID / J-HELPER first-run steps — keep free of FR / ledger jargon. */
export const HOW_TO_PLAY_STEPS = [
  "Pick an easy level, or press Generate Difficulty 1.",
  "Place rooms so Start (A) connects toward Exit (Z).",
  "Press Start fight.",
  "You win if you stop the heroes before they reach the exit.",
] as const;

export const KID_LEDE =
  "Build a dungeon, then start the fight. Heroes walk on their own. Stop them before they reach the exit.";

export const HELPER_BLURB =
  "Success looks like this: you stopped every hero before anyone entered the exit. One next step at a time.";

export const START_HERE_DIFFICULTY_LABEL = "Start here — Difficulty 1";
export const START_HERE_GENERATE_LABEL = "Start here — Generate Difficulty 1";
export const START_HERE_CARD_BADGE = "Start here";
export const START_FIGHT_LABEL = "Start fight";

export const MAKER_HOW_TO =
  "Place rooms so Start connects toward Exit. Then Start fight. Stop the heroes before they reach the exit.";

export const MAKER_GATE_OK = "Looks good — rooms are connected. You can start the fight.";
export const MAKER_GATE_BLOCKED = "Start fight stays off until the rooms make one connected dungeon.";

export const WIN_GOAL_HINT = "Goal: stop the heroes before they reach the exit.";
export const WIN_HEADLINE = "You stopped them before they reached the exit!";
export const LOSS_HEADLINE = "A hero reached the exit — you lose.";
export const STALEMATE_HEADLINE = "Stalemate — nothing further changes.";
export const WIN_HONESTY_NOTE =
  "Honesty: the engine marks a win when every hero has 0 HP and nobody entered Z. Kids see “you stopped them,” not “heroes are dead,” as the headline.";

export const FIGHT_PANEL_TITLE = "Fight";
export const FIGHT_TURN_HELP =
  "Your turn help: press Step to let one hero act, or Run to finish. Cast a spell only between finished steps — never mid-action.";
export const STEP_LABEL = "Step";
export const RUN_LABEL = "Run";
export const BACK_TO_MAKER_LABEL = "Back to Maker";

export const SETUP_CHOICES_TITLE = "Setup choices";
export const SETUP_CHOICES_HINT = "Pick what you want on the board. Changing a choice clears the rooms.";
export const SPELLS_TITLE = "Spells";
export const PLACE_IN_LINE_LABEL = "Place rooms in a line";
export const PLACE_IN_LINE_HINT =
  "New here? Press Place rooms in a line to get a ready path from Start to Exit.";
export const EMPTY_BOARD_HINT =
  "The board is empty. Pick a room on the left, or press Place rooms in a line.";

export const DOORS_FACE_TITLE = "Doors face";
export const PRACTICE_SECTION_TITLE = "Practice dungeon";
export const PRACTICE_SECTION_HINT =
  "Makes a ready-to-play beginner dungeon. Authored levels above stay the main campaign.";
export const MORE_FILTERS_SUMMARY = "More filters (contract flavour)";
export const MORE_FILTERS_HINT =
  "Optional flavour labels only. They are not unlock systems — FR-4 gating is not built.";

export const HONESTY_SUMMARY = "This game is still being tested. Every playable level is open right now.";

export const HONESTY_DETAILS =
  "Engineer / honesty notes (not needed to play): Simulated engine tests — not a live production probe. " +
  "Contract costs are labels only (FR-4 gating is not built). Levels with C rooms or Gunner duration stay " +
  "unavailable — those rules are not invented here. Generated levels are Simulated engine output, not a " +
  "live probe. See the honesty ledger and persona journeys.";

export const MAKER_HONESTY_DETAILS =
  "Engineer notes: Simulated engine, not Live. The outcome here is the scheduler result " +
  "(heroes at 0 HP / stopped, Z reached, or stalemate). A win means every hero has 0 HP and nobody entered Z — the kid headline is “you stopped them,” not “heroes are dead.” Engine scoreLevel (FR-43 / FR-44) is Simulated in tests; " +
  "this view does not score extra constraints, bonuses, or mirror-world aggregates. " +
  "Doors / wall-hatch direction follows the spawn-room orientation anchor (FR-7).";

export const MAKER_GENERATED_HONESTY =
  " This dungeon is generator output (parse + placement + FR-46 bounded search) — not a live production probe. FR-4 gating is still not built.";

export const KID_FACING_COPY = [
  HOW_TO_PLAY_TITLE,
  ...HOW_TO_PLAY_STEPS,
  KID_LEDE,
  HELPER_BLURB,
  LEARN_THE_RULES_LABEL,
  START_HERE_DIFFICULTY_LABEL,
  START_HERE_GENERATE_LABEL,
  START_HERE_CARD_BADGE,
  START_FIGHT_LABEL,
  MAKER_HOW_TO,
  MAKER_GATE_OK,
  MAKER_GATE_BLOCKED,
  WIN_GOAL_HINT,
  WIN_HEADLINE,
  LOSS_HEADLINE,
  FIGHT_PANEL_TITLE,
  FIGHT_TURN_HELP,
  SETUP_CHOICES_TITLE,
  SPELLS_TITLE,
  PLACE_IN_LINE_LABEL,
  PLACE_IN_LINE_HINT,
  EMPTY_BOARD_HINT,
  DOORS_FACE_TITLE,
  PRACTICE_SECTION_TITLE,
  PRACTICE_SECTION_HINT,
  MORE_FILTERS_SUMMARY,
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

export function outcomeHeadline(outcome: "win" | "loss" | "stalemate" | "in_progress"): string | null {
  if (outcome === "win") return WIN_HEADLINE;
  if (outcome === "loss") return LOSS_HEADLINE;
  if (outcome === "stalemate") return STALEMATE_HEADLINE;
  return null;
}
