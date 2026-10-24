#!/usr/bin/env node
// Self-test for check-archify-honesty.mjs: one passing and one failing synthetic IR,
// plus an end-to-end run against a scratch directory. No dependencies.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULTS, checkIR, generatorsOf } from "./check-archify-honesty.mjs";

const cfg = { ...DEFAULTS, phrases: ["Not FEAT_NMI"] };

const good = () => ({
  schema_version: 1,
  diagram_type: "architecture",
  meta: { title: "Good", output: "good.architecture.html" },
  components: [
    { id: "a", type: "backend", label: "Service", sublabel: "Simulated", pos: [0, 0], size: [100, 50] },
    { id: "b", type: "external", label: "Probe", tag: "Verified", pos: [200, 0], size: [100, 50] },
  ],
  connections: [],
  cards: [{ dot: "emerald", title: "Boundary", items: ["Not FEAT_NMI.", "Gap: no hosted instance"] }],
});

const bad = () => {
  const ir = good();
  ir.meta.views = [
    { id: "v1", label: "Honesty", focus: ["a"], note: "Not FEAT_NMI. Not hosted. Probed once." },
  ];
  ir.cards = [{ dot: "emerald", title: "Boundary", items: ["Nothing about status here"] }];
  ir.components[1].tag = "edge";
  return ir;
};

const html = (gen) => `<html><head><meta name="generator" content="${gen}"></head></html>`;

// 1. passing IR: no errors, no warnings
{
  const r = checkIR(good(), cfg, { file: "good.json", html: html("archify 3.2.0") });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
}

// 2. failing IR: meta.views AND each note-only label is reported
{
  const r = checkIR(bad(), cfg, { file: "bad.json", html: html("archify 3.2.0") });
  assert.ok(r.errors.some((e) => e.includes("meta.views exists")), "meta.views must fail");
  for (const term of ["Not FEAT_NMI", "Not hosted", "Probed"]) {
    assert.ok(r.errors.some((e) => e.includes(`"${term}"`)), `${term} living only in a view note must fail`);
  }
}

// 3. wording that is also in the cards does not trigger rule 2 (only rule 1 fires)
{
  const ir = bad();
  ir.cards = [{ dot: "emerald", title: "Boundary", items: ["Not FEAT_NMI. Not hosted. Probed once."] }];
  const r = checkIR(ir, cfg, { file: "moved.json" });
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes("meta.views exists"));
}

// 4. matching is on word boundaries ("Gaps" is not "Gap"; "Unknown" != "unknownish")
{
  const ir = good();
  ir.meta.views = [{ id: "v", label: "x", focus: ["a"], note: "Gap" }];
  ir.cards = [{ dot: "emerald", title: "t", items: ["Gaps remain"] }];
  const r = checkIR(ir, cfg, { file: "wb.json" });
  assert.ok(r.errors.some((e) => e.includes('"Gap"')));
}

// 5. generator warning is non-failing; timeline is exempt
{
  const r = checkIR(good(), cfg, { file: "g.json", html: html("archify 3.1.0") });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(generatorsOf(html("archify 3.2.0")), ["archify 3.2.0"]);
  // a wrapper page that embeds the real page entity-escaped (iframe srcdoc)
  const wrapped = `<iframe srcdoc="&lt;meta name=&quot;generator&quot; content=&quot;archify 3.2.0&quot;&gt;"></iframe>`;
  assert.deepEqual(generatorsOf(wrapped), ["archify 3.2.0"]);
  assert.deepEqual(checkIR(good(), cfg, { file: "w.json", html: wrapped }).warnings, []);
  const t = good();
  t.diagram_type = "timeline";
  assert.deepEqual(checkIR(t, cfg, { file: "t.json", html: "<html></html>" }).warnings, []);
}

// 6. end to end: the CLI exits 0 on a good tree, 1 on a bad one, and warns without failing
{
  const script = fileURLToPath(new URL("./check-archify-honesty.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "archify-honesty-"));
  try {
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "good.architecture.json"), JSON.stringify(good()));
    writeFileSync(join(dir, "docs", "good.architecture.html"), html("archify 3.2.0"));
    const ok = spawnSync(process.execPath, [script, "--root", dir], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);

    const b = bad();
    b.meta.output = "bad.architecture.html";
    writeFileSync(join(dir, "docs", "bad.architecture.json"), JSON.stringify(b));
    writeFileSync(join(dir, "docs", "bad.architecture.html"), html("archify 2.17.0-dev.1"));
    const ko = spawnSync(process.execPath, [script, "--root", dir], { encoding: "utf8" });
    assert.equal(ko.status, 1, ko.stdout + ko.stderr);
    assert.match(ko.stderr, /meta\.views exists/);
    assert.match(ko.stderr, /generator is "archify 2\.17\.0-dev\.1"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("✓ check-archify-honesty self-test: passing and failing synthetic IR behave as expected");
