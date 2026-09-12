// J-KID / J-HELPER landing copy — Simulated evidence that first-run strings
// stay kid-facing. Not a live browser probe. See docs/PLAYER_JOURNEYS.md.
import { describe, expect, it } from "vitest";
import type { CampaignEntry } from "@zorg/engine";
import {
  HONESTY_DETAILS,
  HOW_TO_PLAY_STEPS,
  KID_FACING_COPY,
  KNOWLEDGE_GUIDE_HREF,
  KNOWLEDGE_LEARN_HREF,
  LEARN_THE_RULES_LABEL,
  START_HERE_DIFFICULTY_LABEL,
  START_HERE_GENERATE_LABEL,
  difficultyChipLabel,
  firstPlayableDifficulty1,
  kidFacingCopyIsPlain,
} from "./first-run.js";

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
  });

  it("teaches pick / generate, A toward Z, Start fight, and heroes die before Z", () => {
    expect(HOW_TO_PLAY_STEPS).toHaveLength(4);
    expect(HOW_TO_PLAY_STEPS[0]).toMatch(/easy level|Generate Difficulty 1/i);
    expect(HOW_TO_PLAY_STEPS[1]).toMatch(/A .*(Zorg|Z)/i);
    expect(HOW_TO_PLAY_STEPS[2]).toMatch(/Start fight/);
    expect(HOW_TO_PLAY_STEPS[3]).toMatch(/die before they reach Z/);
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
});
