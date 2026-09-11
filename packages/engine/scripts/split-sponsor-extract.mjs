#!/usr/bin/env node
// Split packages/engine/fixtures/sponsor-extract/levels.json into per-level
// .txt fixtures. Strips leaked chapter / next-contract text. Does not invent
// rooms, heroes, or unlock rules.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extract = JSON.parse(readFileSync(join(root, "fixtures", "sponsor-extract", "levels.json"), "utf8"));

const CONTRACTS = [
  { id: "1", name: "The Basics", costPoints: 0, costNote: null, sourceLevelCount: 9, stub: false },
  {
    id: "2",
    name: "Elements",
    costPoints: 5,
    costNote: "à modifier : au moins 7",
    sourceLevelCount: 10,
    stub: false,
  },
  { id: "3", name: "Parallelism", costPoints: 10, costNote: null, sourceLevelCount: 9, stub: false },
  { id: "4", name: "Purple", costPoints: 15, costNote: null, sourceLevelCount: 9, stub: false },
  { id: "5", name: "Capitalism", costPoints: 20, costNote: null, sourceLevelCount: 9, stub: false },
  { id: "6", name: "Movement", costPoints: 25, costNote: null, sourceLevelCount: 10, stub: false },
  { id: "7", name: "Customization", costPoints: 30, costNote: null, sourceLevelCount: 11, stub: false },
  { id: "8", name: "Hypnosis", costPoints: 35, costNote: null, sourceLevelCount: 9, stub: false },
  { id: "9", name: "Artillery", costPoints: 40, costNote: null, sourceLevelCount: 7, stub: false },
  { id: "10", name: "Return to Basics", costPoints: 45, costNote: null, sourceLevelCount: null, stub: false },
  { id: "11", name: "Inventory", costPoints: null, costNote: null, sourceLevelCount: null, stub: true },
  { id: "12", name: "Celebrity", costPoints: null, costNote: null, sourceLevelCount: null, stub: true },
  { id: "13", name: "Fortune", costPoints: null, costNote: null, sourceLevelCount: null, stub: true },
  { id: "14", name: "Necromancy", costPoints: null, costNote: null, sourceLevelCount: null, stub: true },
  { id: "15", name: "Awareness", costPoints: null, costNote: null, sourceLevelCount: null, stub: true },
];

function slugTitle(title) {
  return (title || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanLevelText(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^Contrat\s+n/i.test(t)) break;
    if (/^Co[uû]t\s*:/i.test(t)) break;
    if (/^Manuel\b/i.test(t)) break;
    if (/^Chapitre\b/i.test(t)) break;
    if (/^Niveaux\b/i.test(t) && !/^Niveau\s+\d/i.test(t)) break;
    if (/^Niveau copi/i.test(t)) break;
    out.push(line);
  }
  return `${out.join("\n").trim()}\n`;
}

function canonicalId(entry) {
  if (entry.edition === "base-classic") return `base-classic-${entry.id}`;
  if (entry.edition === "base-extras") return `base-extras-${entry.id}`;
  return `deluxe-${entry.id}`;
}

function fileStem(entry) {
  const slug = slugTitle(entry.title);
  if (entry.edition === "base-classic") {
    const n = String(entry.id).padStart(2, "0");
    return slug ? `${n}-${slug}` : n;
  }
  return slug ? `${entry.id}-${slug}` : String(entry.id);
}

function quarantineReasons(entry) {
  const reasons = [];
  const text = entry.text;
  // S5 + clearly malformed only. Deluxe 8.3 is also titled Dream Trap but is
  // a different authored level — do not copy the extract's extra tag.
  if (entry.edition === "base-classic" && entry.id === "11") reasons.push("S5_dream_trap");
  if (entry.edition === "base-classic" && entry.id === "18") reasons.push("S5_malformed_choix");
  if (entry.edition === "base-classic" && entry.id === "23") reasons.push("malformed_princess_choix");
  if (entry.edition === "deluxe-contracts" && entry.id === "8.2") reasons.push("malformed_unbalanced_choix");
  if (entry.edition === "deluxe-contracts" && entry.id === "10.7") reasons.push("S5_artilleur_placeholder");
  if (/Artilleur\(_\)|Gunner\(_\)/.test(text)) reasons.push("artilleur_placeholder");
  return [...new Set(reasons)];
}

function targetDir(entry, quarantined) {
  if (entry.edition === "base-classic") {
    return join(root, "fixtures", "base-classic", quarantined ? "quarantine" : "");
  }
  if (entry.edition === "base-extras") {
    return join(root, "fixtures", "base-extras", quarantined ? "quarantine" : "");
  }
  return join(root, "fixtures", "contracts", quarantined ? "quarantine" : "");
}

const written = [];
const catalogLevels = new Map(CONTRACTS.map((c) => [c.id, []]));

for (const entry of extract) {
  const id = canonicalId(entry);
  const reasons = quarantineReasons(entry);
  const quarantined = reasons.length > 0;
  const dir = targetDir(entry, quarantined);
  mkdirSync(dir, { recursive: true });

  const header = [`id: ${id}`];
  if (entry.edition === "deluxe-contracts") {
    const contractId = String(entry.id).split(".")[0];
    header.push(`Contract: ${contractId}`);
    catalogLevels.get(contractId)?.push(id);
  }
  const body = `${header.join("\n")}\n${cleanLevelText(entry.text)}`;
  const name = `${fileStem(entry)}.txt`;
  const path = join(dir, name);
  writeFileSync(path, body, "utf8");
  written.push({
    id,
    edition: entry.edition,
    sourceId: entry.id,
    title: entry.title,
    quarantined,
    reasons,
    rel: path.slice(join(root, "fixtures").length + 1),
  });
}

const catalog = CONTRACTS.map((c) => ({
  ...c,
  levelIds: catalogLevels.get(c.id) ?? [],
  source: c.stub ? "Blabla" : "deluxe-contracts",
}));

mkdirSync(join(root, "fixtures", "contracts"), { recursive: true });
writeFileSync(join(root, "fixtures", "contracts", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(
  join(root, "fixtures", "quarantine-index.json"),
  `${JSON.stringify(
    written.filter((w) => w.quarantined).map(({ id, rel, reasons }) => ({ id, path: rel, reasons })),
    null,
    2,
  )}\n`,
);

const green = written.filter((w) => !w.quarantined);
const q = written.filter((w) => w.quarantined);
console.log(`wrote ${written.length} fixtures (${green.length} green, ${q.length} quarantined)`);
for (const row of q) console.log(`  quarantine ${row.id} → ${row.rel} (${row.reasons.join(", ")})`);
