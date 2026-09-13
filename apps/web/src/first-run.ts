import { UNSPECIFIED_DIFFICULTY, type CampaignEntry } from "@zorg/engine";
import {
  knowledgeGuideHref,
  knowledgeJourneysHref,
  knowledgeLearnHref,
  t,
} from "./i18n/index.js";

/** Kid-facing rules page (published from docs/LEARN.md / docs/fr/LEARN.md). */
export function getKnowledgeLearnHref(): string {
  return knowledgeLearnHref();
}
export function getKnowledgeGuideHref(): string {
  return knowledgeGuideHref();
}
export function getKnowledgeJourneysHref(): string {
  return knowledgeJourneysHref();
}

/** @deprecated Prefer getKnowledgeLearnHref() — EN default for static imports/tests. */
export const KNOWLEDGE_LEARN_HREF = "https://knowledge.zorg.artof.link/learn.html";
export const KNOWLEDGE_GUIDE_HREF = "https://knowledge.zorg.artof.link/guide.html";
export const KNOWLEDGE_JOURNEYS_HREF = "https://knowledge.zorg.artof.link/journeys.html";

export const LEARN_THE_RULES_LABEL = () => t("knowledge.learnLabel");
export const HOW_TO_PLAY_TITLE = () => t("howTo.title");
export const HOW_TO_PLAY_STEPS = () =>
  [t("howTo.step1"), t("howTo.step2"), t("howTo.step3"), t("howTo.step4")] as const;

export const KID_LEDE = () => t("landing.lede");
export const HELPER_BLURB = () => t("landing.helperBlurb");
export const START_HERE_DIFFICULTY_LABEL = () => t("landing.startHereDifficulty");
export const START_HERE_GENERATE_LABEL = () => t("landing.startHereGenerate");
export const START_HERE_CARD_BADGE = () => t("landing.startHereBadge");
export const START_FIGHT_LABEL = () => t("maker.startFight");

export const MAKER_HOW_TO = () => t("maker.howTo");
export const MAKER_GATE_OK = () => t("maker.gateOk");
export const MAKER_GATE_BLOCKED = () => t("maker.gateBlocked");

export const WIN_GOAL_HINT = () => t("fight.winGoal");
export const WIN_HEADLINE = () => t("fight.winHeadline");
export const LOSS_HEADLINE = () => t("fight.lossHeadline");
export const STALEMATE_HEADLINE = () => t("fight.stalemateHeadline");
export const WIN_HONESTY_NOTE = () => t("fight.winHonesty");

export const FIGHT_PANEL_TITLE = () => t("fight.title");
export const FIGHT_TURN_HELP = () => t("fight.turnHelp");
export const STEP_LABEL = () => t("maker.step");
export const RUN_LABEL = () => t("maker.run");
export const BACK_TO_MAKER_LABEL = () => t("maker.backToMaker");

export const SETUP_CHOICES_TITLE = () => t("setup.title");
export const SETUP_CHOICES_HINT = () => t("setup.hint");
export const SPELLS_TITLE = () => t("spells.title");
export const PLACE_IN_LINE_LABEL = () => t("placeInLine.label");
export const PLACE_IN_LINE_HINT = () => t("placeInLine.hint");
export const EMPTY_BOARD_HINT = () => t("board.emptyHint");

export const DOORS_FACE_TITLE = () => t("doors.faceTitle");
export const PRACTICE_SECTION_TITLE = () => t("practice.title");
export const PRACTICE_SECTION_HINT = () => t("practice.hint");
export const MORE_FILTERS_SUMMARY = () => t("filters.moreSummary");
export const MORE_FILTERS_HINT = () => t("filters.moreHint");

export const HONESTY_SUMMARY = () => t("honesty.summary");
export const HONESTY_DETAILS = () => t("honesty.details");
export const MAKER_HONESTY_DETAILS = () => t("honesty.makerDetails");
export const MAKER_GENERATED_HONESTY = () => t("honesty.makerGenerated");

/** Snapshot of kid-facing strings for the active locale (jargon gate). */
export function kidFacingCopyText(): string {
  return [
    HOW_TO_PLAY_TITLE(),
    ...HOW_TO_PLAY_STEPS(),
    KID_LEDE(),
    HELPER_BLURB(),
    LEARN_THE_RULES_LABEL(),
    START_HERE_DIFFICULTY_LABEL(),
    START_HERE_GENERATE_LABEL(),
    START_HERE_CARD_BADGE(),
    START_FIGHT_LABEL(),
    MAKER_HOW_TO(),
    MAKER_GATE_OK(),
    MAKER_GATE_BLOCKED(),
    WIN_GOAL_HINT(),
    WIN_HEADLINE(),
    LOSS_HEADLINE(),
    FIGHT_PANEL_TITLE(),
    FIGHT_TURN_HELP(),
    SETUP_CHOICES_TITLE(),
    SPELLS_TITLE(),
    PLACE_IN_LINE_LABEL(),
    PLACE_IN_LINE_HINT(),
    EMPTY_BOARD_HINT(),
    DOORS_FACE_TITLE(),
    PRACTICE_SECTION_TITLE(),
    PRACTICE_SECTION_HINT(),
    MORE_FILTERS_SUMMARY(),
    HONESTY_SUMMARY(),
  ].join("\n");
}

/** @deprecated Use kidFacingCopyText() */
export const KID_FACING_COPY = kidFacingCopyText;

const JARGON = [/FR-4/i, /C rooms?/i, /Gunner duration/i, /ledger/i, /Simulated/i, /choix/i, /extermination/i];

export function kidFacingCopyIsPlain(text: string = kidFacingCopyText()): boolean {
  return JARGON.every((pattern) => !pattern.test(text));
}

export function difficultyChipLabel(band: string, count?: number): string {
  if (band === UNSPECIFIED_DIFFICULTY) {
    return count === undefined
      ? t("difficulty.unspecified")
      : t("difficulty.unspecifiedCount", { count });
  }
  return count === undefined
    ? t("difficulty.chip", { band })
    : t("difficulty.chipCount", { band, count });
}

export function difficultyEntryLabel(difficulty: number | string | null): string {
  if (difficulty === null) return "";
  return t("difficulty.entry", { difficulty });
}

export function firstPlayableDifficulty1(
  catalog: readonly CampaignEntry[],
): CampaignEntry | undefined {
  return catalog.find((entry) => entry.playable && entry.difficultyBand === "1");
}

export function outcomeHeadline(outcome: "win" | "loss" | "stalemate" | "in_progress"): string | null {
  if (outcome === "win") return WIN_HEADLINE();
  if (outcome === "loss") return LOSS_HEADLINE();
  if (outcome === "stalemate") return STALEMATE_HEADLINE();
  return null;
}
