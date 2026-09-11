// Covers FR-32–FR-42 (Phase 4 spellbook, including Selection meta-dispatch).
// See src/spells.ts and src/simulation.ts.
import { describe, expect, it } from "vitest";
import { aezLine } from "./phase2-fixtures.js";
import { corridorLine } from "./phase3-fixtures.js";
import { adzSpellLevel, makeSpellLevel, placeAll } from "./phase4-fixtures.js";
import {
  canCastNow,
  castSpell,
  createRun,
  selectActiveHero,
  simulate,
  stepRun,
  SpellCastError,
} from "./simulation.js";
import { fr6BordersHold, teleportDestination } from "./spells.js";
import { DEFAULT_ROOM_TILE, sealSide } from "./tiles.js";

function adzCorridor(level: ReturnType<typeof adzSpellLevel>) {
  return corridorLine(level, ["A:0", "D:0", "Z:0"]);
}

function spawnThen(level: ReturnType<typeof adzSpellLevel>) {
  const layout = adzCorridor(level);
  const state = createRun(level, layout);
  stepRun(state);
  return state;
}

describe("FR-32 every spell is consumed permanently on cast", () => {
  it("consumes Attack and rejects a second cast of the same instance", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 1 }]);
    const state = spawnThen(level);
    expect(state.spells[0]?.consumed).toBe(false);
    castSpell(state, { spellId: 0 });
    expect(state.spells[0]?.consumed).toBe(true);
    expect(state.heroes[0]?.hp).toBe(4);
    expect(() => castSpell(state, { spellId: 0 })).toThrow(SpellCastError);
    expect(() => castSpell(state, { spellId: 0 })).toThrow(/already consumed/);
  });

  it("does not consume a spell when preconditions fail", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Move" }]);
    const state = spawnThen(level);
    expect(() => castSpell(state, { spellId: 0, dest: { x: 1, y: 0 } })).toThrow(/empty grid cell/);
    expect(state.spells[0]?.consumed).toBe(false);
    expect(state.layout.rooms.find((r) => r.id === "A:0")?.position).toEqual({ x: 0, y: 0 });
  });
});

describe("FR-33 cast only between completed actions, never mid-action", () => {
  it("rejects a cast before the first hero action", () => {
    const level = adzSpellLevel();
    const state = createRun(level, adzCorridor(level));
    expect(canCastNow(state)).toBe(false);
    expect(() => castSpell(state, { spellId: 0 })).toThrow(/before a hero action/);
    expect(state.spells[0]?.consumed).toBe(false);
  });

  it("rejects a cast while midAction is set (portal-style in-flight action)", () => {
    const level = adzSpellLevel();
    const state = spawnThen(level);
    expect(canCastNow(state)).toBe(true);
    state.midAction = true;
    expect(canCastNow(state)).toBe(false);
    expect(() => castSpell(state, { spellId: 0 })).toThrow(/mid-action/);
    state.midAction = false;
    expect(state.spells[0]?.consumed).toBe(false);
  });

  it("allows a cast the instant spawn completes, and stepRun clears midAction", () => {
    const level = adzSpellLevel();
    const state = spawnThen(level);
    expect(state.midAction).toBe(false);
    expect(state.events.some((e) => e.type === "spawn")).toBe(true);
    const { events } = castSpell(state, { spellId: 0 });
    expect(events.some((e) => e.type === "cast" && e.spellType === "Attack")).toBe(true);
  });
});

describe("FR-34 Attack(x) damages all living heroes, or a Selection subset", () => {
  it("hits every living hero, including one still in the waiting room", () => {
    const level = adzSpellLevel(
      2,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [{ type: "Attack", damage: 3 }],
    );
    const state = spawnThen(level);
    expect(state.heroes[1]?.spawned).toBe(false);
    castSpell(state, { spellId: 0 });
    expect(state.heroes[0]?.hp).toBe(2);
    expect(state.heroes[1]?.hp).toBe(2);
    expect(state.heroes[1]?.dead).toBe(false);
  });

  it("under Selection damages only the chosen heroes", () => {
    const level = adzSpellLevel(
      2,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [
        { type: "Selection", allowCorpses: false },
        { type: "Attack", damage: 4 },
      ],
    );
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, innerSpellId: 1, heroIds: [1] });
    expect(state.heroes[0]?.hp).toBe(5);
    expect(state.heroes[1]?.hp).toBe(1);
  });
});

