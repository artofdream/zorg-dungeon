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
  doorsFaceLabel: string;
}

export function describeHatch(orientation: Orientation): HatchView {
  const cardinal = hatchDirection(orientation);
  const side = CARDINAL_TO_SIDE[cardinal];
  const glyph = HATCH_GLYPH[cardinal];
  const word = HATCH_WORD[cardinal];
  const sideWord = HATCH_SIDE_WORD[cardinal];
  const doorsFaceLabel = `Doors face ${word}`;
  return {
    orientation,
    cardinal,
    side,
    glyph,
    word,
    sideWord,
    wallClass: `hatch-${side}`,
    shortLabel: `${glyph} ${word}`,
    degreesLabel: `${doorsFaceLabel} ${glyph}`,
    doorsFaceLabel,
  };
}

/** Selected tray / board room: kid “doors face …” words (#38). */
export function selectedRoomHatchLabel(
  roomName: string,
  orientation: Orientation,
  isAnchor = false,
): string {
  const hatch = describeHatch(orientation);
  const anchor = isAnchor ? " · start-room doors" : "";
  return `${roomName} · ${hatch.doorsFaceLabel}${anchor}`;
}

export function placementPreviewLabel(roomName: string, orientation: Orientation): string {
  const hatch = describeHatch(orientation);
  return `Place ${roomName} · ${hatch.doorsFaceLabel}`;
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
  if (opts.preview) {
    const bits = [`Empty ${opts.x},${opts.y}`, "preview " + hatch.doorsFaceLabel];
    if (opts.roomName) bits.splice(1, 0, `placing ${opts.roomName}`);
    if (opts.isAnchor) bits.push("start-room doors");
    return bits.join(" · ");
  }
  if (!opts.roomName) {
    return `Empty ${opts.x},${opts.y}`;
  }
  const bits = [`${opts.roomName} at ${opts.x},${opts.y}`, hatch.doorsFaceLabel];
  if (opts.isAnchor) bits.push("start-room doors");
  if (opts.selected) bits.push("selected");
  return bits.join(" · ");
}

/** Kid-facing doors helper — FR-7 lives in Maker honesty only (#38). */
export const HATCH_HELPER =
  "Every room’s doors face the same way, taken from the Start (A) rooms. The bright arrow shows that way. Change it here before you place.";

/** Honesty / engineer note (not shown in kid primary copy). */
export const HATCH_HONESTY =
  "Wall-hatch direction / orientation follows the spawn-room (A) anchor (FR-7). Start fight stays closed until FR-5–FR-7 hold.";
