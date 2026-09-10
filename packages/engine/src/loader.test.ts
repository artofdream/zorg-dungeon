// Covers FR-1: Level data model, room multiplicities, flattening, and parser.
// Covers FR-2: Player-chosen choix(n, E) variables with substitution.
// Covers FR-3: Order and orientation capture for player choices.
// Covers NFR-2: Data-driven content representation.
// Covers NFR-9: Authoring ergonomics and validation.

import { describe, expect, it } from "vitest";
import {
  flattenRooms,
  LevelDef,
  PlayerChoice,
  substituteVariables,
  validatePlayerChoice,
} from "./level.js";
import {
  parseHero,
  parseHeroes,
  parseLevel,
  parseRoom,
  parseRooms,
  parseSpell,
  parseSpells,
  parseVariable,
  serializeLevel,
  validateLevel,
} from "./loader.js";

describe("FR-1: Level Data Model & Flattening", () => {
  it("flattens room multiplicities accurately", () => {
    const multiplicities = [
      { count: 2, room: { type: "A" as const } },
      { count: 1, room: { type: "Z" as const } },
      { count: 3, room: { type: "D" as const, damage: 4 } },
    ];
    const flattened = flattenRooms(multiplicities);
    expect(flattened).toHaveLength(6);
    expect(flattened[0]).toEqual({ type: "A" });
    expect(flattened[1]).toEqual({ type: "A" });
    expect(flattened[2]).toEqual({ type: "Z" });
    expect(flattened[3]).toEqual({ type: "D", damage: 4 });
    expect(flattened[4]).toEqual({ type: "D", damage: 4 });
    expect(flattened[5]).toEqual({ type: "D", damage: 4 });
  });

  it("parses all room types with arguments", () => {
    expect(parseRoom("A")).toEqual({ type: "A" });
    expect(parseRoom("Z")).toEqual({ type: "Z" });
    expect(parseRoom("D(5)")).toEqual({ type: "D", damage: 5 });
    expect(parseRoom("D(-2)")).toEqual({ type: "D", damage: -2 });
    expect(parseRoom("E(fire)")).toEqual({ type: "E", element: "fire" });
    expect(parseRoom("P(3, i->i-1)")).toEqual({ type: "P", entries: 3, formula: "i->i-1" });
    expect(parseRoom("O(100)")).toEqual({ type: "O", gold: 100 });
    expect(parseRoom("T(10, poison)")).toEqual({ type: "T", cost: 10, element: "poison" });
    expect(parseRoom("C(1, 2)")).toEqual({ type: "C", args: [1, 2] });
  });

  it("parses room lists with varied multiplicity syntax", () => {
    const text = "2 A, 1 Z, 3*D(2), 2x E(water), O(50)";
    const rooms = parseRooms(text);
    expect(rooms).toEqual([
      { count: 2, room: { type: "A" } },
      { count: 1, room: { type: "Z" } },
      { count: 3, room: { type: "D", damage: 2 } },
      { count: 2, room: { type: "E", element: "water" } },
      { count: 1, room: { type: "O", gold: 50 } },
    ]);
  });

  it("parses all 5 hero types and their parameter signatures", () => {
    expect(parseHero("Warrior(10)")).toEqual({ type: "Warrior", hp: 10 });
    expect(parseHero("Elf(8, [fire, water])")).toEqual({
      type: "Elf",
      hp: 8,
      immunities: ["fire", "water"],
    });
    expect(parseHero("Gunner(6, 3)")).toEqual({
      type: "Gunner",
      hp: 6,
      shots: 3,
      duration: undefined,
    });
    expect(parseHero("Gunner(4, 2, inf)")).toEqual({
      type: "Gunner",
      hp: 4,
      shots: 2,
      duration: "inf",
    });
    expect(parseHero("Gunner(2, ∞, ∞)")).toEqual({
      type: "Gunner",
      hp: 2,
      shots: "inf",
      duration: "inf",
    });
    expect(parseHero("Gunner(2, inf, inf)")).toEqual({
      type: "Gunner",
      hp: 2,
      shots: "inf",
      duration: "inf",
    });
    expect(parseHero("Mechanic(12, {Z: 2})")).toEqual({
      type: "Mechanic",
      hp: 12,
      powerSteps: { Z: 2 },
    });
    expect(parseHero("Princess(10, {Z: 1}, 3)")).toEqual({
      type: "Princess",
      hp: 10,
      weights: { Z: 1 },
      pull: 3,
    });
  });

  it("parses hero spawn lists preserving spawn order", () => {
    const text = "Warrior(10), Elf(8, [poison]), Gunner(5, 2)";
    const heroes = parseHeroes(text);
    expect(heroes).toHaveLength(3);
    expect(heroes[0]?.type).toBe("Warrior");
    expect(heroes[1]?.type).toBe("Elf");
    expect(heroes[2]?.type).toBe("Gunner");
  });

  it("parses all one-time spell types", () => {
    expect(parseSpell("Attack(5)")).toEqual({ type: "Attack", damage: 5 });
    expect(parseSpell("Teleport(2)")).toEqual({ type: "Teleport", steps: 2 });
    expect(parseSpell("Move()")).toEqual({ type: "Move" });
    expect(parseSpell("Swap")).toEqual({ type: "Swap" });
    expect(parseSpell("Selection(true)")).toEqual({ type: "Selection", allowCorpses: true });
    expect(parseSpell("Selection(false)")).toEqual({ type: "Selection", allowCorpses: false });
    expect(parseSpell("Sleep()")).toEqual({ type: "Sleep" });
    expect(parseSpell("Wake()")).toEqual({ type: "Wake" });
    expect(parseSpell("Banality")).toEqual({ type: "Banality" });
  });

  it("parses a complete textual level definition", () => {
    const dsl = `
id: level-intro
Level: The First Trial
Contract: 1
Π: 2 A, 1 Z, 2 D(3)
Γ: Warrior(12), Elf(6, [fire])
Φ: Attack(4), Move()
Constraints:
  - dist(A, Z) >= 3
Bonuses:
  - gold >= 20
`;
    const level = parseLevel(dsl);
    expect(level.id).toBe("level-intro");
    expect(level.name).toBe("The First Trial");
    expect(level.contractId).toBe("1");
    expect(level.rooms).toHaveLength(3);
    expect(level.heroes).toHaveLength(2);
    expect(level.spells).toHaveLength(2);
    expect(level.constraints).toEqual([{ id: "c-1", expression: "dist(A, Z) >= 3" }]);
    expect(level.bonuses).toEqual([{ id: "b-1", expression: "gold >= 20" }]);
  });
});