describe("FR-35 Teleport(n) to the n-th-most-recent room, or the waiting room", () => {
  it("reads n=1 as the current visit and n=2 as the previous room", () => {
    const visits = [
      { roomId: "A:0", firstCell: { x: 2, y: 2 } },
      { roomId: "D:0", firstCell: { x: 5, y: 2 } },
    ];
    expect(teleportDestination(visits, 1)?.roomId).toBe("D:0");
    expect(teleportDestination(visits, 2)?.roomId).toBe("A:0");
    expect(teleportDestination(visits, 3)).toBeUndefined();
  });

  it("returns the active hero to their previous room's first cell", () => {
    const level = adzSpellLevel(1, [{ type: "Warrior", hp: 8 }], [{ type: "Teleport", steps: 2 }]);
    const state = createRun(level, adzCorridor(level));
    stepRun(state); // spawn A
    let guard = 0;
    while (state.heroes[0]?.roomId !== "D:0" && guard++ < 40) {
      stepRun(state);
    }
    expect(state.heroes[0]?.roomId).toBe("D:0");
    const from = state.heroes[0]?.cell;
    castSpell(state, { spellId: 0 });
    expect(state.heroes[0]?.roomId).toBe("A:0");
    expect(state.heroes[0]?.cell).toEqual({ x: 2, y: 2 });
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "teleport", heroId: 0, toRoomId: "A:0" }),
    );
    expect(from).not.toEqual(state.heroes[0]?.cell);
  });

  it("does not replace the main A when Teleport relocates into an older A", () => {
    // FR-11 replaces the main A only on a visit/entry. Spell Teleport is a
    // relocate (no visits push, no enterRoom), so hopping back to A:0 must
    // not retarget a later spawn.
    const level = makeSpellLevel(
      [{ type: "A" }, { type: "A" }, { type: "Z" }],
      [{ type: "Warrior", hp: 8 }],
      [{ type: "Teleport", steps: 2 }],
    );
    const layout = corridorLine(level, ["A:0", "A:1", "Z:0"]);
    const state = createRun(level, layout);
    stepRun(state); // spawn A:0
    expect(state.mainAId).toBe("A:0");
    let guard = 0;
    while (state.heroes[0]?.roomId !== "A:1" && guard++ < 40) {
      stepRun(state);
    }
    expect(state.heroes[0]?.roomId).toBe("A:1");
    expect(state.mainAId).toBe("A:1");
    castSpell(state, { spellId: 0 });
    expect(state.heroes[0]?.roomId).toBe("A:0");
    expect(state.mainAId).toBe("A:1");
  });

  it("falls back to the waiting room when history is too short", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Teleport", steps: 4 }]);
    const state = spawnThen(level);
    castSpell(state, { spellId: 0 });
    expect(state.heroes[0]?.spawned).toBe(false);
    expect(state.heroes[0]?.cell).toBeNull();
    expect(state.events.some((e) => e.type === "wait_room" && e.heroId === 0)).toBe(true);
  });

  it("under Selection teleports each chosen hero by the same n independently", () => {
    const level = adzSpellLevel(
      2,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [
        { type: "Selection", allowCorpses: false },
        { type: "Teleport", steps: 1 },
      ],
    );
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, innerSpellId: 1, heroIds: [0, 1] });
    expect(state.heroes[0]?.roomId).toBe("A:0");
    expect(state.heroes[1]?.spawned).toBe(false);
    expect(state.events.filter((e) => e.type === "wait_room" && e.heroId === 1)).toHaveLength(1);
  });
});

describe("FR-36 Move relocates the active hero's room (Selection: several at once)", () => {
  it("moves the room and takes the hero with it", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Move" }]);
    const state = spawnThen(level);
    expect(state.heroes[0]?.cell).toEqual({ x: 2, y: 2 });
    castSpell(state, { spellId: 0, dest: { x: 1, y: 1 } });
    expect(state.layout.rooms.find((r) => r.id === "A:0")?.position).toEqual({ x: 1, y: 1 });
    expect(state.heroes[0]?.cell).toEqual({ x: 7, y: 7 });
    expect(state.heroes[0]?.roomId).toBe("A:0");
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "room_move", roomId: "A:0", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }),
    );
  });

  it("under Selection moves each distinct occupied room to a distinct empty cell", () => {
    const level = adzSpellLevel(
      5,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [
        { type: "Selection", allowCorpses: true },
        { type: "Move" },
      ],
    );
    const layout = adzCorridor(level);
    const state = createRun(level, layout);
    while (state.outcome === "in_progress" && !state.heroes[0]?.dead) {
      stepRun(state);
    }
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.heroes[0]?.roomId).toBe("D:0");
    stepRun(state); // hero 1 spawn in A
    expect(state.heroes[1]?.roomId).toBe("A:0");
    castSpell(state, {
      spellId: 0,
      innerSpellId: 1,
      heroIds: [0, 1],
      dests: [
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    expect(state.layout.rooms.find((r) => r.id === "D:0")?.position).toEqual({ x: 2, y: 1 });
    expect(state.layout.rooms.find((r) => r.id === "A:0")?.position).toEqual({ x: 1, y: 1 });
    expect(state.heroes[1]?.cell).toEqual({ x: 7, y: 7 });
  });
});

