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

export function roomSlotLabel(slot: RoomSlot): string {
  if (isChoixDef(slot)) return `choix(${slot.n}, {${slot.options.map(roomSlotLabel).join(", ")}})`;
  return roomLabel(slot);
}

export function heroSlotLabel(slot: HeroSlot): string {
  if (isChoixDef(slot)) return `choix(${slot.n}, {${slot.options.map(heroSlotLabel).join(", ")}})`;
  return heroLabel(slot);
}

export function spellSlotLabel(slot: SpellSlot): string {
  if (isChoixDef(slot)) return `choix(${slot.n}, {${slot.options.map(spellSlotLabel).join(", ")}})`;
  if (isSpellRepeat(slot)) return `${slot.count}× ${spellSlotLabel(slot.spell)}`;
  return spellLabel(slot);
}
