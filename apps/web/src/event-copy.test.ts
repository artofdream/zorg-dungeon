import { afterEach, describe, expect, it } from "vitest";
import type { SimEvent } from "@zorg/engine";
import { DEFAULT_LOCALE, setLocale } from "./i18n/index.js";
import { formatEventFeed, formatSimEvent } from "./event-copy.js";

afterEach(() => {
  setLocale(DEFAULT_LOCALE);
});

describe("event-copy sentence feed (J-KID)", () => {
  it("turns common fight events into plain sentences", () => {
    const events: SimEvent[] = [
      { type: "spawn", heroId: 0, cell: { x: 0, y: 0 }, roomId: "A:0" },
      { type: "enter", heroId: 0, roomId: "D:0", roomType: "D" },
      { type: "damage", heroId: 0, amount: 3, hp: 0 },
      { type: "death", heroId: 0 },
      { type: "win" },
    ];
    const lines = formatEventFeed(events);
    expect(lines[0]).toMatch(/entered the dungeon/i);
    expect(lines[1]).toMatch(/danger room/i);
    expect(lines[2]).toMatch(/damage/i);
    expect(lines[3]).toMatch(/fell/i);
    expect(lines[4]).toMatch(/stopped them before they reached the exit/i);
    expect(lines.join("\n")).not.toMatch(/\{"type"/);
  });

  it("keeps loss readable without raw JSON", () => {
    expect(formatSimEvent({ type: "loss", heroId: 1 })).toMatch(/reached the exit/i);
  });

  it("translates win / enter feed lines in FR", () => {
    setLocale("fr");
    expect(formatSimEvent({ type: "win" })).toMatch(/arrêtés avant/i);
    expect(formatSimEvent({ type: "enter", heroId: 0, roomId: "D:0", roomType: "D" })).toMatch(
      /salle danger/i,
    );
  });
});