describe("FR-37 Swap exchanges rooms; Selection is a cycle plus one extra room", () => {
  it("swaps the active hero's room with another, contents traveling", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Swap" }]);
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, otherRoomId: "Z:0" });
    expect(state.layout.rooms.find((r) => r.id === "A:0")?.position).toEqual({ x: 2, y: 0 });
    expect(state.layout.rooms.find((r) => r.id === "Z:0")?.position).toEqual({ x: 0, y: 0 });
    expect(state.heroes[0]?.cell).toEqual({ x: 12, y: 2 });
    expect(state.heroes[0]?.roomId).toBe("A:0");
  });

  it("under Selection cycles the chosen heroes' rooms plus one extra", () => {
    const level = adzSpellLevel(
      5,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [
        { type: "Selection", allowCorpses: true },
        { type: "Swap" },
      ],
    );
    const state = createRun(level, adzCorridor(level));
    while (state.outcome === "in_progress" && !state.heroes[0]?.dead) {
      stepRun(state);
    }
    stepRun(state); // hero 1 spawn
    castSpell(state, { spellId: 0, innerSpellId: 1, heroIds: [0, 1], otherRoomId: "Z:0" });
    // rooms in order: D (corpse), A (hero 1), extra Z
    // D → A's old pos (0,0); A → Z's old pos (2,0); Z → D's old pos (1,0)
    expect(state.layout.rooms.find((r) => r.id === "D:0")?.position).toEqual({ x: 0, y: 0 });
    expect(state.layout.rooms.find((r) => r.id === "A:0")?.position).toEqual({ x: 2, y: 0 });
    expect(state.layout.rooms.find((r) => r.id === "Z:0")?.position).toEqual({ x: 1, y: 0 });
  });
});

describe("FR-38 re-validate FR-6 after Move or Swap", () => {
  it("rejects a Move that would mismatch a shared edge, without consuming the spell", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Move" }]);
    const layout = placeAll(
      level,
      { "A:0": { x: 0, y: 0 }, "D:0": { x: 1, y: 0 }, "Z:0": { x: 2, y: 0 } },
      0,
      {
        "A:0": DEFAULT_ROOM_TILE,
        "D:0": sealSide(DEFAULT_ROOM_TILE, "north"),
        "Z:0": DEFAULT_ROOM_TILE,
      },
    );
    expect(fr6BordersHold(level, layout)).toBe(true);
    const state = createRun(level, layout);
    stepRun(state);
    expect(() => castSpell(state, { spellId: 0, dest: { x: 1, y: 1 } })).toThrow(/FR-6/);
    expect(state.spells[0]?.consumed).toBe(false);
    expect(state.layout.rooms.find((r) => r.id === "A:0")?.position).toEqual({ x: 0, y: 0 });
  });

  it("accepts a Move that keeps matching borders", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Move" }]);
    const state = spawnThen(level);
    expect(fr6BordersHold(level, state.layout)).toBe(true);
    castSpell(state, { spellId: 0, dest: { x: 1, y: 1 } });
    expect(fr6BordersHold(level, state.layout)).toBe(true);
    expect(state.spells[0]?.consumed).toBe(true);
  });
});

describe("FR-39 Selection applies one other unused spell to the chosen heroes", () => {
  it("consumes both Selection and the inner spell", () => {
    const level = adzSpellLevel(
      2,
      [{ type: "Warrior", hp: 5 }],
      [
        { type: "Selection", allowCorpses: false },
        { type: "Attack", damage: 1 },
      ],
    );
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, innerSpellId: 1, heroIds: [0] });
    expect(state.spells[0]?.consumed).toBe(true);
    expect(state.spells[1]?.consumed).toBe(true);
    expect(state.heroes[0]?.hp).toBe(4);
  });

  it("rejects Sleep/Wake/Banality as an inner spell and consumes neither", () => {
    const level = adzSpellLevel(
      2,
      [{ type: "Warrior", hp: 5 }],
      [
        { type: "Selection", allowCorpses: false },
        { type: "Sleep" },
      ],
    );
    const state = spawnThen(level);
    expect(() => castSpell(state, { spellId: 0, innerSpellId: 1, heroIds: [0] })).toThrow(
      /no Selection variant/,
    );
    expect(state.spells[0]?.consumed).toBe(false);
    expect(state.spells[1]?.consumed).toBe(false);
    expect(state.heroes[0]?.sleeping).toBe(false);
  });

  it("rejects targeting a corpse unless allow_corpses is set", () => {
    const level = adzSpellLevel(
      5,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [
        { type: "Selection", allowCorpses: false },
        { type: "Attack", damage: 1 },
      ],
    );
    const state = createRun(level, adzCorridor(level));
    while (state.outcome === "in_progress" && !state.heroes[0]?.dead) {
      stepRun(state);
    }
    stepRun(state);
    expect(state.heroes[0]?.dead).toBe(true);
    expect(() => castSpell(state, { spellId: 0, innerSpellId: 1, heroIds: [0] })).toThrow(/corpses/);
    expect(state.spells[0]?.consumed).toBe(false);
  });
});

