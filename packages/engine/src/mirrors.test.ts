// Covers FR-9: one shared room graph; Nth room swapped 1:1 by declaration order.
// Covers FR-45: worlds resolve normal → M′ → M″ and retire once idle or Z-reached.
import { describe, expect, it } from "vitest";
import {
  asWorldLevel,
  declaredWorlds,
  layoutForWorld,
  mirrorWorldId,
  resolveWorlds,
  substituteMirrorLayout,
  MirrorError,
} from "./mirrors.js";
import { makeLevel, placeAll } from "./phase1-fixtures.js";
import { azAdjacent, azdSquare } from "./phase6-fixtures.js";
import { parseLevel, serializeLevel, validateLevel } from "./loader.js";
import { enumerateSuppliedRooms } from "./placement.js";

describe("FR-9 shared graph, 1:1 declaration-order swap", () => {
  it("keeps constructed positions and remints ids/defs from the mirror list", () => {
    const { level, layout } = azdSquare(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 5 }],
    );
    const mirror = makeLevel(
      [{ type: "D", damage: 9 }, { type: "A" }, { type: "Z" }],
      [{ type: "Warrior", hp: 1 }],
      "mirror-m",
    );
    const swapped = substituteMirrorLayout(level, layout, mirror);
    expect(swapped.rooms.map((r) => ({ id: r.id, type: r.def.type, x: r.position.x, y: r.position.y }))).toEqual([
      { id: "D:0", type: "D", x: 0, y: 0 },
      { id: "A:0", type: "A", x: 1, y: 0 },
      { id: "Z:0", type: "Z", x: 0, y: 1 },
    ]);
    expect(swapped.rooms.find((r) => r.id === "D:0")?.def).toEqual({ type: "D", damage: 9 });
    expect(enumerateSuppliedRooms(mirror).map((s) => s.id)).toEqual(swapped.rooms.map((r) => r.id));
  });

  it("rejects a mirror list that is not the same length", () => {
    const { level, layout } = azAdjacent();
    const short = makeLevel([{ type: "A" }], [{ type: "Warrior", hp: 1 }], "short");
    expect(() => substituteMirrorLayout(level, layout, short)).toThrow(MirrorError);
    expect(() => substituteMirrorLayout(level, layout, short)).toThrow(/1:1 by declaration order/);
  });

  it("gives each world its own heroes and spells on the same graph", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }], [{ type: "Attack", damage: 1 }]);
    const mirror: typeof level = {
      ...makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 1 }], "m"),
      spells: [{ type: "Attack", damage: 5 }],
    };
    const world = declaredWorlds({ ...level, mirrorWorlds: [mirror] })[1];
    expect(world?.id).toBe("M'");
    expect(world?.level.heroes).toEqual([{ type: "Warrior", hp: 1 }]);
    expect(world?.level.spells).toEqual([{ type: "Attack", damage: 5 }]);
    const mirrored = layoutForWorld({ ...level, mirrorWorlds: [mirror] }, layout, world!);
    expect(mirrored.rooms.map((r) => r.position)).toEqual(layout.rooms.map((r) => r.position));
    expect(asWorldLevel({ ...level, mirrorWorlds: [mirror] }).mirrorWorlds).toBeUndefined();
  });
});

