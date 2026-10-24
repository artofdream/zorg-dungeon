#!/usr/bin/env node
// Archify honesty guard.
//
// Archify 3.x ignores `meta.views` (guided chapters): anything authored there
// is silently dropped from the rendered diagram. Honesty / status wording
// ("Probed", "Simulated", "Not hosted", "Not FEAT_NMI", ...) that lives only in
// those retired chapter notes therefore vanishes from the page. This guard
// fails when that can happen. Dependency-free (Node >= 18, no installs).
//
// For every committed Archify IR (a *.json with `schema_version`, `diagram_type`
// and `meta.output`) it
//   1. FAILS if `meta.views` exists (retired in 3.x; content silently dropped);
//   2. FAILS if a configured honesty label/phrase appears in a retired
//      view/chapter note but nowhere in the rendered text (component/participant
//      labels, sublabels, tags, card titles/items, ...);
//   3. WARNS (non-failing) if the committed HTML's generator string is not the
//      expected one (default `archify 3.2.0`), or the HTML is missing.
//
// Usage:  node scripts/check-archify-honesty.mjs [--root DIR] [--config FILE]
// Config: scripts/archify-honesty.config.json (see README line / --help).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep, posix } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = join(HERE, "archify-honesty.config.json");

export const DEFAULTS = {
  labels: ["Probed", "Simulated", "Not hosted", "Not Live", "Proposed", "Unknown", "Documented", "Gap", "Verified"],
  phrases: [],
  expectedGenerator: "archify 3.2.0",
  generatorExemptTypes: ["timeline"], // hand-rendered by chronify; no archify generator meta
  html: {}, // IR path -> committed HTML path (repo-relative), when not meta.output beside the IR
  ignore: [], // repo-relative path prefixes to skip
  renderedKeys: [
    "label", "sublabel", "tag", "tags", "title", "subtitle", "items",
    "detail", "note", "text", "description", "honesty",
  ],
  caseSensitive: true,
};

const RETIRED_TOP = ["views", "chapters"]; // top-level or under meta
const SKIP_DIRS = new Set(["node_modules", ".git", "target", "dist", "build", "coverage", ".venv", "__pycache__"]);

export function loadConfig(path) {
  let user = {};
  if (path && existsSync(path)) user = JSON.parse(readFileSync(path, "utf8"));
  const cfg = { ...DEFAULTS, ...user };
  for (const k of ["labels", "phrases", "generatorExemptTypes", "ignore", "renderedKeys"]) {
    if (!Array.isArray(cfg[k]) || cfg[k].some((v) => typeof v !== "string")) throw new Error(`config.${k} must be an array of strings`);
  }
  return cfg;
}

const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matcher(term, caseSensitive = true) {
  return new RegExp(`(?<![A-Za-z0-9_])${esc(norm(term))}(?![A-Za-z0-9_])`, caseSensitive ? "" : "i");
}

/** Collect strings stored under any of `keys` (string or array of strings), recursively. */
function collect(node, keys, out, skipRetired) {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, keys, out, skipRetired);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (skipRetired && RETIRED_TOP.includes(k)) continue;
      if (keys.has(k)) {
        if (typeof v === "string") out.push(v);
        else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") out.push(x);
      }
      if (v && typeof v === "object") collect(v, keys, out, skipRetired);
    }
  }
}

export function renderedText(ir, cfg) {
  const out = [];
  collect(ir, new Set(cfg.renderedKeys), out, true);
  return norm(out.join(" \n "));
}

/** Retired view/chapter notes: [{where, text}] */
export function retiredNotes(ir) {
  const notes = [];
  const holders = [["", ir], ["meta.", ir && ir.meta]];
  for (const [prefix, holder] of holders) {
    if (!holder || typeof holder !== "object") continue;
    for (const key of RETIRED_TOP) {
      const list = holder[key];
      if (!Array.isArray(list)) continue;
      list.forEach((v, i) => {
        const id = v && typeof v === "object" && v.id ? v.id : String(i);
        const texts = [];
        if (typeof v === "string") texts.push(v);
        else collect(v, new Set(["label", "title", "note", "text", "detail", "description", "items"]), texts, false);
        for (const t of texts) notes.push({ where: `${prefix}${key}[${id}]`, text: norm(t) });
      });
    }
  }
  return notes;
}

export function isArchifyIR(obj) {
  return !!obj && typeof obj === "object" && !Array.isArray(obj) &&
    typeof obj.schema_version !== "undefined" && typeof obj.diagram_type === "string" &&
    !!obj.meta && typeof obj.meta === "object" && typeof obj.meta.output === "string";
}

