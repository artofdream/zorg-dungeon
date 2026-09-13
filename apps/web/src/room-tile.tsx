import type { RoomDef } from "@zorg/engine";
import { roomIconSrcForDef, roomTileAlt } from "./room-icons.js";

interface RoomTileProps {
  def: RoomDef;
  /** When true, hide from AT because nearby text already names the room. */
  decorative?: boolean;
  className?: string;
}

/** Illustrated room tile for Maker cells — pairs with hero figurine stroke style. */
export function RoomTile({ def, decorative = true, className }: RoomTileProps) {
  const src = roomIconSrcForDef(def);
  if (!src) return null;
  const alt = roomTileAlt(def);
  return (
    <img
      className={`room-tile${className ? ` ${className}` : ""}`}
      src={src}
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
    />
  );
}
