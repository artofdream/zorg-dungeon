import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HeroSlot } from "@zorg/engine";
import {
  collectHeroTypes,
  HERO_TYPES,
  heroIconSrc,
  heroTypesFromLevelText,
  isHeroType,
} from "./hero-icons.js";

const heroesDir = join(dirname(fileURLToPath(import.meta.url)), "../public/heroes");

describe("hero figurine assets (UI-only)", () => {
  it("maps each HeroType to a distinct public SVG", () => {
    const srcs = HERO_TYPES.map(heroIconSrc);
    expect(HERO_TYPES).toEqual(["Warrior", "Elf", "Gunner", "Mechanic", "Princess"]);
    expect(new Set(srcs).size).toBe(5);
    for (const type of HERO_TYPES) {
      expect(heroIconSrc(type)).toBe(`/heroes/${type.toLowerCase()}.svg`);
      expect(isHeroType(type)).toBe(true);
    }
    expect(isHeroType("Shell")).toBe(false);
    expect(isHeroType("C")).toBe(false);
  });

  it("ships one SVG per type with a shared viewBox and aria-label", () => {
    const files = readdirSync(heroesDir).filter((name) => name.endsWith(".svg")).sort();
    expect(files).toEqual(["elf.svg", "gunner.svg", "mechanic.svg", "princess.svg", "warrior.svg"]);
    for (const type of HERO_TYPES) {
      const svg = readFileSync(join(heroesDir, `${type.toLowerCase()}.svg`), "utf8");
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).toContain(`aria-label="${type}"`);
      expect(svg).toContain('role="img"');
    }
  });

  it("collects unique types in spec order, including choix options", () => {
    const slots: HeroSlot[] = [
      { type: "Princess", hp: 2, weights: { Z: 1 }, pull: 1 },
      {
        type: "Choix",
        n: 1,
        options: [
          { type: "Elf", hp: 3, immunities: [] },
          { type: "Warrior", hp: 4 },
        ],
      },
      { type: "Gunner", hp: 2, shots: 1 },
    ];
    expect(collectHeroTypes(slots)).toEqual(["Warrior", "Elf", "Gunner", "Princess"]);
  });

  it("reads hero types from level text and stays empty on unparseable input", () => {
    const text = [
      "id: ui-hero-icons",
      "name: UI icons",
      "Rooms: A, Z",
      "Heroes: Mechanic(3), Elf(2, [fire])",
    ].join("\n");
    expect(heroTypesFromLevelText(text)).toEqual(["Elf", "Mechanic"]);
    expect(heroTypesFromLevelText("not a level")).toEqual([]);
  });
});
