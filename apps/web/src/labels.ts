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
import { t } from "./i18n/index.js";

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
      return t("room.A.label");
    case "Z":
      return t("room.Z.label");
    case "D":
      return t("room.D.label", { damage: def.damage });
    case "E":
      return t("room.E.label", { element: def.element });
    case "P":
      return t("room.P.label", { entries: def.entries });
    case "O":
      return t("room.O.label", { gold: def.gold });
    case "T":
      return t("room.T.label", { cost: def.cost });
    case "C":
      return t("room.C.label");
  }
}

/** Short word for board cells (letter stays in .meta). */
export function roomKidWord(def: RoomDef): string {
  switch (def.type) {
    case "A":
      return t("room.A.word");
    case "Z":
      return t("room.Z.word");
    case "D":
      return t("room.D.word");
    case "E":
      return def.element;
    case "P":
      return t("room.P.word");
    case "O":
      return t("room.O.word");
    case "T":
      return t("room.T.word");
    case "C":
      return t("room.C.word");
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
      return t("hero.Warrior", { hp: def.hp });
    case "Elf":
      return t("hero.Elf", { hp: def.hp });
    case "Gunner":
      return t("hero.Gunner", { hp: def.hp, shots: def.shots });
    case "Mechanic":
      return t("hero.Mechanic", { hp: def.hp });
    case "Princess":
      return t("hero.Princess", { hp: def.hp });
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
      return t("spell.Attack", { damage: def.damage });
    case "Teleport":
      return t("spell.Teleport", { steps: def.steps });
    case "Selection":
      return t("spell.Selection");
    case "Move":
      return t("spell.Move");
    case "Swap":
      return t("spell.Swap");
    case "Sleep":
      return t("spell.Sleep");
    case "Wake":
      return t("spell.Wake");
    case "Banality":
      return t("spell.Banality");
  }
}

export function roomSlotLabel(slot: RoomSlot): string {
  if (isChoixDef(slot)) return `${t("choice.prefix")}(${slot.n}, {${slot.options.map(roomSlotLabel).join(", ")}})`;
  return roomKidLabel(slot);
}

export function heroSlotLabel(slot: HeroSlot): string {
  if (isChoixDef(slot)) return `${t("choice.prefix")}(${slot.n}, {${slot.options.map(heroSlotLabel).join(", ")}})`;
  return heroKidLabel(slot);
}

export function spellSlotLabel(slot: SpellSlot): string {
  if (isChoixDef(slot)) return `${t("choice.prefix")}(${slot.n}, {${slot.options.map(spellSlotLabel).join(", ")}})`;
  if (isSpellRepeat(slot)) return `${slot.count}× ${spellSlotLabel(slot.spell)}`;
  return spellKidLabel(slot);
}

/** Never show an empty card title (#34). */
export function displayCampaignTitle(entry: { name?: string | null; id: string }): string {
  const raw = (entry.name ?? "").trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  if (raw) return raw;
  const id = entry.id.trim();
  if (!id) return t("campaign.untitled");
  return id
    .replace(/^base-classic-/i, "Classic ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}
