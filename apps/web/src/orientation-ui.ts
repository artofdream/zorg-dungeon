// NFR-6: Maker presentation of FR-7 wall-hatch direction / orientation.
// Engine stays the source of hatchDirection; this file is UI-only copy and
// wall-side mapping so players can see the constraint while placing rooms.

import {
  CARDINAL_TO_SIDE,
  hatchDirection,
  type Cardinal,
  type Orientation,
  type Side,
} from "@zorg/engine";

export const MAKER_ORIENTATIONS: Orientation[] = [0, 90, 180, 270];

export const HATCH_GLYPH: Record<Cardinal, string> = {
  right: "→",
  up: "↑",
  left: "←",
  down: "↓",
};

export const HATCH_WORD: Record<Cardinal, string> = {
  right: "right",
  up: "up",
  left: "left",
  down: "down",
};

export const HATCH_SIDE_WORD: Record<Cardinal, string> = {
  right: "east",
  up: "north",
  left: "west",
  down: "south",
};

export interface HatchView {
  orientation: Orientation;
  cardinal: Cardinal;
  side: Side;
  glyph: string;
  word: string;
  sideWord: string;
  wallClass: string;
  shortLabel: string;
  degreesLabel: string;
}

export function describeHatch(orientation: Orientation): HatchView {
  const cardinal = hatchDirection(orientation);
  const side = CARDINAL_TO_SIDE[cardinal];
  const glyph = HATCH_GLYPH[cardinal];
  const word = HATCH_WORD[cardinal];
  const sideWord = HATCH_SIDE_WORD[cardinal];
  return {
    orientation,
    cardinal,
    side,
    glyph,
    word,
    sideWord,
    wallClass: `hatch-${side}`,
    shortLabel: `${glyph} ${word}`,
    degreesLabel: `${orientation}° ${glyph} ${word}`,
  };
}

/** Selected tray / board room: same wall-hatch words as the placement ghost. */
export function selectedRoomHatchLabel(
  roomName: string,
  orientation: Orientation,
  isAnchor = false,
): string {
  const hatch = describeHatch(orientation);
  const anchor = isAnchor ? " · spawn-room anchor" : "";
  return `${roomName} · wall-hatch ${hatch.shortLabel} (${orientation}°)${anchor}`;
}

export function placementPreviewLabel(roomName: string, orientation: Orientation): string {
  const hatch = describeHatch(orientation);
  return `Place ${roomName} · wall-hatch ${hatch.shortLabel}`;
}

export function boardCellAriaLabel(opts: {
  roomName?: string;
  x: number;
  y: number;
  orientation: Orientation;
  preview?: boolean;
  selected?: boolean;
  isAnchor?: boolean;
}): string {
  const hatch = describeHatch(opts.orientation);
  if (!opts.roomName) {
    return opts.preview
      ? `Empty ${opts.x},${opts.y} · preview wall-hatch ${hatch.shortLabel}`
      : `Empty ${opts.x},${opts.y}`;
  }
  const bits = [`${opts.roomName} at ${opts.x},${opts.y}`, `wall-hatch ${hatch.shortLabel}`];
  if (opts.isAnchor) bits.push("spawn-room orientation anchor");
  if (opts.selected) bits.push("selected");
  return bits.join(" · ");
}

/** Plain-English FR-7 reminder shown while placing (NFR-6 / NFR-7 terminology). */
export const HATCH_HELPER =
  "Every room shares one wall-hatch direction, taken from the spawn (A) rooms (FR-7). The bright arrow is that direction. Change it here before you place — Extermination stays closed until FR-5–FR-7 hold.";
