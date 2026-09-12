// NFR-6: wall-hatch direction and room orientation must be visually
// unambiguous while placing rooms. This is Simulated evidence for the Maker
// presentation mapping — not a live browser probe.
import { describe, expect, it } from "vitest";
import { CARDINAL_TO_SIDE, hatchDirection, type Orientation } from "@zorg/engine";
import {
  boardCellAriaLabel,
  describeHatch,
  HATCH_HELPER,
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
      expect(view.degreesLabel).toContain(`${deg}°`);
    }
  });

  it("uses the same wall-hatch words for selected room and placement preview", () => {
    for (const deg of MAKER_ORIENTATIONS) {
      const view = describeHatch(deg);
      const selected = selectedRoomHatchLabel("A", deg, true);
      const preview = placementPreviewLabel("A", deg);
      expect(selected).toContain(view.shortLabel);
      expect(selected).toContain("wall-hatch");
      expect(selected).toContain("spawn-room anchor");
      expect(preview).toContain(view.shortLabel);
      expect(preview).toContain("wall-hatch");
      expect(selectedRoomHatchLabel("Z", deg, false)).not.toContain("spawn-room anchor");
    }
  });

  it("names wall-hatch on placed and preview board cells", () => {
    const placed = boardCellAriaLabel({
      roomName: "A",
      x: 0,
      y: 1,
      orientation: 90,
      selected: true,
      isAnchor: true,
    });
    expect(placed).toContain("A at 0,1");
    expect(placed).toContain("wall-hatch ↑ up");
    expect(placed).toContain("spawn-room orientation anchor");
    expect(placed).toContain("selected");

    const preview = boardCellAriaLabel({
      x: 2,
      y: 3,
      orientation: 0,
      preview: true,
      roomName: undefined,
    });
    expect(preview).toContain("preview wall-hatch → right");
  });

  it("helper text names FR-7 and the spawn-room wall-hatch anchor", () => {
    expect(HATCH_HELPER).toMatch(/FR-7/);
    expect(HATCH_HELPER).toMatch(/wall-hatch direction/);
    expect(HATCH_HELPER).toMatch(/spawn \(A\) rooms/);
    expect(HATCH_HELPER).toMatch(/FR-5–FR-7/);
  });
});
