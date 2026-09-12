// J-KID / J-HELPER landing copy — Simulated evidence that first-run strings
// stay kid-facing. Not a live browser probe. See docs/PLAYER_JOURNEYS.md.
import { describe, expect, it } from "vitest";
import type { CampaignEntry } from "@zorg/engine";
import {
  FIGHT_PANEL_TITLE,
  HONESTY_DETAILS,
  HOW_TO_PLAY_STEPS,
  KID_FACING_COPY,
  KNOWLEDGE_GUIDE_HREF,
  KNOWLEDGE_LEARN_HREF,
  LEARN_THE_RULES_LABEL,
  MORE_FILTERS_SUMMARY,
  SETUP_CHOICES_TITLE,
  SPELLS_TITLE,
  START_HERE_DIFFICULTY_LABEL,
  START_HERE_GENERATE_LABEL,
  WIN_HEADLINE,
  WIN_GOAL_HINT,
  difficultyChipLabel,
  firstPlayableDifficulty1,
  kidFacingCopyIsPlain,
  outcomeHeadline,
} from "./first-run.js";
import { displayCampaignTitle } from "./labels.js";

function stubEntry(partial: Partial<CampaignEntry> & Pick<CampaignEntry, "id">): CampaignEntry {
  return {
    name: partial.id,
    path: `${partial.id}.txt`,
    pack: "base-classic",
    difficulty: 1,
    difficultyBand: "1",
    contractId: null,
    contractName: null,
    contractCost: null,
    contractCostNote: null,
    playable: true,
    unavailableReasons: [],
    needsChoix: false,
    text: "",
    ...partial,
  };
}

describe("first-run persona copy (J-KID / J-HELPER)", () => {
  it("keeps kid-facing strings free of engineer jargon", () => {
    expect(kidFacingCopyIsPlain()).toBe(true);
    expect(KID_FACING_COPY).not.toMatch(/FR-4|C room|Gunner duration|ledger|Simulated|choix|extermination/i);
    expect(FIGHT_PANEL_TITLE).toBe("Fight");
    expect(SPELLS_TITLE).toBe("Spells");
    expect(SETUP_CHOICES_TITLE).toBe("Setup choices");
    expect(MORE_FILTERS_SUMMARY).toMatch(/More filters/i);
  });

  it("teaches pick / generate, Start toward Exit, Start fight, and stop-before-exit win", () => {
    expect(HOW_TO_PLAY_STEPS).toHaveLength(4);
    expect(HOW_TO_PLAY_STEPS[0]).toMatch(/easy level|Generate Difficulty 1/i);
    expect(HOW_TO_PLAY_STEPS[1]).toMatch(/Start \(A\).*(Exit \(Z\)|Exit)/i);
    expect(HOW_TO_PLAY_STEPS[2]).toMatch(/Start fight/);
    expect(HOW_TO_PLAY_STEPS[3]).toMatch(/stop the heroes before they reach the exit/i);
    expect(WIN_GOAL_HINT).toMatch(/stop the heroes before they reach the exit/i);
    expect(WIN_HEADLINE).toMatch(/stopped them before they reached the exit/i);
    expect(outcomeHeadline("win")).toBe(WIN_HEADLINE);
    expect(outcomeHeadline("win")).not.toMatch(/every hero is dead/i);
    expect(START_HERE_DIFFICULTY_LABEL).toBe("Start here — Difficulty 1");
    expect(START_HERE_GENERATE_LABEL).toBe("Start here — Generate Difficulty 1");
    expect(KNOWLEDGE_LEARN_HREF).toMatch(/learn\.html/);
    expect(LEARN_THE_RULES_LABEL).toBe("Learn the rules");
    expect(KNOWLEDGE_GUIDE_HREF).toMatch(/guide\.html/);
  });

  it("puts FR / C / Gunner / Simulated honesty in the collapsed details only", () => {
    expect(HONESTY_DETAILS).toMatch(/FR-4/);
    expect(HONESTY_DETAILS).toMatch(/C rooms/);
    expect(HONESTY_DETAILS).toMatch(/Gunner duration/);
    expect(HONESTY_DETAILS).toMatch(/Simulated/);
    expect(kidFacingCopyIsPlain(HONESTY_DETAILS)).toBe(false);
  });

  it("labels Difficulty first, with Difficulté as the source word", () => {
    expect(difficultyChipLabel("1", 9)).toBe("Difficulty 1 (Difficulté 1) (9)");
    expect(difficultyChipLabel("unspecified", 91)).toBe("No Difficulty (no Difficulté) (91)");
  });

  it("picks the first playable Difficulty 1 catalog card for Start here", () => {
    const catalog = [
      stubEntry({ id: "locked", playable: false, difficultyBand: "1" }),
      stubEntry({ id: "foundations", playable: true, difficultyBand: "1", name: "Foundations" }),
      stubEntry({ id: "later", playable: true, difficultyBand: "2", difficulty: 2 }),
    ];
    expect(firstPlayableDifficulty1(catalog)?.id).toBe("foundations");
    expect(firstPlayableDifficulty1(catalog.filter((e) => e.difficultyBand === "2"))).toBeUndefined();
  });

  it("never shows an empty campaign card title", () => {
    expect(displayCampaignTitle({ id: "base-classic-1", name: "" })).toMatch(/Classic 1|Base Classic 1|1/i);
    expect(displayCampaignTitle({ id: "foundations", name: '""' })).toBe("Foundations");
    expect(displayCampaignTitle({ id: "x", name: "  Foundations  " })).toBe("Foundations");
  });
});
