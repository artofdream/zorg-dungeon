// Campaign catalog: Difficulté parse, quarantine skip, playability (NFR-2 / NFR-8).
// Does not claim FR-4 gating, FR-18 C behavior, or Gunner duration semantics.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  authoredCampaignContracts,
  bindNamedChoix,
  buildCampaignCatalog,
  classifyCampaignPlayability,
  defaultNamedChoices,
  difficultyBand,
  groupCampaignByDifficulty,
  isQuarantineFixturePath,
  parseDifficultyFromText,
  prepareCampaignLevel,
  resolveInlineChoix,
  unavailableReasonLabel,
  UNSPECIFIED_DIFFICULTY,
} from "./campaign.js";
import { stubContracts } from "./contracts.js";
import { flattenRooms, isChoixDef } from "./level.js";
import { parseLevel } from "./loader.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function listTxtRecursive(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "sponsor-extract") continue;
      listTxtRecursive(path, acc);
    } else if (name.name.endsWith(".txt")) {
      acc.push(path);
    }
  }
  return acc.sort();
}

function filesFromDisk(): { path: string; text: string }[] {
  return listTxtRecursive(fixturesRoot).map((abs) => ({
    path: relative(fixturesRoot, abs),
    text: readFileSync(abs, "utf8"),
  }));
}

describe("Difficulté parsing", () => {
  it("reads a numeric Difficulté line from authored text", () => {
    expect(parseDifficultyFromText("Salles : A\nDifficulté : 1\n")).toBe(1);
    expect(parseDifficultyFromText("Difficulty: 4")).toBe(4);
  });

  it("keeps a trailing author note and still bands on the leading digit", () => {
    const raw = parseDifficultyFromText(
      "Difficulté : 2 (euh y a un problème dans celui-ci à mon grand regret)",
    );
    expect(raw).toBe("2 (euh y a un problème dans celui-ci à mon grand regret)");
    expect(difficultyBand(raw)).toBe("2");
  });

  it("bands missing Difficulté as unspecified (deluxe contracts have no line)", () => {
    expect(parseDifficultyFromText("id: deluxe-1.2\nSalles : A, Z\n")).toBeUndefined();
    expect(difficultyBand(undefined)).toBe(UNSPECIFIED_DIFFICULTY);
    expect(difficultyBand("")).toBe(UNSPECIFIED_DIFFICULTY);
  });
});

describe("quarantine and Blabla stubs stay out of the playable catalog", () => {
  it("detects quarantine folders on posix and windows paths", () => {
    expect(isQuarantineFixturePath("base-classic/quarantine/11-dream-trap.txt")).toBe(true);
    expect(isQuarantineFixturePath("contracts/quarantine/10.7.txt")).toBe(true);
    expect(isQuarantineFixturePath("base-classic\\quarantine\\18-math-bath.txt")).toBe(true);
    expect(isQuarantineFixturePath("base-classic/01-foundations.txt")).toBe(false);
  });

  it("omits quarantine fixtures and Blabla 11–15 (empty levelIds)", () => {
    const catalog = buildCampaignCatalog(filesFromDisk());
    expect(catalog.some((e) => e.path.includes("quarantine"))).toBe(false);
    expect(catalog.some((e) => e.id === "base-classic-11")).toBe(false);
    expect(catalog.some((e) => e.id === "deluxe-10.7")).toBe(false);
    const stubs = stubContracts();
    expect(stubs.map((c) => c.id)).toEqual(["11", "12", "13", "14", "15"]);
    for (const stub of stubs) {
      expect(stub.levelIds).toEqual([]);
    }
    expect(authoredCampaignContracts().every((c) => !c.stub && c.levelIds.length > 0)).toBe(true);
    expect(authoredCampaignContracts()).toHaveLength(10);
  });
});

