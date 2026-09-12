// NFR-8: known gaps must be deferred, never silently guessed.
// Proves the engine does not invent FR-18 / C behavior or Gunner duration.
// Does not close FR-18, FR-4, or S3 semantics.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyCampaignPlayability } from "./campaign.js";
import { parseHero, parseLevel, parseRoom } from "./loader.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import { simulate } from "./simulation.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("NFR-8 spec completeness gate — defer, do not invent", () => {
  it("keeps C opaque (S2 / FR-18) and invents no C entry effect", () => {
    expect(parseRoom("C(1, 2)")).toEqual({ type: "C", args: [1, 2] });
    expect(parseRoom("C(∞, 2)")).toEqual({ type: "C", args: ["∞", 2] });

    const simSrc = readFileSync(join(here, "simulation.ts"), "utf8");
    expect(simSrc).not.toMatch(/def\.type === ["']C["']/);
    expect(simSrc).not.toMatch(/case ["']C["']/);

    const level = makeLevel(
      [{ type: "A" }, { type: "C", args: [1] }, { type: "Z" }],
      [{ type: "Warrior", hp: 5 }],
      "nfr8-c-passthrough",
    );
    const layout = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "C:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const state = simulate(level, layout);
    expect(state.events.some((e) => e.type === "enter" && e.roomId === "C:0")).toBe(true);
    expect(state.events.filter((e) => e.type === "damage")).toHaveLength(0);
    expect(state.events.filter((e) => e.type === "teleport")).toHaveLength(0);
    expect(state.heroes[0]?.hp).toBe(5);
    expect(state.outcome).toBe("loss");
  });

  it("stores Gunner duration and does not read it (S3 / FR-22)", () => {
    expect(parseHero("Gunner(2, 1, 99)")).toEqual({
      type: "Gunner",
      hp: 2,
      shots: 1,
      duration: 99,
    });
    const gunnerSrc = readFileSync(join(here, "gunner.ts"), "utf8");
    expect(gunnerSrc).not.toMatch(/def\.duration/);
    expect(gunnerSrc).not.toMatch(/input\.duration/);
    expect(gunnerSrc).toMatch(/never read/);
  });

  it("keeps C and Gunner-duration levels unplayable in the campaign", () => {
    const withC = parseLevel(`id: nfr8-c
Salles : A, Z, C(1)
Héros : Guerrier(5)
`);
    expect(classifyCampaignPlayability(withC)).toMatchObject({
      playable: false,
      reasons: expect.arrayContaining(["c_room"]),
    });

    const withDur = parseLevel(`id: nfr8-dur
Salles : A, Z, D(1)
Héros : Artilleur(1, 1, ∞)
`);
    expect(classifyCampaignPlayability(withDur)).toMatchObject({
      playable: false,
      reasons: expect.arrayContaining(["gunner_duration"]),
    });
  });
});
