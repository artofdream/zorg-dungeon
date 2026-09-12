import {
  isChoixDef,
  isSpellRepeat,
  type HeroDef,
  type HeroSlot,
  type RoomDef,
  type RoomSlot,
  type SpellDef,
  type SpellSlot,
} from "@zorg/engine";

/** Engineer / compact letter form (honesty / aria fallbacks). */
export function roomLabel(def: RoomDef): string {
  switch (def.type) {
    case "A":
    case "Z":
      return def.type;
    case "D":
      return `D(${def.damage})`;
    case "E":
      return `E(${def.element})`;
    case "P":
      return `P(${def.entries})`;
    case "O":
      return `O(${def.gold})`;
    case "T":
      return `T(${def.cost})`;
    case "C":
      return `C(${def.args.join(",")})`;
  }
}

/** Kid-readable room name with letter as secondary (#35 / #47). */
export function roomKidLabel(def: RoomDef): string {
  switch (def.type) {
    case "A":
      return "Start (A)";
    case "Z":
      return "Exit (Z)";
    case "D":
      return `Danger (${def.damage})`;
    case "E":
      return `Element (${def.element})`;
    case "P":
      return `Portal (${def.entries})`;
    case "O":
      return `Gold (${def.gold})`;
    case "T":
      return `Toll (${def.cost})`;
    case "C":
      return `Special (C)`;
  }
}

/** Short word for board cells (letter stays in .meta). */
export function roomKidWord(def: RoomDef): string {
  switch (def.type) {
    case "A":
      return "Start";
    case "Z":
      return "Exit";
    case "D":
      return "Danger";
    case "E":
      return def.element;
    case "P":
      return "Portal";
    case "O":
      return "Gold";
    case "T":
      return "Toll";
    case "C":
      return "Special";
  }
}

export function roomTypeCss(def: RoomDef): string {
  return `room-${def.type.toLowerCase()}`;
}

export function heroLabel(def: HeroDef): string {
  switch (def.type) {
    case "Warrior":
      return `Warrior(${def.hp})`;
    case "Elf":
      return `Elf(${def.hp}, ${def.immunities.join("+") || "∅"})`;
    case "Gunner":
      return def.duration !== undefined
        ? `Gunner(${def.hp}, ${def.shots}, ${def.duration})`
        : `Gunner(${def.hp}, ${def.shots})`;
    case "Mechanic":
      return `Mechanic(${def.hp})`;
    case "Princess":
      return `Princess(${def.hp})`;
  }
}

export function heroKidLabel(def: HeroDef): string {
  switch (def.type) {
    case "Warrior":
      return `Warrior · ${def.hp} HP`;
    case "Elf":
      return `Elf · ${def.hp} HP`;
    case "Gunner":
      return `Gunner · ${def.hp} HP · ${def.shots} shots`;
    case "Mechanic":
      return `Mechanic · ${def.hp} HP`;
    case "Princess":
      return `Princess · ${def.hp} HP`;
  }
}

export function spellLabel(def: SpellDef): string {
  switch (def.type) {
    case "Attack":
      return `Attack(${def.damage})`;
    case "Teleport":
      return `Teleport(${def.steps})`;
    case "Selection":
      return `Selection(${def.allowCorpses})`;
    default:
      return `${def.type}()`;
  }
}

export function spellKidLabel(def: SpellDef): string {
  switch (def.type) {
    case "Attack":
      return `Attack · ${def.damage} damage`;
    case "Teleport":
      return `Teleport · ${def.steps} steps`;
    case "Selection":
      return "Selection";
    case "Move":
      return "Move";
    case "Swap":
      return "Swap";
    case "Sleep":
      return "Sleep";
    case "Wake":
      return "Wake";
    case "Banality":
      return "Banality";
  }
}

export function roomSlotLabel(slot: RoomSlot): string {
  if (isChoixDef(slot)) return `choice(${slot.n}, {${slot.options.map(roomSlotLabel).join(", ")}})`;
  return roomKidLabel(slot);
}

export function heroSlotLabel(slot: HeroSlot): string {
  if (isChoixDef(slot)) return `choice(${slot.n}, {${slot.options.map(heroSlotLabel).join(", ")}})`;
  return heroKidLabel(slot);
}

export function spellSlotLabel(slot: SpellSlot): string {
  if (isChoixDef(slot)) return `choice(${slot.n}, {${slot.options.map(spellSlotLabel).join(", ")}})`;
  if (isSpellRepeat(slot)) return `${slot.count}× ${spellSlotLabel(slot.spell)}`;
  return spellKidLabel(slot);
}

/** Never show an empty card title (#34). */
export function displayCampaignTitle(entry: { name?: string | null; id: string }): string {
  const raw = (entry.name ?? "").trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  if (raw) return raw;
  const id = entry.id.trim();
  if (!id) return "Untitled level";
  return id
    .replace(/^base-classic-/i, "Classic ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}