describe("playability does not invent deferred rules", () => {
  it("marks Foundations playable (no C, no Gunner duration, resolved tokens)", () => {
    const level = parseLevel(readFileSync(join(fixturesRoot, "base-classic/01-foundations.txt"), "utf8"));
    const play = classifyCampaignPlayability(level);
    expect(play).toEqual({ playable: true, reasons: [], needsChoix: false });
    expect(flattenRooms(prepareCampaignLevel(level).rooms)).toHaveLength(4);
  });

  it("marks C rooms unavailable (FR-18 / S2)", () => {
    const level = parseLevel(`id: c-only
Salles : A, Z, C(1)
Héros : Guerrier(5)
`);
    const play = classifyCampaignPlayability(level);
    expect(play.playable).toBe(false);
    expect(play.reasons).toContain("c_room");
    expect(unavailableReasonLabel("c_room")).toMatch(/FR-18/);
  });

  it("marks Gunner third-arg duration unavailable (S3)", () => {
    const level = parseLevel(`id: gunner-dur
Salles : A, Z, D(1)
Héros : Artilleur(1, 1, ∞)
`);
    const play = classifyCampaignPlayability(level);
    expect(play.playable).toBe(false);
    expect(play.reasons).toContain("gunner_duration");
  });

  it("keeps 2-arg Gunner playable", () => {
    const level = parseLevel(`id: gunner-2
Salles : A, Z, D(1)
Héros : Artilleur(1, 7)
`);
    expect(classifyCampaignPlayability(level).playable).toBe(true);
  });

  it("marks opaque / unbindable tokens unavailable", () => {
    const level = parseLevel(`id: opaque-e
Salles : A, Z, E(λ)
Héros : Guerrier(5)
`);
    const play = classifyCampaignPlayability(level);
    expect(play.playable).toBe(false);
    expect(play.reasons).toContain("unresolved");
  });

  it("treats named ℕ choix as playable setup, not unavailable", () => {
    const level = parseLevel(readFileSync(join(fixturesRoot, "base-classic/14-sleep-cycle.txt"), "utf8"));
    const play = classifyCampaignPlayability(level);
    expect(play.playable).toBe(true);
    expect(play.needsChoix).toBe(true);
    const bound = bindNamedChoix(level, defaultNamedChoices(level));
    expect(bound.spells?.[0]).toMatchObject({ type: "Repeat", count: 1 });
  });

  it("resolves inline hero choix without inventing a new hero type", () => {
    const level = parseLevel(readFileSync(join(fixturesRoot, "base-classic/12-chemical-loophole.txt"), "utf8"));
    expect(classifyCampaignPlayability(level)).toMatchObject({ playable: true, needsChoix: true });
    expect(isChoixDef(level.heroes[0])).toBe(true);
    const resolved = resolveInlineChoix(level, {
      rooms: [[]],
      heroes: [[1]],
      spells: [],
    });
    expect(resolved.heroes).toEqual([{ type: "Elf", hp: 1, immunities: [] }]);
  });
});

describe("catalog grouping by Difficulté", () => {
  it("groups the authored pack and keeps contract flavour off the gate", () => {
    const catalog = buildCampaignCatalog(filesFromDisk());
    expect(catalog.length).toBeGreaterThanOrEqual(118);
    expect(catalog.every((e) => e.id !== "level-0")).toBe(true);

    const foundations = catalog.find((e) => e.id === "base-classic-1");
    expect(foundations).toMatchObject({
      name: "Foundations",
      difficulty: 1,
      difficultyBand: "1",
      playable: true,
      pack: "base-classic",
    });

    const deluxe = catalog.find((e) => e.id === "deluxe-1.2");
    expect(deluxe).toMatchObject({
      difficultyBand: UNSPECIFIED_DIFFICULTY,
      contractId: "1",
      contractName: "The Basics",
      contractCost: 0,
      playable: true,
    });

    const artillery = catalog.find((e) => e.id === "deluxe-9.2");
    expect(artillery?.playable).toBe(false);
    expect(artillery?.unavailableReasons).toContain("c_room");
    expect(artillery?.contractName).toBe("Artillery");
    expect(artillery?.contractCost).toBe(40);

    const groups = groupCampaignByDifficulty(catalog);
    expect(groups.map((g) => g.band)).toEqual(["1", "2", "3", "4", UNSPECIFIED_DIFFICULTY]);
    expect(groups[0]?.entries.every((e) => e.difficultyBand === "1")).toBe(true);

    const playable = catalog.filter((e) => e.playable);
    expect(playable.length).toBeGreaterThan(20);
    for (const entry of playable) {
      const prepared = prepareCampaignLevel(parseLevel(entry.text));
      expect(flattenRooms(prepared.rooms).length).toBeGreaterThan(0);
      expect(prepared.heroes.some((h) => isChoixDef(h))).toBe(false);
    }
  });
});