const decodeEntities = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0*39;|&#x0*27;|&apos;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Every `<meta name="generator">` content in the page, including pages embedded entity-escaped (iframe srcdoc). */
export function generatorsOf(html) {
  const found = [];
  for (const text of [html, decodeEntities(html)]) {
    for (const tag of text.match(/<meta\b[^>]*>/gi) || []) {
      if (!/\bname\s*=\s*["']generator["']/i.test(tag)) continue;
      const m = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
      found.push(m ? (m[1] ?? m[2]) : "");
    }
    if (found.length) break; // literal tags win; fall back to the decoded text only if there are none
  }
  return found;
}

/** Check one parsed IR. `html` is the committed HTML text, null (missing) or undefined (skip). */
export function checkIR(ir, cfg, { file = "<ir>", html } = {}) {
  const errors = [];
  const warnings = [];
  const meta = ir.meta || {};

  if (Object.prototype.hasOwnProperty.call(meta, "views")) {
    errors.push(`${file}: meta.views exists. Archify 3.x ignores it, so its chapter notes are silently dropped from the rendered diagram. Move any wording you still need into components (label/sublabel/tag) or cards, then delete meta.views.`);
  }

  const rendered = renderedText(ir, cfg);
  const terms = [...new Set([...cfg.labels, ...cfg.phrases])];
  for (const { where, text } of retiredNotes(ir)) {
    for (const term of terms) {
      if (matcher(term, cfg.caseSensitive).test(text) && !matcher(term, cfg.caseSensitive).test(rendered)) {
        errors.push(`${file}: honesty wording "${term}" appears in retired ${where} ("${text.slice(0, 80)}") but not in any component label/sublabel/tag or card item, so it is not rendered.`);
      }
    }
  }

  if (html !== undefined && !cfg.generatorExemptTypes.includes(ir.diagram_type)) {
    if (html === null) {
      warnings.push(`${file}: committed HTML for meta.output "${meta.output}" not found; cannot check its generator string (set "html" in the config if it is rendered elsewhere).`);
    } else {
      const gens = generatorsOf(html);
      const bad = [...new Set(gens.filter((g) => g !== cfg.expectedGenerator))];
      if (!gens.length) warnings.push(`${file}: committed HTML has no <meta name="generator"> (expected "${cfg.expectedGenerator}").`);
      else if (bad.length) warnings.push(`${file}: committed HTML generator is "${bad.join('", "')}", expected "${cfg.expectedGenerator}". Regenerate with the pinned Archify.`);
    }
  }
  return { errors, warnings };
}

export function listCandidateFiles(root) {
  try {
    const out = execFileSync("git", ["-C", root, "ls-files", "-z", "--", "*.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const files = out.split("\0").filter(Boolean);
    if (files.length) return files.filter((f) => existsSync(join(root, f)));
  } catch { /* not a git checkout: fall through to a directory walk */ }
  const found = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".json")) found.push(relative(root, full).split(sep).join("/"));
    }
  })(root);
  return found;
}

export function run(root, cfg) {
  const errors = [];
  const warnings = [];
  let checked = 0;
  for (const rel of listCandidateFiles(root).sort()) {
    if (cfg.ignore.some((p) => rel === p || rel.startsWith(p.endsWith("/") ? p : p + "/"))) continue;
    let ir;
    try { ir = JSON.parse(readFileSync(join(root, rel), "utf8")); } catch { continue; }
    if (!isArchifyIR(ir)) continue;
    checked++;
    const htmlRel = cfg.html[rel] || posix.join(posix.dirname(rel), ir.meta.output);
    const htmlPath = join(root, htmlRel);
    const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : null;
    const r = checkIR(ir, cfg, { file: rel, html });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { checked, errors, warnings };
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes("--help")) { console.log("usage: check-archify-honesty.mjs [--root DIR] [--config FILE]"); return 0; }
  const root = resolve(arg("--root") || process.cwd());
  const cfg = loadConfig(arg("--config") || DEFAULT_CONFIG_PATH);
  const { checked, errors, warnings } = run(root, cfg);
  const gha = process.env.GITHUB_ACTIONS === "true";
  for (const w of warnings) console.warn(gha ? `::warning::${w}` : `⚠ ${w}`);
  for (const e of errors) console.error(gha ? `::error::${e}` : `✗ ${e}`);
  if (!checked) console.warn("⚠ no committed Archify IR found; nothing to check");
  if (errors.length) return 1;
  console.log(`✓ archify honesty guard: ${checked} diagram(s) checked, ${warnings.length} warning(s)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
}
