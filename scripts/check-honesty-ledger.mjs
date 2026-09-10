#!/usr/bin/env node
// Honesty-ledger gate: docs/STATUS_LEDGER.md structural validity.
// (Cross-file proof checking lives in check-requirements-trace.mjs — this
// script only checks the ledger is well-formed on its own terms.)
import { existsSync } from "node:fs";
import { readText, fail, ok } from "./lib.mjs";

const root = process.cwd();
const path = `${root}/docs/STATUS_LEDGER.md`;
if (!existsSync(path)) {
  fail(["docs/STATUS_LEDGER.md is missing."]);
  process.exit(1);
}

const ALLOWED_STATUS = /^(Unknown|Planned|Simulated|Live & Probed|Probed \(\d{4}-\d{2}-\d{2}\))$/;
const rows = [...readText(path).matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/gm)]
  // drop the header/separator rows
  .filter(([, id]) => id !== "ID" && !/^-+$/.test(id));

const problems = [];
const seen = new Set();
for (const [, id, status, evidence] of rows) {
  if (!/^(FR|NFR)-\d+$/.test(id)) {
    problems.push(`row "${id}" is not a valid FR-xx/NFR-xx id`);
    continue;
  }
  if (seen.has(id)) problems.push(`${id} appears more than once in the ledger`);
  seen.add(id);

  if (!ALLOWED_STATUS.test(status.trim())) {
    problems.push(`${id} has status "${status.trim()}" — must be one of Unknown, Planned, Simulated, "Probed (YYYY-MM-DD)", "Live & Probed"`);
    continue;
  }
  const needsEvidence = !/^(Unknown|Planned)$/.test(status.trim());
  if (needsEvidence && !evidence.trim()) {
    problems.push(`${id} is "${status.trim()}" but has no Evidence — that's an unproven claim (see AGENTS.md §2)`);
  }
}

if (!rows.length) {
  fail(["No ledger rows found — is docs/STATUS_LEDGER.md's table format intact?"]);
} else if (problems.length) {
  fail(problems);
} else {
  ok(`honesty ledger well-formed — ${rows.length} rows checked`);
}
