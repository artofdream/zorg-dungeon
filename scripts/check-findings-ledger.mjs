#!/usr/bin/env node
// Findings-ledger gate: docs/FINDINGS.md structure + the antifragility rule
// ("the same miss twice is a missing sensor or gate" — AGENTS.md §3).
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { readText, fail, ok } from "./lib.mjs";

const root = process.cwd();
const path = `${root}/docs/FINDINGS.md`;
if (!existsSync(path)) {
  fail(["docs/FINDINGS.md is missing."]);
  process.exit(1);
}

const text = readText(path);
const sections = [...text.matchAll(/^## (CF-\d+): (.+)$/gm)];
const problems = [];
const seenIds = new Set();

function field(body, name) {
  const m = body.match(new RegExp(`^- ${name}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

// Changed files in this PR, best-effort — only meaningful in a PR run with
// full history (workflow uses fetch-depth: 0). Falls back to "unknown" so a
// missing base ref warns instead of silently passing.
function changedFiles() {
  const base = process.env.GITHUB_BASE_REF;
  if (process.env.GITHUB_EVENT_NAME !== "pull_request" || !base) return null;
  try {
    execSync(`git fetch origin ${base} --depth=50`, { stdio: "ignore" });
    const out = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}
let diffFiles = null;

for (let i = 0; i < sections.length; i++) {
  const [, id, title] = sections[i];
  const start = sections[i].index + sections[i][0].length;
  const end = i + 1 < sections.length ? sections[i + 1].index : text.length;
  const body = text.slice(start, end);

  if (seenIds.has(id)) problems.push(`${id} appears more than once`);
  seenIds.add(id);

  const status = field(body, "Status");
  const recurrenceRaw = field(body, "Recurrence");
  const sensor = field(body, "Sensor added");

  if (!/^(Open|Resolved)$/.test(status)) {
    problems.push(`${id} (${title}) has invalid Status "${status}" — must be Open or Resolved`);
  }
  const recurrence = Number.parseInt(recurrenceRaw, 10);
  if (!Number.isInteger(recurrence) || recurrence < 1) {
    problems.push(`${id} (${title}) has invalid Recurrence "${recurrenceRaw}" — must be an integer >= 1`);
    continue;
  }

  if (recurrence >= 2) {
    if (!sensor) {
      problems.push(`${id} (${title}) has Recurrence ${recurrence} but no "Sensor added" path — a repeat miss needs a new sensor/gate, not just a fix`);
      continue;
    }
    if (status === "Resolved") {
      if (diffFiles === null) diffFiles = changedFiles();
      if (diffFiles === null) {
        console.warn(`  (warn) could not compute PR diff — skipping sensor-touched check for ${id}; verify manually that ${sensor} was actually changed`);
      } else if (!diffFiles.includes(sensor)) {
        problems.push(`${id} (${title}) claims Resolved with Sensor added "${sensor}", but this PR doesn't touch that path`);
      }
    }
  }
}

if (problems.length) {
  fail(problems);
} else {
  ok(`findings ledger clean — ${sections.length} entries checked`);
}
