#!/usr/bin/env node
// Requirements-trace gate (the "graph" in AGENTS.md §4).
//
// 1. Every FR-xx/NFR-xx referenced in packages/**|apps/** must be defined in
//    GAME_SPEC.md (no typos / orphaned IDs).
// 2. docs/STATUS_LEDGER.md must have exactly one row per ID defined in
//    GAME_SPEC.md — no missing, no stale/extra rows.
// 3. Any ledger row claiming Simulated / Probed (date) / Live & Probed must
//    point at real evidence: a file that exists and actually mentions the ID.
//    (Unknown/Planned rows are fine with empty evidence — see AGENTS.md §2.)
import { readText, walk, fail, ok } from "./lib.mjs";
import { existsSync } from "node:fs";

const ID_RE = /\b(FR|NFR)-(\d+)\b/g;
const root = process.cwd();

function idsIn(text) {
  const set = new Set();
  for (const m of text.matchAll(ID_RE)) set.add(`${m[1]}-${m[2]}`);
  return set;
}

const specPath = `${root}/GAME_SPEC.md`;
if (!existsSync(specPath)) {
  fail(["GAME_SPEC.md not found at repo root — nothing to trace against."]);
  process.exit(1);
}
const definedIds = idsIn(readText(specPath));

// 1. Orphaned IDs referenced in code/tests but never defined.
const codeFiles = [...walk(`${root}/packages`), ...walk(`${root}/apps`)].filter((f) =>
  /\.(ts|tsx|js|jsx|mjs)$/.test(f),
);
const orphans = [];
for (const file of codeFiles) {
  for (const id of idsIn(readText(file))) {
    if (!definedIds.has(id)) orphans.push(`${id} referenced in ${file.replace(root + "/", "")} but not defined in GAME_SPEC.md`);
  }
}

// 2. Ledger completeness.
const ledgerPath = `${root}/docs/STATUS_LEDGER.md`;
const ledgerText = existsSync(ledgerPath) ? readText(ledgerPath) : "";
const rows = [...ledgerText.matchAll(/^\|\s*((?:FR|NFR)-\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/gm)];
const ledgerIds = new Set(rows.map((r) => r[1]));

const missingFromLedger = [...definedIds].filter((id) => !ledgerIds.has(id));
const staleInLedger = [...ledgerIds].filter((id) => !definedIds.has(id));

// 3. Proof-check: Simulated/Probed/Live & Probed rows need real evidence.
const proofFailures = [];
for (const [, id, status, evidence] of rows) {
  const claimsProof = /^Simulated$|^Live & Probed$|^Probed \(\d{4}-\d{2}-\d{2}\)$/.test(status.trim());
  if (!claimsProof) continue;
  const ev = evidence.trim();
  if (!ev) {
    proofFailures.push(`${id} claims "${status.trim()}" with no evidence`);
    continue;
  }
  const evPath = `${root}/${ev}`;
  if (!existsSync(evPath)) {
    proofFailures.push(`${id} claims "${status.trim()}" but evidence path "${ev}" does not exist`);
    continue;
  }
  if (!readText(evPath).includes(id)) {
    proofFailures.push(`${id} claims "${status.trim()}" but ${ev} never mentions ${id}`);
  }
}

const problems = [...orphans, ...proofFailures];
if (missingFromLedger.length) {
  problems.push(`STATUS_LEDGER.md is missing rows for: ${missingFromLedger.join(", ")}`);
}
if (staleInLedger.length) {
  problems.push(`STATUS_LEDGER.md has rows for IDs not in GAME_SPEC.md: ${staleInLedger.join(", ")}`);
}

if (problems.length) {
  fail(problems);
} else {
  ok(`requirements trace clean — ${definedIds.size} IDs defined, ${ledgerIds.size} ledgered, 0 orphans`);
  const unimplemented = [...definedIds].filter(
    (id) => !codeFiles.some((f) => idsIn(readText(f)).has(id)),
  );
  console.log(`  (info) ${unimplemented.length}/${definedIds.size} IDs have no code reference yet — expected pre-Phase-1.`);
}