describe("FR-2: Player-Chosen Variables choix(n, E) & Substitution", () => {
  it("parses finite-domain, N, and repeats-allowed variable definitions", () => {
    const finite = parseVariable("X = choix(1, {1, 2, 3})");
    expect(finite.name).toBe("X");
    expect(finite.n).toBe(1);
    expect(finite.domain).toEqual([1, 2, 3]);
    expect(finite.allowRepeats).toBe(false);

    const natural = parseVariable("K = choix(2, N)");
    expect(natural.domain).toBe("N");
    expect(natural.n).toBe(2);

    const listVar = parseVariable("L = choix(3, liste(fire, water))");
    expect(listVar.allowRepeats).toBe(true);
    expect(listVar.domain).toEqual(["fire", "water"]);
  });

  it("validates player choices against stated domains", () => {
    const vFinite = parseVariable("X = choix(1, {1, 2, 3})");

    const validChoice: PlayerChoice = { variableName: "X", selected: [2] };
    expect(validatePlayerChoice(vFinite, validChoice).valid).toBe(true);

    const invalidChoice: PlayerChoice = { variableName: "X", selected: [99] };
    const invalidResult = validatePlayerChoice(vFinite, invalidChoice);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors[0]).toContain("not in the allowed domain");

    const vNoRepeat = parseVariable("Y = choix(2, [A, B, C])");
    const repeatChoice: PlayerChoice = { variableName: "Y", selected: ["A", "A"] };
    expect(validatePlayerChoice(vNoRepeat, repeatChoice).valid).toBe(false);

    const vNatural = parseVariable("Z = choix(1, N)");
    expect(validatePlayerChoice(vNatural, { variableName: "Z", selected: [-5] }).valid).toBe(false);
    expect(validatePlayerChoice(vNatural, { variableName: "Z", selected: [4] }).valid).toBe(true);
  });

  it("substitutes scalar variables into rooms, heroes, spells, and constraints", () => {
    const dsl = `
id: var-test
Level: Variable Dungeon
Rooms: 1 A, 1 Z, 1 D($DMG)
Heroes: Warrior($WARRIOR_HP)
Spells: Attack($SPELL_PWR)
Variables:
  DMG = choix(1, {2, 4, 6})
  WARRIOR_HP = choix(1, {10, 20})
  SPELL_PWR = choix(1, {3, 5})
Constraints:
  - dist(A, Z) >= $DMG
`;
    const level = parseLevel(dsl);
    const choices: Record<string, PlayerChoice> = {
      DMG: { variableName: "DMG", selected: [6] },
      WARRIOR_HP: { variableName: "WARRIOR_HP", selected: [20] },
      SPELL_PWR: { variableName: "SPELL_PWR", selected: [5] },
    };

    const substituted = substituteVariables(level, choices);
    const roomD = substituted.rooms[2]?.room;
    expect(roomD?.type === "D" ? roomD.damage : null).toBe(6);
    const hero0 = substituted.heroes[0];
    expect(hero0 && hero0.type !== "Choix" ? hero0.hp : null).toBe(20);
    const spellAtk = substituted.spells?.[0];
    expect(spellAtk?.type === "Attack" ? spellAtk.damage : null).toBe(5);
    expect(substituted.constraints?.[0]?.expression).toBe("dist(A, Z) >= 6");
  });

  it("substitutes multi-pick variables as whole tokens and inline in expressions", () => {
    const dsl = `
id: multi-pick
Level: Multi Pick
Rooms: 1 A, 1 Z
Heroes: Warrior(10)
Variables:
  ITEMS = choix(2, [fire, water, ice])
Constraints:
  - ordered($ITEMS)
Bonuses:
  - includes({ITEMS})
`;
    const level = parseLevel(dsl);
    // Whole-token field: a room argument stored as "$ITEMS"
    level.rooms.push({ count: 1, room: { type: "C", args: ["$ITEMS"] } });

    const choices: Record<string, PlayerChoice> = {
      ITEMS: { variableName: "ITEMS", selected: ["fire", "water"] },
    };

    const substituted = substituteVariables(level, choices);
    expect(substituted.constraints?.[0]?.expression).toBe('ordered(["fire","water"])');
    expect(substituted.bonuses?.[0]?.expression).toBe('includes(["fire","water"])');
    const roomC = substituted.rooms[2]?.room;
    expect(roomC?.type === "C" ? roomC.args : null).toEqual([["fire", "water"]]);
  });
});

