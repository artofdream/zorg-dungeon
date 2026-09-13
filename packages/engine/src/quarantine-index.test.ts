// CF-005 sensor: corpus-quarantine-honesty — quarantine-index.json must stay
// honest with on-disk quarantine fixtures and green corpus globs.
// Does not invent author fixes for Dream Trap / Math Bath.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "fixtures");
const indexPath = join(fixturesRoot, "quarantine-index.json");
const findingsPath = join(here, "..", "..", "..", "docs", "FINDINGS.md");

type QuarantineEntry = {
  id: string;
  path: string;
  reasons: string[];
};

const EXPECTED_IDS = [
  "base-classic-11",
  "base-classic-18",
  "base-classic-23",
  "deluxe-8.2",
  "deluxe-10.7",
] as const;

function listTxtRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTxtRecursive(abs));
    else if (name.name.endsWith(".txt")) out.push(abs);
  }
  return out.sort();
}

function isQuarantinePath(abs: string): boolean {
  const rel = relative(fixturesRoot, abs).replaceAll("\\", "/");
  return rel.includes("/quarantine/");
}

describe("CF-005 quarantine-index honesty sensor", () => {
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as QuarantineEntry[];

  it("lists the expected quarantine ids (base-classic 11/18/23 + contracts 8.2/10.7)", () => {
    expect(index.map((e) => e.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it("every quarantine-index path exists on disk under fixtures/quarantine/", () => {
    expect(index.length).toBe(EXPECTED_IDS.length);
    for (const entry of index) {
      const abs = join(fixturesRoot, entry.path);
      expect(existsSync(abs), `missing ${entry.path}`).toBe(true);
      const rel = entry.path.replaceAll("\\", "/");
      expect(rel.includes("/quarantine/"), `${entry.path} not under quarantine/`).toBe(true);
    }
  });

  it("green corpus globs never include quarantine-index paths", () => {
    const allTxt = listTxtRecursive(fixturesRoot);
    const green = allTxt.filter((p) => !isQuarantinePath(p));
    const quarantineAbs = new Set(index.map((e) => join(fixturesRoot, e.path)));

    for (const abs of quarantineAbs) {
      expect(green.includes(abs), `quarantined file leaked into green: ${relative(fixturesRoot, abs)}`).toBe(
        false,
      );
      expect(isQuarantinePath(abs)).toBe(true);
    }

    // base-classic green root listing (non-recursive) must not see quarantine leaves.
    const baseClassicRoot = join(fixturesRoot, "base-classic");
    const baseClassicGreen = readdirSync(baseClassicRoot).filter((n) => n.endsWith(".txt"));
    for (const entry of index.filter((e) => e.path.startsWith("base-classic/"))) {
      const leaf = entry.path.split("/").pop()!;
      expect(baseClassicGreen).not.toContain(leaf);
    }
  });

  it("FINDINGS.md still names CF-005 and Dream Trap / Math Bath", () => {
    const findings = readFileSync(findingsPath, "utf8");
    expect(findings).toMatch(/## CF-005:/);
    expect(findings).toMatch(/Dream Trap/);
    expect(findings).toMatch(/Math Bath/);
  });
});
