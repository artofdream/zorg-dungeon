// Implements FR-16 (Gold Room O(x)) and the FIFO purse used by FR-17
// (Tax Room T(x, elem) light-cell tolls). Pickup is a purse append;
// payment dequeues oldest coins and refunds them to their source rooms.

export interface GoldUnit {
  sourceRoomId: string;
}

export interface TollRefund {
  roomId: string;
  amount: number;
}

export interface TollPayment {
  paid: number;
  refunds: TollRefund[];
}

/** FR-16: starting piles — only authored O(x) rooms carry gold at setup. */
export function initialRoomGold(rooms: ReadonlyArray<{ id: string; def: { type: string; gold?: number | string } }>): Map<string, number> {
  const piles = new Map<string, number>();
  for (const room of rooms) {
    if (room.def.type !== "O") continue;
    const raw = room.def.gold;
    const amount = typeof raw === "number" ? raw : Number(raw);
    piles.set(room.id, Number.isNaN(amount) ? 0 : amount);
  }
  return piles;
}

/** FR-16: first entrant takes every remaining coin. Returns amount taken. */
export function pickupGold(
  piles: Map<string, number>,
  purse: GoldUnit[],
  roomId: string,
): number {
  const amount = piles.get(roomId) ?? 0;
  if (amount <= 0) return 0;
  for (let i = 0; i < amount; i += 1) {
    purse.push({ sourceRoomId: roomId });
  }
  piles.set(roomId, 0);
  return amount;
}

/**
 * FR-16: a dead hero's purse attaches to the death room (that room now
 * behaves as an O pile on top of whatever type it already is).
 */
export function dropGold(
  piles: Map<string, number>,
  purse: GoldUnit[],
  roomId: string,
): number {
  const amount = purse.length;
  if (amount <= 0) return 0;
  piles.set(roomId, (piles.get(roomId) ?? 0) + amount);
  purse.length = 0;
  return amount;
}

export function canPayToll(purse: readonly GoldUnit[], cost: number): boolean {
  return cost <= 0 || purse.length >= cost;
}

/**
 * FR-17: charge the oldest `cost` coins (FIFO) and refund each to its
 * source room. Returns null when the hero cannot pay.
 */
export function payToll(
  piles: Map<string, number>,
  purse: GoldUnit[],
  cost: number,
): TollPayment | null {
  if (cost <= 0) return { paid: 0, refunds: [] };
  if (purse.length < cost) return null;

  const counts = new Map<string, number>();
  for (let i = 0; i < cost; i += 1) {
    const unit = purse.shift();
    if (!unit) return null;
    counts.set(unit.sourceRoomId, (counts.get(unit.sourceRoomId) ?? 0) + 1);
  }

  const refunds: TollRefund[] = [];
  for (const [roomId, amount] of counts) {
    piles.set(roomId, (piles.get(roomId) ?? 0) + amount);
    refunds.push({ roomId, amount });
  }
  return { paid: cost, refunds };
}

export function purseAmount(purse: readonly GoldUnit[]): number {
  return purse.length;
}

export function pilesKey(piles: ReadonlyMap<string, number>): string {
  return [...piles.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, amount]) => `${id}:${amount}`)
    .join(";");
}

export function clonePiles(piles: ReadonlyMap<string, number>): Map<string, number> {
  return new Map(piles);
}

export function parsePilesKey(key: string): Map<string, number> {
  const piles = new Map<string, number>();
  if (!key) return piles;
  for (const part of key.split(";")) {
    const split = part.lastIndexOf(":");
    if (split <= 0) continue;
    const id = part.slice(0, split);
    const amount = Number(part.slice(split + 1));
    if (id && !Number.isNaN(amount) && amount > 0) piles.set(id, amount);
  }
  return piles;
}

export function clonePurse(purse: readonly GoldUnit[]): GoldUnit[] {
  return purse.map((unit) => ({ sourceRoomId: unit.sourceRoomId }));
}

/** Snapshot a planner uses: coins in hand + remaining room piles. */
export interface PathEconomy {
  gold: number;
  piles: ReadonlyMap<string, number>;
}
