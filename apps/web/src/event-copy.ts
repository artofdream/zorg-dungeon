// Kid-facing fight log sentences. Raw SimEvent JSON stays behind a disclosure.
import type { HeroRuntime, SimEvent } from "@zorg/engine";
import { t } from "./i18n/index.js";

function heroName(heroes: readonly HeroRuntime[] | undefined, heroId: number): string {
  const hero = heroes?.find((h) => h.id === heroId);
  return hero?.def.type ?? t("hero.fallback", { id: heroId });
}

function roomKidWord(roomType: string): string {
  switch (roomType) {
    case "A":
      return t("room.feed.A");
    case "Z":
      return t("room.feed.Z");
    case "D":
      return t("room.feed.D");
    case "E":
      return t("room.feed.E");
    case "P":
      return t("room.feed.P");
    case "O":
      return t("room.feed.O");
    case "T":
      return t("room.feed.T");
    case "C":
      return t("room.feed.C");
    default:
      return t("room.feed.default");
  }
}

/** One plain sentence per engine event for the Fight feed. */
export function formatSimEvent(
  event: SimEvent,
  heroes?: readonly HeroRuntime[],
): string {
  switch (event.type) {
    case "spawn":
      return t("event.spawn", { hero: heroName(heroes, event.heroId) });
    case "move":
      return t("event.move", { hero: heroName(heroes, event.heroId), dir: event.dir });
    case "enter":
      return t("event.enter", {
        hero: heroName(heroes, event.heroId),
        room: roomKidWord(event.roomType),
      });
    case "damage":
      return t("event.damage", {
        hero: heroName(heroes, event.heroId),
        amount: event.amount,
        hp: event.hp,
      });
    case "pickup":
      return t("event.pickup", {
        hero: heroName(heroes, event.heroId),
        amount: event.amount,
      });
    case "toll":
      return t("event.toll", {
        hero: heroName(heroes, event.heroId),
        amount: event.amount,
      });
    case "gold_drop":
      return t("event.goldDrop", { hero: heroName(heroes, event.heroId) });
    case "teleport":
      return t("event.teleport", { hero: heroName(heroes, event.heroId) });
    case "wait_room":
      return t("event.waitRoom", { hero: heroName(heroes, event.heroId) });
    case "death":
      return t("event.death", { hero: heroName(heroes, event.heroId) });
    case "wait":
      return t("event.wait", { hero: heroName(heroes, event.heroId) });
    case "cast":
      return t("event.cast", { spell: event.spellType });
    case "sleep":
      return t("event.sleep", { hero: heroName(heroes, event.heroId) });
    case "wake":
      return t("event.wake", { hero: heroName(heroes, event.heroId) });
    case "banality":
      return t("event.banality", { hero: heroName(heroes, event.heroId) });
    case "room_move":
      return t("event.roomMove");
    case "shove":
      return t("event.shove", { hero: heroName(heroes, event.heroId), dir: event.dir });
    case "fire":
      return t("event.fire", { hero: heroName(heroes, event.heroId), dir: event.dir });
    case "shell":
      return t("event.shell", { hero: heroName(heroes, event.heroId) });
    case "loss":
      return t("event.loss", { hero: heroName(heroes, event.heroId) });
    case "win":
      return t("event.win");
    case "stalemate":
      return t("event.stalemate");
    default: {
      const _exhaustive: never = event;
      return JSON.stringify(_exhaustive);
    }
  }
}

export function formatEventFeed(
  events: readonly SimEvent[],
  heroes?: readonly HeroRuntime[],
): string[] {
  return events.map((event) => formatSimEvent(event, heroes));
}

export const EVENT_FEED_EMPTY = () => t("event.feedEmpty");
export const EVENT_FEED_TITLE = () => t("event.feedTitle");
export const EVENT_TECHNICAL_SUMMARY = () => t("event.technical");
