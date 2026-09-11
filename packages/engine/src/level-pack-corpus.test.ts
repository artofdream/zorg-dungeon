// Covers NFR-5: authored level pack (~130 fixtures) as a parse regression suite.
// Parse every non-quarantined fixture. Deeper checks only where honest
// (rooms/heroes present, C stays opaque, Gunner duration stored not interpreted,
// contract catalog lists files). Does not claim win/loss outcomes or FR-4 gating.
// S5: N11, N18, deluxe 10.7, and clearly malformed entries stay quarantined.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTRACTS, loadContracts, stubContracts } from "./contracts.js";
import { isChoixDef } from "./level.js";
import { parseLevel, validateLevel } from "./loader.js";

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function listTxtRecursive(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "sponsor-extract") continue;
      listTxtRecursive(path, acc);
    } else if (name.name.endsWith(".txt")) {
      acc.push(path);
    }
  }
  return acc.sort();
}

const ALL_TXT = listTxtRecursive(fixturesRoot);
const GREEN = ALL_TXT.filter((p) => !p.includes(`${join("/")}quarantine${join("/")}`) && !p.includes("/quarantine/"));
const QUARANTINE = ALL_TXT.filter((p) => p.includes("/quarantine/"));

function rel(path: string): string {
  return relative(fixturesRoot, path);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function headerId(path: string): string {
  const match = read(path).match(/^id:\s*(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

describe("NFR-5: authored level-pack parse regression (green)", () => {
  it("imports the sponsor extract as per-level fixtures (124 authored entries)", () => {
    expect(ALL_TXT).toHaveLength(124);
    expect(GREEN.length + QUARANTINE.length).toBe(124);
    expect(GREEN.length).toBeGreaterThanOrEqual(118);
  });

  it.each(GREEN.map((p) => [rel(p), p] as const))("parses %s without error", (_name, path) => {
    const level = parseLevel(read(path));
    expect(level.id).not.toBe("level-0");
    expect(level.rooms.length).toBeGreaterThan(0);
    expect(level.heroes.length).toBeGreaterThan(0);
  });

  it("keeps C rooms opaque and Gunner 3rd-arg stored (S2 / S3)", () => {
    const artillery = GREEN.filter((p) => /\/9\.\d/.test(rel(p)));
    expect(artillery.length).toBeGreaterThan(0);
    let sawC = false;
    let sawDuration = false;
    for (const path of artillery) {
      const level = parseLevel(read(path));
      for (const slot of level.rooms) {
        if (!isChoixDef(slot.room) && slot.room.type === "C") {
          sawC = true;
          expect(Array.isArray(slot.room.args)).toBe(true);
        }
      }
      for (const hero of level.heroes) {
        if (!isChoixDef(hero) && hero.type === "Gunner" && hero.duration !== undefined) {
          sawDuration = true;
        }
      }
    }
    expect(sawC).toBe(true);
    expect(sawDuration).toBe(true);
  });

  it("validateLevel still accepts the Phase 0 base-classic green pack", () => {
    const classic = GREEN.filter((p) => rel(p).startsWith("base-classic/") && !/\/2[124]-/.test(rel(p)));
    expect(classic.length).toBe(18);
    for (const path of classic) {
      const result = validateLevel(parseLevel(read(path)));
      expect(result.errors, rel(path)).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });
});

describe("contract catalog is data only (S6 — no gating)", () => {
  it("keeps src/contracts.ts in sync with fixtures/contracts/catalog.json", () => {
    const fromDisk = JSON.parse(read(join(fixturesRoot, "contracts", "catalog.json")));
    expect(fromDisk).toEqual(CONTRACTS);
  });

  it("lists 10 authored contracts and 5 Blabla stubs with no fake levels", () => {
    const all = loadContracts();
    expect(all).toHaveLength(15);
    expect(all.filter((c) => !c.stub)).toHaveLength(10);
    const stubs = stubContracts();
    expect(stubs.map((c) => c.name)).toEqual([
      "Inventory",
      "Celebrity",
      "Fortune",
      "Necromancy",
      "Awareness",
    ]);
    for (const stub of stubs) {
      expect(stub.levelIds).toEqual([]);
      expect(stub.costPoints).toBeNull();
      expect(stub.source).toBe("Blabla");
    }
  });

  it("every authored contract level id has a fixture file (green or quarantine)", () => {
    const fixtureIds = new Set(ALL_TXT.map(headerId));
    for (const contract of loadContracts()) {
      if (contract.stub) continue;
      expect(contract.costPoints, `contract ${contract.id} cost`).not.toBeNull();
      expect(contract.levelIds.length).toBeGreaterThan(0);
      for (const id of contract.levelIds) {
        expect(fixtureIds.has(id), `${contract.id} missing ${id}`).toBe(true);
      }
    }
  });

  it("stores contract 2 cost as 5 plus the author note, not an invented 7", () => {
    const elements = loadContracts().find((c) => c.id === "2");
    expect(elements?.costPoints).toBe(5);
    expect(elements?.costNote).toBe("à modifier : au moins 7");
  });
});

describe("S5 quarantine folder is excluded from the green suite", () => {
  it("keeps Dream Trap, Math Bath, Artilleur(_), and malformed choix out of green", () => {
    const qIds = QUARANTINE.map(headerId).sort();
    expect(qIds).toEqual([
      "base-classic-11",
      "base-classic-18",
      "base-classic-23",
      "deluxe-10.7",
      "deluxe-8.2",
    ]);
    const greenIds = GREEN.map((p) => parseLevel(read(p)).id);
    for (const id of qIds) {
      expect(greenIds).not.toContain(id);
    }
  });
});

// S5: author-flagged / malformed levels must not fail CI.
describe.skip("S5 quarantine — do not run in CI", () => {
  it.each(QUARANTINE.map((p) => [rel(p), p] as const))("%s", (_name, path) => {
    parseLevel(read(path));
  });
});
