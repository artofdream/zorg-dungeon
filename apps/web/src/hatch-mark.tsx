import type { Orientation } from "@zorg/engine";
import { describeHatch } from "./orientation-ui.js";

const SEAMS = ["east", "north", "west", "south"] as const;

/** Wall-anchored hatch notches + primary FR-7 arrow (NFR-6). */
export function RoomHatchMark({ orientation }: { orientation: Orientation }) {
  const hatch = describeHatch(orientation);
  return (
    <span className="hatch-mark" aria-hidden>
      {SEAMS.map((side) => (
        <span
          key={side}
          className={`hatch-notch ${side}${side === hatch.side ? " primary" : ""}`}
        />
      ))}
      <span className={`hatch-arrow ${hatch.side}`}>{hatch.glyph}</span>
    </span>
  );
}

export function HatchCompass({ orientation }: { orientation: Orientation }) {
  const hatch = describeHatch(orientation);
  return (
    <div className="hatch-compass" aria-hidden>
      <span />
      <span className={hatch.cardinal === "up" ? "live" : ""}>↑</span>
      <span />
      <span className={hatch.cardinal === "left" ? "live" : ""}>←</span>
      <span className="live">{hatch.orientation}°</span>
      <span className={hatch.cardinal === "right" ? "live" : ""}>→</span>
      <span />
      <span className={hatch.cardinal === "down" ? "live" : ""}>↓</span>
      <span />
    </div>
  );
}