describe("FR-40 Sleep: the target cannot act until woken or its HP changes", () => {
  it("blocks the sleeper so they do not walk, without marking them stuck", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Sleep" }]);
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, heroId: 0 });
    expect(state.heroes[0]?.sleeping).toBe(true);
    expect(state.heroes[0]?.stuck).toBe(false);
    expect(selectActiveHero(state.heroes)?.id).toBe(0);
    const before = state.stepCount;
    const { events } = stepRun(state);
    expect(events).toEqual([]);
    expect(state.stepCount).toBe(before);
    expect(state.heroes[0]?.roomId).toBe("A:0");
  });

  it("wakes the sleeper when Attack changes their HP", () => {
    const level = adzSpellLevel(
      2,
      [{ type: "Warrior", hp: 5 }],
      [
        { type: "Sleep" },
        { type: "Attack", damage: 1 },
      ],
    );
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, heroId: 0 });
    castSpell(state, { spellId: 1 });
    expect(state.heroes[0]?.sleeping).toBe(false);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "wake", heroId: 0, cause: "hp" }),
    );
    const { events } = stepRun(state);
    expect(events.some((e) => e.type === "move")).toBe(true);
  });
});

describe("FR-41 Wake wakes the target hero", () => {
  it("lets a woken warrior resume and keep blocking later heroes", () => {
    const level = adzSpellLevel(
      2,
      [
        { type: "Warrior", hp: 5 },
        { type: "Warrior", hp: 5 },
      ],
      [
        { type: "Sleep" },
        { type: "Wake" },
      ],
    );
    const state = spawnThen(level);
    castSpell(state, { spellId: 0, heroId: 0 });
    expect(state.heroes[1]?.spawned).toBe(false);
    stepRun(state);
    expect(state.heroes[1]?.spawned).toBe(false);
    castSpell(state, { spellId: 1, heroId: 0 });
    expect(state.heroes[0]?.sleeping).toBe(false);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "wake", heroId: 0, cause: "spell" }),
    );
    stepRun(state);
    expect(state.heroes[0]?.roomId).not.toBeNull();
    expect(state.heroes[1]?.spawned).toBe(false);
  });
});

describe("FR-42 Banality converts the target to a Warrior, keeping current HP", () => {
  it("drops Elf immunities so the hero then takes fire damage", () => {
    const { level, layout } = aezLine("fire", [{ type: "Elf", hp: 5, immunities: ["fire"] }]);
    const withSpell: typeof level = { ...level, spells: [{ type: "Banality" }] };
    const state = createRun(withSpell, layout);
    stepRun(state);
    expect(state.heroes[0]?.def.type).toBe("Elf");
    expect(state.heroes[0]?.hp).toBe(5);
    castSpell(state, { spellId: 0, heroId: 0 });
    expect(state.heroes[0]?.def.type).toBe("Warrior");
    expect(state.heroes[0]?.hp).toBe(5);
    const finished = state;
    while (finished.outcome === "in_progress" && finished.stepCount < 40) {
      const { events } = stepRun(finished);
      if (events.length === 0) break;
    }
    expect(finished.events.some((e) => e.type === "banality" && e.heroId === 0)).toBe(true);
    expect(finished.events.some((e) => e.type === "damage" && e.heroId === 0)).toBe(true);
    expect(finished.heroes[0]?.hp).toBeLessThan(5);
  });
});

describe("FR-32 / FR-39 Repeat expansion and simulate castScript", () => {
  it("expands a numeric spell repeat into distinct consumable instances", () => {
    const level = makeSpellLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 6 }],
      [
        { type: "Repeat", count: 2, spell: { type: "Attack", damage: 1 } },
      ],
    );
    const state = spawnThen(level);
    expect(state.spells).toHaveLength(2);
    castSpell(state, { spellId: 0 });
    castSpell(state, { spellId: 1 });
    expect(state.spells.every((s) => s.consumed)).toBe(true);
    expect(state.heroes[0]?.hp).toBe(4);
  });

  it("interleaves a castScript after spawn so Attack can finish the run", () => {
    const level = adzSpellLevel(2, [{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 5 }]);
    const state = simulate(level, adzCorridor(level), {
      castScript: [{ afterSteps: 1, cast: { spellId: 0 } }],
    });
    expect(state.outcome).toBe("win");
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.events.some((e) => e.type === "cast" && e.spellType === "Attack")).toBe(true);
    expect(state.events.some((e) => e.type === "enter" && e.roomType === "Z")).toBe(false);
  });
});