describe("FR-3: Order and Orientation Capture for Player Choices", () => {
  it("parses order and orientation options on choix(n, E)", () => {
    const v = parseVariable("ITEMS = choix(2, [fire, water, ice], order=true, orientation=true)");
    expect(v.captureOrder).toBe(true);
    expect(v.captureOrientation).toBe(true);
    expect(v.n).toBe(2);
  });

  it("validates player choice orientation angles per FR-3", () => {
    const v = parseVariable("TILES = choix(2, [A, Z], orientation=true)");

    const validOrientations: PlayerChoice = {
      variableName: "TILES",
      selected: ["A", "Z"],
      orientations: [0, 90],
    };
    expect(validatePlayerChoice(v, validOrientations).valid).toBe(true);

    const invalidOrientation: PlayerChoice = {
      variableName: "TILES",
      selected: ["A", "Z"],
      orientations: [0, 45 as any], // 45 is not cardinal (0, 90, 180, 270)
    };
    const res = validatePlayerChoice(v, invalidOrientation);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("Must be one of: 0, 90, 180, 270 degrees");
  });

  it("preserves selection order in player choice", () => {
    const v = parseVariable("ORDERED = choix(2, [1, 2, 3], order=true)");
    const choiceA: PlayerChoice = { variableName: "ORDERED", selected: [1, 2] };
    const choiceB: PlayerChoice = { variableName: "ORDERED", selected: [2, 1] };

    expect(choiceA.selected).not.toEqual(choiceB.selected);
    expect(validatePlayerChoice(v, choiceA).valid).toBe(true);
    expect(validatePlayerChoice(v, choiceB).valid).toBe(true);
  });
});

