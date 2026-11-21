#!/usr/bin/env node
// FR-47 solution generator (NFR-4 bounded). For every level the Godot port
// ships, search one winning layout + cast sequence with the TS engine,
// verify it, derive its step-by-step explanation, and store it in
// packages/engine/fixtures/solutions/<levelId>.json. Levels the bounded
// search can't solve are stored as "unsolved" with the search verdict —
// never a made-up solution.
//
// Usage (after `pnpm --filter @zorg/engine build`):
//   node packages/engine/scripts/solve-levels.mjs --check          # re-verify + re-explain stored files (fast, CI)
//   node packages/engine/scripts/solve-levels.mjs --search [ids…]  # (re)search levels (slow; uses worker threads)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { DEFAULT_SOLUTION_SEARCH, explainSolution, parseLevel, searchSolution, verifySolution } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const OUT_DIR = "packages/engine/fixtures/solutions";
/** NFR-4: per-worker cap on legal layouts scored. */
const MAX_LAYOUTS = 1_000_000;

function shippedLevels() {
  const index = JSON.parse(readFileSync(join(repo, "apps/godot/levels/index.json"), "utf8"));
  return index.levels.map((e) => {
    const levelFile = JSON.parse(readFileSync(join(repo, "apps/godot/levels", `${e.id}.json`), "utf8"));
    const sourceText = readFileSync(join(repo, levelFile.source), "utf8");
    return {
      id: e.id,
      source: levelFile.source,
      sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
      level: parseLevel(sourceText),
    };
  });
}

function fileText(entry, search, solution) {
  const body = {
    generatedBy: "packages/engine/scripts/solve-levels.mjs",
    levelId: entry.id,
    source: entry.source,
    sourceSha256: entry.sourceSha256,
    status: solution ? "solved" : "unsolved",
    search,
  };
  if (solution) {
    body.solution = solution;
    body.explanation = explainSolution(entry.level, solution).steps;
  }
  return JSON.stringify(body, null, 2) + "\n";
}

async function searchLevel(entry) {
  const count = Math.max(1, Math.min(8, availableParallelism()));
  const results = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      new Promise((resolve, reject) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { id: entry.id, index, count } });
        w.once("message", resolve);
        w.once("error", reject);
      }),
    ),
  );
  const found = results.filter((r) => r.found).sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);
  const layoutsScored = results.reduce((n, r) => n + r.layoutsScored, 0);
  const verdict = found.length ? "found" : results.some((r) => r.verdict === "budget") ? "budget" : results[0].verdict;
  const search = {
    verdict,
    // Total legal layouts scored across workers (not stable across machines when found early, so not stored).
    maxLayoutsPerWorker: MAX_LAYOUTS,
    orientations: DEFAULT_SOLUTION_SEARCH.orientations,
    solvabilityCaps: DEFAULT_SOLUTION_SEARCH.solvabilityCaps,
    ...(found.length
      ? {}
      : {
          layoutsScored,
          castSearchCapped: results.reduce((n, r) => n + (r.castSearchCapped ?? 0), 0),
          reason: results.find((r) => r.reason)?.reason,
        }),
  };
  return { search, solution: found[0]?.solution, layoutsScored };
}

if (!isMainThread) {
  const { id, index, count } = workerData;
  const entry = shippedLevels().find((e) => e.id === id);
  const r = searchSolution(entry.level, { maxLayouts: MAX_LAYOUTS, shard: { index, count } });
  parentPort.postMessage(r);
} else {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const search = args.includes("--search");
  const only = args.filter((a) => !a.startsWith("--"));
  if (check === search) {
    console.error("usage: solve-levels.mjs --check | --search [levelId…]");
    process.exit(2);
  }
  let failures = 0;
  for (const entry of shippedLevels()) {
    const rel = join(OUT_DIR, `${entry.id}.json`);
    const abs = join(repo, rel);
    if (check) {
      if (!existsSync(abs)) {
        console.error(`MISSING: ${rel} — run with --search ${entry.id}`);
        failures += 1;
        continue;
      }
      const stored = JSON.parse(readFileSync(abs, "utf8"));
      if (stored.solution) {
        const v = verifySolution(entry.level, stored.solution);
        if (!v.ok) {
          console.error(`FAIL: ${rel} no longer wins: ${v.reason}`);
          failures += 1;
          continue;
        }
      }
      const text = fileText(entry, stored.search, stored.solution);
      if (text !== readFileSync(abs, "utf8")) {
        console.error(`DRIFT: ${rel} differs from the engine (source, verdict or explanation). Re-run --search ${entry.id}.`);
        failures += 1;
      } else {
        console.log(`ok: ${rel} ${stored.status}`);
      }
      continue;
    }
    if (only.length && !only.includes(entry.id)) continue;
    const t = Date.now();
    const r = await searchLevel(entry);
    writeFileSync(abs, fileText(entry, r.search, r.solution));
    console.log(`wrote ${rel}: ${r.search.verdict} after ${r.layoutsScored} layouts in ${Date.now() - t} ms`);
  }
  process.exit(failures ? 1 : 0);
}
