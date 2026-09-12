// NFR-6: wall-hatch direction and room orientation must be visually
// unambiguous while placing rooms. This is Simulated evidence for the Maker
// presentation mapping — not a live browser probe.
import { describe, expect, it } from "vitest";
import { CARDINAL_TO_SIDE, hatchDirection, type Orientation } from "@zorg/engine";
import {
  boardCellAriaLabel,
  describeHatch,
  HATCH_HELPER,
  HATCH_HONESTY,
  HATCH_WORD,
  MAKER_ORIENTATIONS,
  placementPreviewLabel,
  selectedRoomHatchLabel,
} from "./orientation-ui.js";

describe("NFR-6 hatch / orientation presentation", () => {
  it("maps each orientation to a unique wall-hatch side and glyph", () => {
    const views = MAKER_ORIENTATIONS.map((deg) => describeHatch(deg));
    expect(new Set(views.map((v) => v.cardinal)).size).toBe(4);
    expect(new Set(views.map((v) => v.side)).size).toBe(4);
    expect(new Set(views.map((v) => v.glyph)).size).toBe(4);
    expect(new Set(views.map((v) => v.wallClass)).size).toBe(4);
    expect(new Set(views.map((v) => v.shortLabel)).size).toBe(4);
    expect(new Set(views.map((v) => v.doorsFaceLabel)).size).toBe(4);
  });

  it("follows the engine hatchDirection cardinal (FR-7)", () => {
    const expected: Record<Orientation, string> = {
      0: "right",
      90: "up",
      180: "left",
      270: "down",
    };
    for (const deg of MAKER_ORIENTATIONS) {
      const view = describeHatch(deg);
      expect(view.cardinal).toBe(expected[deg]);
      expect(view.cardinal).toBe(hatchDirection(deg));
      expect(view.side).toBe(CARDINAL_TO_SIDE[view.cardinal]);
      expect(view.word).toBe(HATCH_WORD[view.cardinal]);
      expect(view.wallClass).toBe(`hatch-${view.side}`);
      expect(view.shortLabel).toContain(view.glyph);
      expect(view.shortLabel).toContain(view.word);
      expect(view.doorsFaceLabel).toBe(`Doors face ${view.word}`);
      expect(view.degreesLabel).toContain(view.doorsFaceLabel);
    }
  });

  it("uses doors-face words for selected room and placement preview", () => {
    for (const deg of MAKER_ORIENTATIONS) {
      const view = describeHatch(deg);
      const selected = selectedRoomHatchLabel("Start (A)", deg, true);
      const preview = placementPreviewLabel("Start (A)", deg);
      expect(selected).toContain(view.doorsFaceLabel);
      expect(selected).toContain("start-room doors");
      expect(preview).toContain(view.doorsFaceLabel);
      expect(selectedRoomHatchLabel("Exit (Z)", deg, false)).not.toContain("start-room doors");
    }
  });

  it("names doors face on placed and preview board cells", () => {
    const placed = boardCellAriaLabel({
      roomName: "Start (A)",
      x: 0,
      y: 1,
      orientation: 90,
      selected: true,
      isAnchor: true,
    });
    expect(placed).toContain("Start (A) at 0,1");
    expect(placed).toContain("Doors face up");
    expect(placed).toContain("start-room doors");
    expect(placed).toContain("selected");

    const preview = boardCellAriaLabel({
      x: 2,
      y: 3,
      orientation: 0,
      preview: true,
      roomName: "Start (A)",
    });
    expect(preview).toContain("Empty 2,3");
    expect(preview).toContain("placing Start (A)");
    expect(preview).toContain("preview Doors face right");
    expect(preview).not.toContain("Start (A) at 2,3");
  });

  it("keeps FR-7 in honesty helper only, not kid primary hatch copy", () => {
    expect(HATCH_HELPER).not.toMatch(/FR-7/);
    expect(HATCH_HELPER).toMatch(/doors face|Start \(A\)/i);
    expect(HATCH_HONESTY).toMatch(/FR-7/);
    expect(HATCH_HONESTY).toMatch(/FR-5–FR-7/);
  });
});

