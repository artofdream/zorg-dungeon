import { isChoixDef, parseLevel, type HeroSlot, type HeroType } from "@zorg/engine";

/** Display order matches GAME_SPEC hero list (Warrior → Princess). */
export const HERO_TYPES: readonly HeroType[] = ["Warrior", "Elf", "Gunner", "Mechanic", "Princess"];

export function isHeroType(value: string): value is HeroType {
  return (HERO_TYPES as readonly string[]).includes(value);
}

export function heroIconSrc(type: HeroType): string {
  return `/heroes/${type.toLowerCase()}.svg`;
}

/** Unique types in spec order, walking choix options. UI-only. */
export function collectHeroTypes(slots: readonly HeroSlot[]): HeroType[] {
  const seen = new Set<HeroType>();
  const walk = (slot: HeroSlot): void => {
    if (isChoixDef(slot)) {
      for (const option of slot.options) walk(option);
      return;
    }
    seen.add(slot.type);
  };
  for (const slot of slots) walk(slot);
  return HERO_TYPES.filter((type) => seen.has(type));
}

export function heroTypesFromLevelText(text: string): HeroType[] {
  try {
    return collectHeroTypes(parseLevel(text).heroes);
  } catch {
    return [];
  }
}
