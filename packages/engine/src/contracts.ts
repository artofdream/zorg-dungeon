// Contract grouping as structured data (S6 / FR-4).
// Stores id, name, source Coût, and level ids. Does not encode earn/spend
// or unlock gating — those rules are unspecified in the source.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ContractRecord {
  id: string;
  name: string;
  /** Source `Coût` in points, or null for stub/Blabla contracts. */
  costPoints: number | null;
  /** Author note on the cost line, stored verbatim. */
  costNote: string | null;
  /** Bracket count from `Contrat n°N : Name [k]`, when present. */
  sourceLevelCount: number | null;
  stub: boolean;
  levelIds: string[];
  source: string;
}

const catalogPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "contracts",
  "catalog.json",
);

export function loadContracts(): ContractRecord[] {
  return JSON.parse(readFileSync(catalogPath, "utf8")) as ContractRecord[];
}

export function authoredContracts(): ContractRecord[] {
  return loadContracts().filter((c) => !c.stub);
}

export function stubContracts(): ContractRecord[] {
  return loadContracts().filter((c) => c.stub);
}
