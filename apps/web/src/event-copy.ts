// Kid-facing fight log sentences. Raw SimEvent JSON stays behind a disclosure.
import type { HeroRuntime, SimEvent } from "@zorg/engine";

function heroName(heroes: readonly HeroRuntime[] | undefined, heroId: number): string {
  const hero = heroes?.find((h) => h.id === heroId);
  return hero?.def.type ?? `Hero ${heroId}`;
}

function roomKidWord(roomType: string): string {
  switch (roomType) {
    case "A":
      return "the start room";
    case "Z":
      return "the exit (Zorg)";
    case "D":
      return "a danger room";
    case "E":
      return "an element room";
    case "P":
      return "a portal room";
    case "O":
      return "a gold room";
    case "T":
      return "a toll room";
    case "C":
      return "a special room";
    default:
      return "the next room";
  }
}

/** One plain sentence per engine event for the Fight feed. */
export function formatSimEvent(
  event: SimEvent,
  heroes?: readonly HeroRuntime[],
): string {
  switch (event.type) {
    case "spawn":
      return `${heroName(heroes, event.heroId)} entered the dungeon.`;
    case "move":
      return `${heroName(heroes, event.heroId)} walked ${event.dir}.`;
    case "enter":
      return `${heroName(heroes, event.heroId)} entered ${roomKidWord(event.roomType)}.`;
    case "damage":
      return `${heroName(heroes, event.heroId)} took ${event.amount} damage (HP ${event.hp}).`;
    case "pickup":
      return `${heroName(heroes, event.heroId)} picked up gold (${event.amount}).`;
    case "toll":
      return `${heroName(heroes, event.heroId)} paid a toll (${event.amount} gold).`;
    case "gold_drop":
      return `${heroName(heroes, event.heroId)} dropped gold.`;
    case "teleport":
      return `${heroName(heroes, event.heroId)} teleported to another room.`;
    case "wait_room":
      return `${heroName(heroes, event.heroId)} is still waiting to enter.`;
    case "death":
      return `${heroName(heroes, event.heroId)} fell.`;
    case "wait":
      return `${heroName(heroes, event.heroId)} waited.`;
    case "cast":
      return `You cast ${event.spellType}.`;
    case "sleep":
      return `${heroName(heroes, event.heroId)} fell asleep.`;
    case "wake":
      return `${heroName(heroes, event.heroId)} woke up.`;
    case "banality":
      return `${heroName(heroes, event.heroId)} was hit by Banality.`;
    case "room_move":
      return `A room slid to a new place.`;
    case "shove":
      return `${heroName(heroes, event.heroId)} shoved a room ${event.dir}.`;
    case "fire":
      return `${heroName(heroes, event.heroId)} fired ${event.dir}.`;
    case "shell":
      return `${heroName(heroes, event.heroId)} cleared a path with a shell.`;
    case "loss":
      return `${heroName(heroes, event.heroId)} reached the exit.`;
    case "win":
      return "You stopped them before they reached the exit.";
    case "stalemate":
      return "Nothing further changes.";
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

export const EVENT_FEED_EMPTY = "No events yet — press Step.";
export const EVENT_FEED_TITLE = "What happened";
export const EVENT_TECHNICAL_SUMMARY = "Technical log (raw events)";
