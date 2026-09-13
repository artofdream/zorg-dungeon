#!/usr/bin/env node
// Docs-graph gate: the "second brain" wikilink check.
// [[Wikilinks]] anywhere in docs/**.md or the root *.md files must resolve
// to either another markdown file's basename OR a requirement ID defined in
// GAME_SPEC.md ([[FR-10]] is a legitimate link into the requirements graph).
// Broken links fail the build; unlinked ("orphan") files only warn — day-one
// docs are allowed to be unlinked, they just shouldn't link to things that
// don't exist. Code spans (`...` and ``` fences) are stripped first so
// prose *mentioning* the [[wikilink]] syntax itself isn't parsed as a link.
import { readText, walk, fail, ok } from "./lib.mjs";
import { basename, extname } from "node:path";
import { readdirSync, existsSync } from "node:fs";

const root = process.cwd();
const rootMd = readdirSync(root)
  .filter((f) => extname(f) === ".md")
  .map((f) => `${root}/${f}`);
const docFiles = [...walk(`${root}/docs`).filter((f) => extname(f) === ".md"), ...rootMd];

const byName = new Map(); // normalized basename -> path
for (const f of docFiles) {
  const name = basename(f, ".md").toLowerCase();
  const rel = f.replace(root + "/", "").replace(/\\/g, "/");
  // Prefer root docs/ over docs/fr/ for bare [[LEARN]] etc. (ADR-0007).
  if (rel.includes("/fr/")) {
    byName.set(`fr/${name}`, f);
    if (!byName.has(name)) byName.set(name, f);
  } else {
    byName.set(name, f);
  }
}

const specPath = `${root}/GAME_SPEC.md`;
const requirementIds = new Set();
if (existsSync(specPath)) {
  for (const m of readText(specPath).matchAll(/\b((?:FR|NFR)-\d+)\b/g)) {
    requirementIds.add(m[1].toLowerCase());
  }
}

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

const linkedNames = new Set();
const broken = [];
const LINK_RE = /\[\[([^\]|#]+)/g;

for (const f of docFiles) {
  for (const m of stripCode(readText(f)).matchAll(LINK_RE)) {
    const target = m[1].trim().toLowerCase();
    linkedNames.add(target);
    if (!byName.has(target) && !requirementIds.has(target)) {
      broken.push(`${f.replace(root + "/", "")} links to [[${m[1].trim()}]], which doesn't match any doc file or requirement ID`);
    }
  }
}

if (broken.length) {
  fail(broken);
} else {
  ok(`docs graph clean — ${docFiles.length} files, 0 broken [[wikilinks]]`);
  const orphans = [...byName.entries()].filter(([name]) => !linkedNames.has(name)).map(([, p]) => p.replace(root + "/", ""));
  if (orphans.length) {
    console.log(`  (info) unlinked docs (fine for now, consider cross-linking): ${orphans.join(", ")}`);
  }
}
