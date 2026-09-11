// Covers FR-16 (Gold Room O(x): first-entrant pickup, death-room reattach,
// pickup before other entry effects). See src/gold.ts and src/simulation.ts.
import { describe, expect, it } from "vitest";
import { dropGold, initialRoomGold, pickupGold, payToll } from "./gold.js";
import { makeLevel, corridorLine } from "./phase3-fixtures.js";
import { simulate } from "./simulation.js";
import { validateLayout } from "./placement.js";

describe("FR-16 gold purse helpers", () => {
  it("picks up a pile, drops it on death, and refunds FIFO to the source", () => {
    const piles = initialRoomGold([
      { id: "O:0", def: { type: "O", gold: 2 } },
      { id: "O:1", def: { type: "O", gold: 1 } },
    ]);
    const purse: { sourceRoomId: string }[] = [];
    expect(pickupGold(piles, purse, "O:0")).toBe(2);
    expect(pickupGold(piles, purse, "O:1")).toBe(1);
    expect(piles.get("O:0")).toBe(0);
    expect(purse.map((u) => u.sourceRoomId)).toEqual(["O:0", "O:0", "O:1"]);

    const paid = payToll(piles, purse, 2);
    expect(paid).toEqual({
      paid: 2,
      refunds: [{ roomId: "O:0", amount: 2 }],
    });
    expect(piles.get("O:0")).toBe(2);
    expect(purse).toEqual([{ sourceRoomId: "O:1" }]);

    expect(dropGold(piles, purse, "D:0")).toBe(1);
    expect(piles.get("D:0")).toBe(1);
    expect(purse).toEqual([]);
  });
});

describe("FR-16 O(x) pickup and death reattach", () => {
  it("gives the first hero the whole pile; a later hero finds the room empty", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "O", gold: 3 }, { type: "D", damage: 5 }],
      [
        { type: "Warrior", hp: 1 },
        { type: "Warrior", hp: 1 },
      ],
    );
    const layout = corridorLine(level, ["A:0", "O:0", "D:0", "Z:0"]);
    expect(validateLayout(level, layout).ok).toBe(true);

    const state = simulate(level, layout);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "pickup", heroId: 0, roomId: "O:0", amount: 3, gold: 3 }),
    );
    expect(state.events.some((e) => e.type === "pickup" && e.heroId === 1 && e.roomId === "O:0")).toBe(
      false,
    );
    expect(state.heroes[0]?.dead).toBe(true);
    expect(state.outcome).toBe("win");
  });

  it("reattaches the purse to the death room so the next hero can pick it up there", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "O", gold: 2 }, { type: "D", damage: 5 }],
      [
        { type: "Warrior", hp: 1 },
        { type: "Warrior", hp: 1 },
      ],
    );
    const layout = corridorLine(level, ["A:0", "O:0", "D:0", "Z:0"]);
    const state = simulate(level, layout);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "gold_drop", heroId: 0, roomId: "D:0", amount: 2 }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "pickup", heroId: 1, roomId: "D:0", amount: 2 }),
    );
    expect(state.roomGold.get("D:0")).toBe(2);
    expect(state.heroes[1]?.dead).toBe(true);
  });

  it("picks up gold before D damage on the same entry (pre-empts other effects)", () => {
    const level = makeLevel(
      [{ type: "A" }, { type: "Z" }, { type: "O", gold: 1 }, { type: "D", damage: 4 }],
      [{ type: "Warrior", hp: 1 }],
    );
    const layout = corridorLine(level, ["A:0", "O:0", "D:0", "Z:0"]);
    const state = simulate(level, layout);
    const types = state.events.map((e) => e.type);
    const pickupAt = types.indexOf("pickup");
    const damageAt = types.indexOf("damage");
    const dropAt = types.indexOf("gold_drop");
    expect(pickupAt).toBeGreaterThanOrEqual(0);
    expect(damageAt).toBeGreaterThan(pickupAt);
    expect(dropAt).toBeGreaterThan(damageAt);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "gold_drop", roomId: "D:0", amount: 1 }),
    );
  });
});
