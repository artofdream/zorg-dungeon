import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".turbo", "coverage"]);

/** Recursively list files under `dir`, skipping build/vcs noise. */
export function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function filesWithExt(paths, exts) {
  return paths.filter((p) => exts.includes(extname(p)));
}

export function fail(messages) {
  for (const m of messages) console.error(`✗ ${m}`);
  process.exitCode = 1;
}

export function ok(message) {
  console.log(`✓ ${message}`);
}