describe("FR-9 loader: Mirror blocks and validateLevel length", () => {
  it("parses Mirror M' / M'' blocks with their own rooms, heroes, and spells", () => {
    const level = parseLevel(`
id: two-mirrors
Level: Dual
Rooms: A, Z, D(2)
Heroes: Warrior(5)
Spells: Attack(1)
Mirror M':
Rooms: A, D(4), Z
Heroes: Warrior(1)
Spells: Attack(5)
Mirror M'':
Rooms: Z, A, D(1)
Heroes: Elf(3, [fire])
`);
    expect(level.mirrorWorlds).toHaveLength(2);
    expect(level.mirrorWorlds?.[0]?.rooms.map((r) => r.room)).toEqual([
      { type: "A" },
      { type: "D", damage: 4 },
      { type: "Z" },
    ]);
    expect(level.mirrorWorlds?.[0]?.heroes).toEqual([{ type: "Warrior", hp: 1 }]);
    expect(level.mirrorWorlds?.[0]?.spells).toEqual([{ type: "Attack", damage: 5 }]);
    expect(level.mirrorWorlds?.[1]?.heroes[0]).toEqual({
      type: "Elf",
      hp: 3,
      immunities: ["fire"],
    });
    const round = parseLevel(serializeLevel(level));
    expect(round.mirrorWorlds?.map((w) => w.heroes)).toEqual(level.mirrorWorlds?.map((w) => w.heroes));
  });

  it("flags a mirror whose flattened room count disagrees with the base", () => {
    const level = parseLevel(`
id: bad-len
Level: Bad
Rooms: A, Z
Heroes: Warrior(5)
Mirror M':
Rooms: A
Heroes: Warrior(1)
`);
    const report = validateLevel(level);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("FR-9"))).toBe(true);
  });
});

describe("FR-45 resolve order and retirement", () => {
  it("labels declared worlds normal, then M', then M''", () => {
    expect(mirrorWorldId(0)).toBe("M'");
    expect(mirrorWorldId(1)).toBe("M''");
    const level = makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 5 }]);
    level.mirrorWorlds = [
      makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 1 }], "m1"),
      makeLevel([{ type: "A" }, { type: "Z" }], [{ type: "Warrior", hp: 2 }], "m2"),
    ];
    expect(declaredWorlds(level).map((w) => w.id)).toEqual(["normal", "M'", "M''"]);
  });

  it("resolves normal first; Z entry retires that world before M' runs", () => {
    const { level, layout } = azAdjacent([{ type: "Warrior", hp: 5 }]);
    const mirror = makeLevel(
      [{ type: "A" }, { type: "Z" }],
      [{ type: "Warrior", hp: 1 }, { type: "Warrior", hp: 1 }],
      "m-idle",
    );
    // Mirror A–Z: first warrior walks into Z (z_reached), but we first prove
    // the *normal* world retires on Z, then M' is still executed.
    const records = resolveWorlds({ ...level, mirrorWorlds: [mirror] }, layout);
    expect(records.map((r) => r.id)).toEqual(["normal", "M'"]);
    expect(records[0]?.retirement).toBe("z_reached");
    expect(records[0]?.retired).toBe(true);
    expect(records[0]?.state.outcome).toBe("loss");
    expect(records[1]?.retired).toBe(true);
    expect(records[1]?.state.heroes).toHaveLength(2);
    expect(records[1]?.retirement).toBe("z_reached");
  });

  it("retires a world as idle when nothing changes (princess camps)", () => {
    const { level, layout } = azdSquare(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 1 }],
      [{ type: "Princess", hp: 5, weights: { D: 5, Z: 1 }, pull: 1 }],
    );
    // Place D east of A, Z south of A so the princess can camp D.
    const camp = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "Z:0": { x: 0, y: 1 },
      "D:0": { x: 1, y: 0 },
    });
    const lethal = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 1 }],
      [{ type: "Warrior", hp: 5 }],
      "m-z",
    );
    const records = resolveWorlds({ ...level, mirrorWorlds: [lethal] }, camp);
    expect(records[0]?.retirement).toBe("idle");
    expect(records[0]?.state.outcome).toBe("stalemate");
    expect(records[1]?.id).toBe("M'");
    expect(records[1]?.retirement).toBe("z_reached");
  });

  it("clears a world whose heroes all die, then still resolves the next world", () => {
    const { level, layout } = azdSquare(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const line = placeAll(level, {
      "A:0": { x: 0, y: 0 },
      "D:0": { x: 1, y: 0 },
      "Z:0": { x: 2, y: 0 },
    });
    const mirror = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "D", damage: 2 }],
      [{ type: "Warrior", hp: 5 }],
      "m-loss",
    );
    const records = resolveWorlds({ ...level, mirrorWorlds: [mirror] }, line);
    expect(records[0]?.retirement).toBe("cleared");
    expect(records[0]?.state.outcome).toBe("win");
    expect(records[1]?.retirement).toBe("z_reached");
  });
});