describe("NFR-9 & NFR-2: Authoring Ergonomics, Validation & Canonical Serialization", () => {
  it("validates level completeness and catches missing critical rooms", () => {
    const invalidLevel: LevelDef = {
      id: "broken",
      name: "Broken",
      rooms: [{ count: 1, room: { type: "D", damage: 10 } }],
      heroes: [{ type: "Warrior", hp: 10 }],
    };
    const validation = validateLevel(invalidLevel);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Level must contain at least one spawn room ('A').");
    expect(validation.errors).toContain("Level must contain at least one Zorg room ('Z').");
  });

  it("parses French base-classic keywords, braces, and multiplicities", () => {
    expect(parseHero("Guerrier(5)")).toEqual({ type: "Warrior", hp: 5 });
    expect(parseHero("Elfe(5, {eau})")).toEqual({
      type: "Elf",
      hp: 5,
      immunities: ["water"],
    });
    expect(parseHero("Artilleur(6, 1)")).toEqual({
      type: "Gunner",
      hp: 6,
      shots: 1,
      duration: undefined,
    });
    expect(parseHero("Mécanicien(2, {D:5, E:10})")).toEqual({
      type: "Mechanic",
      hp: 2,
      powerSteps: { D: 5, E: 10 },
    });
    expect(parseHero("Princesse(4, {Z:1}, 2)")).toEqual({
      type: "Princess",
      hp: 4,
      weights: { Z: 1 },
      pull: 2,
    });
    expect(parseSpell("Attaque(1)")).toEqual({ type: "Attack", damage: 1 });
    expect(parseSpell("Téléportation(1)")).toEqual({ type: "Teleport", steps: 1 });
    expect(parseSpell("Échange")).toEqual({ type: "Swap" });
    expect(parseSpell("Déplacement")).toEqual({ type: "Move" });
    expect(parseSpell("Somnolence")).toEqual({ type: "Sleep" });
    expect(parseSpell("Réveil")).toEqual({ type: "Wake" });
    expect(parseSpell("Banalité")).toEqual({ type: "Banality" });
    expect(parseRoom("E(feu)")).toEqual({ type: "E", element: "fire" });
    expect(parseRoom("E(glace)")).toEqual({ type: "E", element: "ice" });
    expect(parseRooms("2xD(1), 2*E(feu)")).toEqual([
      { count: 2, room: { type: "D", damage: 1 } },
      { count: 2, room: { type: "E", element: "fire" } },
    ]);
  });

  it("parse-accepts opaque C args and Gunner third arg without inventing rules", () => {
    expect(parseRoom("C(∞, 2)")).toEqual({ type: "C", args: ["∞", 2] });
    expect(parseHero("Artilleur(1, 3, 2)")).toEqual({
      type: "Gunner",
      hp: 1,
      shots: 3,
      duration: 2,
    });
  });

  it("round-trips level DSL serialization without data loss", () => {
    const originalDsl = `id: roundtrip-1
Level: Roundtrip Fortress
Contract: contract-alpha
Rooms: 2 A, 1 Z, 3 D(4), 1 E(poison)
Heroes: Warrior(15), Elf(10, [ice])
Spells: Attack(6), Teleport(3)
Variables:
  ROOM_CHOICE = choix(1, [fire, water])
Constraints:
  - dist(A, Z) >= 4
Bonuses:
  - gold >= 100`;

    const parsed = parseLevel(originalDsl);
    expect(validateLevel(parsed).valid).toBe(true);

    const serialized = serializeLevel(parsed);
    const parsedAgain = parseLevel(serialized);
    expect(parsedAgain).toEqual(parsed);
  });
});
