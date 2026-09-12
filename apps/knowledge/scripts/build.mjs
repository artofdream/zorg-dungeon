import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");
const distDir = join(__dirname, "../dist");

mkdirSync(distDir, { recursive: true });

function readDoc(relPath) {
  const full = join(repoRoot, relPath);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownToHtml(md) {
  const lines = md.split("\n");
  const html = [];
  let inCode = false;
  let codeLang = "";
  let codeBuffer = [];
  let inTable = false;
  let tableHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks (```mermaid renders client-side; other fences stay <pre><code>)
    if (line.startsWith("```")) {
      if (inCode) {
        if (codeLang === "mermaid") {
          html.push(`<div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(codeBuffer.join("\n"))}</pre></div>`);
        } else {
          html.push(`<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        }
        inCode = false;
        codeLang = "";
        codeBuffer = [];
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Tables
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        // Table separator
        tableHeader = false;
        continue;
      }
      if (!inTable) {
        html.push('<div class="table-container"><table>');
        html.push("<thead><tr>" + cells.map(c => `<th>${inlineFormat(c)}</th>`).join("") + "</tr></thead><tbody>");
        inTable = true;
        tableHeader = false;
      } else {
        html.push("<tr>" + cells.map(c => `<td>${inlineFormat(c)}</td>`).join("") + "</tr>");
      }
      continue;
    } else if (inTable) {
      html.push("</tbody></table></div>");
      inTable = false;
    }

    // Alerts
    if (line.startsWith("> [!")) {
      const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
      if (match) {
        const type = match[1].toLowerCase();
        let alertContent = [];
        while (i + 1 < lines.length && lines[i + 1].startsWith(">")) {
          i++;
          alertContent.push(lines[i].replace(/^>\s?/, ""));
        }
        html.push(`<div class="alert alert-${type}"><div class="alert-title">${match[1]}</div><p>${inlineFormat(alertContent.join(" "))}</p></div>`);
        continue;
      }
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      html.push(`<blockquote><p>${inlineFormat(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      html.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("#### ")) {
      html.push(`<h4>${inlineFormat(line.slice(5))}</h4>`);
      continue;
    }

    // Lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      html.push(`<li>${inlineFormat(line.slice(2))}</li>`);
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      continue;
    }

    // Paragraphs
    html.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inTable) html.push("</tbody></table></div>");
  if (inCode) {
    if (codeLang === "mermaid") {
      html.push(`<div class="mermaid-wrap"><pre class="mermaid">${escapeHtml(codeBuffer.join("\n"))}</pre></div>`);
    } else {
      html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
    }
  }

  return html.join("\n");
}

function inlineFormat(text) {
  let out = text;
  // Code spans
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Wikilinks [[target]]
  out = out.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const cleanTarget = target.trim().toLowerCase();
    const cleanLabel = label ? label.trim() : target.trim();
    if (/^(fr|nfr)-\d+$/.test(cleanTarget)) {
      return `<a href="honesty.html#${cleanTarget}" class="wikilink requirement-badge">${cleanLabel}</a>`;
    }
    const pageAlias = {
      game_spec: "spec.html",
      status_ledger: "honesty.html",
      findings: "findings.html",
      agents: "architecture.html",
      player_guide: "guide.html",
    };
    if (pageAlias[cleanTarget]) {
      return `<a href="${pageAlias[cleanTarget]}" class="wikilink">${cleanLabel}</a>`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanTarget)) {
      return `<a href="journal.html" class="wikilink">${cleanLabel}</a>`;
    }
    if (/^\d{4}-/.test(cleanTarget)) {
      return `<a href="adr.html" class="wikilink">${cleanLabel}</a>`;
    }
    return `<a href="${cleanTarget}.html" class="wikilink">${cleanLabel}</a>`;
  });
  // Markdown links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return `<a href="${url}">${label}</a>`;
  });
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Status badges
  out = out.replace(/\b(Simulated)\b/g, '<span class="badge badge-simulated">Simulated</span>');
  out = out.replace(/\b(Live & Probed)\b/g, '<span class="badge badge-live">Live & Probed</span>');
  out = out.replace(/\b(Unknown)\b/g, '<span class="badge badge-unknown">Unknown</span>');
  out = out.replace(/\b(Planned)\b/g, '<span class="badge badge-planned">Planned</span>');

  return out;
}

function pageShell({ title, current, content }) {
  const navItems = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "guide", label: "Guide", href: "guide.html" },
    { id: "spec", label: "Rules & Spec", href: "spec.html" },
    { id: "honesty", label: "Honesty Ledger", href: "honesty.html" },
    { id: "findings", label: "Findings", href: "findings.html" },
    { id: "adr", label: "ADRs", href: "adr.html" },
    { id: "journal", label: "Dev Journal", href: "journal.html" },
    { id: "architecture", label: "Architecture", href: "architecture.html" },
    { id: "observability", label: "Observability", href: "observability.html" },
    { id: "aea", label: "AEA Harness", href: "aea.html" },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Zorg's Dungeon Knowledge</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <link rel="stylesheet" href="style.css">
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "strict",
    });
    const nodes = [...document.querySelectorAll("pre.mermaid")];
    for (let i = 0; i < nodes.length; i++) {
      const source = nodes[i].textContent ?? "";
      const { svg } = await mermaid.render("zorg-mermaid-" + i, source);
      nodes[i].innerHTML = svg;
    }
  </script>
</head>
<body class="is-wide page-${current}">
  <header>
    <div class="brand">
      <img class="brand-badge" src="/favicon.svg" width="36" height="36" alt="Zorg Knowledge">
      <div>
        <p class="eyebrow">Zorg's Dungeon Maker</p>
        <p class="sub">Knowledge Base & Traceability Graph</p>
      </div>
    </div>
    <nav aria-label="Knowledge navigation">
      ${navItems.map(item => `
        <a href="${item.href}" class="${item.id === current ? "is-current" : ""}">
          <span>${item.label}</span>
        </a>
      `).join("")}
    </nav>
    <div class="external-links">
      <a href="https://zorg.artof.link" target="_blank" class="btn-external">Play Maker ↗</a>
      <a href="https://zorg.artof.link/grafana/" target="_blank" class="btn-external">Grafana ↗</a>
      <a href="https://github.com/artofdream/zorg-dungeon" target="_blank" class="btn-external">GitHub ↗</a>
    </div>
  </header>
  <main id="content">
    ${content}
  </main>
  <footer>
    <p>Zorg's Dungeon Maker Knowledge Map · Built on the <a href="https://architecture.artof.link">Adaptive Experience Architecture (AEA)</a> framework.</p>
    <p>All functional requirements (FR-xx) and non-functional requirements (NFR-xx) verified via honest, deterministic testing.</p>
  </footer>
</body>
</html>`;
}

// 1. Home Page
const homeContent = `
<h1>Zorg's Dungeon Maker</h1>
<p class="lead">You place the rooms a level gives you. Scripted heroes then try to reach Zorg. This site is the plain-English guide, the formal rules, and the honesty ledger — not a claim that every rule is proven live.</p>

<div class="grid-cards">
  <div class="card">
    <h3>🧭 Guide</h3>
    <p>How to play: pick Difficulté, place rooms, start the fight. Rooms, heroes, spells, and what is still unavailable — with diagrams. If English disagrees with the spec, the spec wins.</p>
    <a href="guide.html">Open the guide →</a>
  </div>
  <div class="card">
    <h3>▶️ Play Maker</h3>
    <p>Open the campaign on the live Maker. Filter authored levels by Difficulté, place the rooms, then run extermination.</p>
    <a href="https://zorg.artof.link" target="_blank" rel="noreferrer">Play at zorg.artof.link ↗</a>
  </div>
  <div class="card">
    <h3>📜 Spec</h3>
    <p>The formal rulebook: FR-1–46 and NFR-1–10. This is the legal voice. A companion sentence never overrides it.</p>
    <a href="spec.html">Read the game spec →</a>
  </div>
  <div class="card">
    <h3>⚖️ Honesty</h3>
    <p>One row per requirement. Only five status words. Simulated means a test exists — not a live probe. A page is not proof.</p>
    <a href="honesty.html">Open the ledger →</a>
  </div>
  <div class="card">
    <h3>🛡️ Findings</h3>
    <p>Misses between docs and code (CF-NNN). The second time the same miss happens, CI or a test must change.</p>
    <a href="findings.html">Read findings →</a>
  </div>
  <div class="card">
    <h3>🏛️ Decisions</h3>
    <p>Why the engine is UI-free TypeScript, why the Maker is 2D first, and how agents share memory on the default branch.</p>
    <a href="adr.html">Read ADRs →</a>
  </div>
  <div class="card">
    <h3>🏗️ Architecture</h3>
    <p>Monorepo split: engine vs Maker vs this knowledge site. Agent rules live in one file.</p>
    <a href="architecture.html">View architecture →</a>
  </div>
  <div class="card">
    <h3>📊 Observability</h3>
    <p>Host metrics on Prometheus and Grafana. A green dashboard is not a game-rule probe.</p>
    <a href="observability.html">Observability →</a>
  </div>
  <div class="card">
    <h3>⚙️ AEA harness</h3>
    <p>Shared memory, fail-closed honesty, and no self-merge — the same rules this repo uses.</p>
    <a href="aea.html">Explore AEA →</a>
  </div>
</div>
`;
writeFileSync(join(distDir, "index.html"), pageShell({ title: "Home", current: "home", content: homeContent }));

// 1b. Player & builder guide (companion — GAME_SPEC remains the legal voice)
const guideMd = readDoc("docs/PLAYER_GUIDE.md");
if (!guideMd.trim()) {
  throw new Error("knowledge build: missing docs/PLAYER_GUIDE.md");
}
if (/two types have rules encoded/i.test(guideMd)) {
  throw new Error("knowledge build: PLAYER_GUIDE.md still claims only two hero types");
}
if (/not a random generator/i.test(guideMd)) {
  throw new Error("knowledge build: PLAYER_GUIDE.md still denies the Difficulté generator");
}
if (!/generateLevel|practice dungeon/i.test(guideMd)) {
  throw new Error("knowledge build: PLAYER_GUIDE.md must mention the Difficulté generator");
}
for (const id of ["FR-22", "FR-23", "FR-24", "FR-25", "FR-32", "FR-33", "NFR-5"]) {
  if (!guideMd.includes(`[[${id}]]`)) {
    throw new Error(`knowledge build: PLAYER_GUIDE.md must cite [[${id}]] so the companion tracks the engine`);
  }
}
const guideHtml = markdownToHtml(guideMd);
if (!guideHtml.includes('class="mermaid"')) {
  throw new Error("knowledge build: PLAYER_GUIDE.md produced no mermaid diagrams");
}
writeFileSync(join(distDir, "guide.html"), pageShell({ title: "Player & builder guide", current: "guide", content: guideHtml }));

// 2. Spec Page — companion banner only; GAME_SPEC.md body is not rewritten
const specBanner = `
<div class="alert alert-note spec-companion-banner">
  <div class="alert-title">Formal rules</div>
  <p>This page is the legal voice (FR / NFR). For plain English and diagrams, see the <a href="guide.html">Player &amp; builder guide</a>. If they disagree, this spec wins.</p>
</div>
`;
const specMd = readDoc("GAME_SPEC.md");
const specHtml = specBanner + markdownToHtml(specMd);
if (!specHtml.includes("spec-companion-banner") || !specHtml.includes("guide.html")) {
  throw new Error("knowledge build: spec.html must inject the companion banner (do not rewrite GAME_SPEC.md)");
}
writeFileSync(join(distDir, "spec.html"), pageShell({ title: "Rules & Specification", current: "spec", content: specHtml }));

// 3. Honesty Ledger Page
const ledgerMd = readDoc("docs/STATUS_LEDGER.md");
writeFileSync(join(distDir, "honesty.html"), pageShell({ title: "Honesty Ledger", current: "honesty", content: markdownToHtml(ledgerMd) }));

// 4. Findings Page
const findingsMd = readDoc("docs/FINDINGS.md");
writeFileSync(join(distDir, "findings.html"), pageShell({ title: "Findings Ledger", current: "findings", content: markdownToHtml(findingsMd) }));

// 5. ADR Page
const adrDir = join(repoRoot, "docs/adr");
let adrCombined = "# Architecture Decision Records (ADR)\n\n";
for (const file of readdirSync(adrDir).sort()) {
  if (file.endsWith(".md") && file !== "TEMPLATE.md") {
    adrCombined += readDoc(join("docs/adr", file)) + "\n\n---\n\n";
  }
}
writeFileSync(join(distDir, "adr.html"), pageShell({ title: "Architecture Decisions", current: "adr", content: markdownToHtml(adrCombined) }));

// 6. Journal Page
const journalDir = join(repoRoot, "docs/journal");
let journalCombined = "# Development Journal (Second Brain)\n\n";
for (const file of readdirSync(journalDir).sort().reverse()) {
  if (file.endsWith(".md") && file !== "README.md") {
    journalCombined += readDoc(join("docs/journal", file)) + "\n\n---\n\n";
  }
}
writeFileSync(join(distDir, "journal.html"), pageShell({ title: "Dev Journal", current: "journal", content: markdownToHtml(journalCombined) }));

// 7. Architecture Page — visual split first; AGENTS.md body is not rewritten
const architectureOverviewMd = `
# Architecture & Agent Framework

## Knowledge vs Maker

Plain English: the spec is the rulebook. The engine is the referee ([[NFR-1]], [[NFR-10]]). The Maker is the table you play on. This knowledge site is the companion booklet. See [[0002-typescript-monorepo-2d-to-3d]].

\`\`\`mermaid
flowchart TB
  spec["GAME_SPEC.md — formal rules"]
  engine["packages/engine — simulation NFR-1 / NFR-10"]
  maker["apps/web — Maker on zorg.artof.link"]
  knowledge["apps/knowledge — this site"]
  docs["docs/ — guide, ledger, ADRs, journal"]
  spec --> engine
  spec --> knowledge
  docs --> knowledge
  engine --> maker
\`\`\`
`;
const agentsMd = readDoc("AGENTS.md");
const architectureHtml = markdownToHtml(architectureOverviewMd) + markdownToHtml(agentsMd);
if (!architectureHtml.includes('class="mermaid"')) {
  throw new Error("knowledge build: architecture page produced no mermaid diagram");
}
writeFileSync(join(distDir, "architecture.html"), pageShell({ title: "Architecture & Agent Framework", current: "architecture", content: architectureHtml }));

// 8. Observability Page
const obsContent = `
<h1>Observability & Monitoring</h1>
<p class="lead">Built on the same architecture as <a href="https://aea.artof.link/grafana/">aea.artof.link/grafana/</a>, providing public read-only viewer dashboards and live system metrics.</p>

<div class="grid-cards">
  <div class="card">
    <h3>📈 Live Grafana Dashboard</h3>
    <p>Access the live monitoring interface directly under the subpath:</p>
    <a href="https://zorg.artof.link/grafana/" target="_blank" class="btn-external">Open zorg.artof.link/grafana/ ↗</a>
  </div>
  <div class="card">
    <h3>🔍 Metrics Collection</h3>
    <p><strong>Prometheus</strong> polls metrics from Node Exporter (CPU, Memory, Disk, I/O) and reverse proxy traffic stats with local TSDB persistence.</p>
  </div>
</div>

<h2>Architecture Overview</h2>
<pre><code>
                Internet (HTTPS)
                       │
       ┌───────────────┴───────────────┐
       │     Caddy (Auto TLS / Proxy)  │
       └───────┬───────────────┬───────┘
               │               │
      /*       │     /grafana/ │
       ┌───────▼───────┐       ┌───────▼───────┐
       │   Zorg Web    │       │    Grafana    │
       │   (Nginx/SPA) │       │   (Port 3000) │
       └───────────────┘       └───────▲───────┘
                                       │ Scrapes
                               ┌───────┴───────┐
                               │   Prometheus  │
                               └───────▲───────┘
                                       │ Scrapes
                               ┌───────┴───────┐
                               │ Node Exporter │
                               │ (Host Metrics)│
                               └───────────────┘
</code></pre>
`;
writeFileSync(join(distDir, "observability.html"), pageShell({ title: "Observability", current: "observability", content: obsContent }));

// 9. AEA Harness Page
const aeaContent = `
<h1>Adaptive Experience Architecture (AEA)</h1>
<p class="lead">The Plain-English Visual Guide to Harness Engineering applied to Zorg's Dungeon Maker. Canonical Reference: <a href="https://aea.artof.link" target="_blank">aea.artof.link</a>.</p>

<p>Same split as the architecture page: spec and docs are shared memory; <code>packages/engine</code> decides outcomes ([[NFR-1]]); <code>apps/web</code> is the Maker; this site explains.</p>
<div class="mermaid-wrap"><pre class="mermaid">flowchart LR
  spec["GAME_SPEC + docs"]
  engine["packages/engine"]
  maker["apps/web Maker"]
  site["apps/knowledge"]
  spec --> engine
  spec --> site
  engine --> maker
</pre></div>

<div class="alert alert-tip">
  <div class="alert-title">Core Philosophy</div>
  <p>"The engineers who thrive in the AI era are not the ones who write the most code. They are the ones who build the best environments for AI agents and human teams to stay honest."</p>
</div>

<h2>1. The Core Formula in Everyday Terms</h2>
<div class="card" style="margin: 1.5rem 0; border-color: var(--accent);">
  <p style="font-size: 1.25rem; font-weight: 700; color: var(--accent-light); text-align: center; margin: 0.5rem 0;">
    Adaptive Experience = Shared Understanding + Domain Services + Outer Harness
  </p>
</div>

<pre><code>
┌────────────────────────────────────────────────────────────────────────┐
│ 1. THE CUSTOMER / PLAYER INTERACTS                                     │
│    Player lays out dungeon rooms, casts spells, inspects solvability   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. THE AI INTERPRETER & LIVE NOTEPAD (Shared Understanding)            │
│    • Multi-Agent Team (Claude, Gemini, OpenAI, Grok, Copilot, Kimi)    │
│    • Shared Memory: Committed docs, GAME_SPEC.md, Status Ledger        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. THE REAL-WORLD SERVICES (The Source of Truth)                       │
│    • Simulation Engine (@zorg/engine): Pure TS rules, 100% deterministic│
│    • Geometry & Border Validation: Side-adjacency, wall-hatch alignment│
│    • Turn Scheduler & Pathfinding: Fail-closed verification            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. THE OUTER HARNESS (The Factory & Quality Inspectors)                │
│    • Automated Governance Gates: Trace, Ledger, Findings, Docs-Graph   │
│    • Independent Gatekeeper: No self-approval, required peer review    │
└────────────────────────────────────────────────────────────────────────┘
</code></pre>

<h3>The Three Golden Rules</h3>
<ul>
  <li><strong>AI Interprets, Domain Services Decide:</strong> AI agents suggest room placements and spell tactics, but only <code>@zorg/engine</code>'s deterministic rules engine decides path validity, damage, and victory conditions.</li>
  <li><strong>Fail-Closed Availability:</strong> If solvability or layout verification cannot be proven, the engine reports unverified (<code>Unknown</code>) rather than claiming success. It is far better to fail closed than to promise an invalid dungeon.</li>
  <li><strong>No Self-Approval:</strong> The agent or human that writes code is never the one who signs off on pushing it to production. Every PR requires passing <code>ci</code> + <code>governance</code> checks and an independent review.</li>
</ul>

<h2>2. The 5 Concentric Floors (Why AI Apps Break)</h2>
<pre><code>
┌────────────────────────────────────────────────────────────────────────┐
│ 🏢 FLOOR 05: THE AGENT TEAM & GOVERNANCE (Graph Engineering)           │
│    Specialized human/agent roles + Independent Reviewer (AGENTS.md §5) │
│ ┌──────────────────────────────────────────────────────────────────┐   │
│ │ 🔄 FLOOR 04: THE GOAL RUN & RETRIES (Loop Engineering)            │   │
│ │    1 Issue → 1 Branch → 1 Pull Request with clean budgets        │   │
│ │ ┌────────────────────────────────────────────────────────────┐   │   │
│ │ │ ⚙️ FLOOR 03: THE MACHINE & TESTS (Harness Engineering)       │   │   │
│ │ │    Real tools (Vitest, pnpm) + automated quality guards     │   │   │
│ │ │ ┌──────────────────────────────────────────────────────┐   │   │   │
│ │ │ │ 🧠 FLOOR 02: THE MEMORY CURATOR (Context Engineering)  │   │   │   │
│ │ │ │    Filters noise, preserves lessons in 4 clean vaults│   │   │   │
│ │ │ │ ┌────────────────────────────────────────────────┐   │   │   │   │
│ │ │ │ │ 💬 FLOOR 01: THE MESSAGE (Prompt Engineering)   │   │   │   │   │
│ │ │ │ │    Single objective, strict pointers to AGENTS.md│   │   │   │   │
│ │ │ │ └────────────────────────────────────────────────┘   │   │   │   │
│ │ │ └──────────────────────────────────────────────────────┘   │   │   │
│ │ └────────────────────────────────────────────────────────────┘   │   │
│ └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Built On Real Infrastructure
┌────────────────────────────────────────────────────────────────────────┐
│ 🏛️ SOLID FOUNDATION: AWS Lightsail, Route 53, Docker, Prometheus & Grafana│
└────────────────────────────────────────────────────────────────────────┘
</code></pre>

<ul>
  <li><strong>The Dependency Law:</strong> If your multi-agent team keeps failing, don't blame the agents—check your memory filter. Bad input on Floor 2 ruins everything above it.</li>
  <li><strong>The Economic Law:</strong> Swapping the AI model (switching between Claude, Gemini, DeepSeek, or OpenAI) takes 1 afternoon. Rebuilding your 5-floor operational harness takes 3 months. The harness is your real intellectual property.</li>
</ul>

<h2>3. The "Second Brain": 4 Clean Memory Vaults</h2>
<div class="grid-cards">
  <div class="card">
    <h3>📖 1. Procedure Memory (Skills)</h3>
    <p>Step-by-step playbooks for repeatable workflows: build scripts, governance validation gates, and Docker launch commands.</p>
  </div>
  <div class="card">
    <h3>🚫 2. Correction Memory (Constraints)</h3>
    <p>Hard rules learned from past mistakes: <code>docs/FINDINGS.md</code> logs every miss (CF-NNN). Upon recurrence &ge; 2, an automated sensor in CI or tests is mandatory.</p>
  </div>
  <div class="card">
    <h3>🕸️ 3. Relationship Memory (Graph)</h3>
    <p>Bidirectional traceability linking <code>GAME_SPEC.md</code> requirement IDs (FR-xx) to engine code, Vitest suites, and <code>docs/STATUS_LEDGER.md</code> via <code>[[wikilinks]]</code>.</p>
  </div>
  <div class="card">
    <h3>📅 4. Daily Brief (Handoff)</h3>
    <p>A clean 1-page summary of exactly where the team left off: <code>docs/journal/YYYY-MM-DD.md</code> records shipped changes, probes, and pending decisions.</p>
  </div>
</div>

<h2>4. The Six Layers of the Outer Harness in Practice</h2>
<div class="grid-cards">
  <div class="card">
    <h3>1. Guides (The Rulebook)</h3>
    <p><code>AGENTS.md</code> and <code>GAME_SPEC.md</code> loaded before any agent writes code.</p>
  </div>
  <div class="card">
    <h3>2. Sensors (The Smoke Alarms)</h3>
    <p>Automated Vitest suites and 4 governance scripts catching regressions before production.</p>
  </div>
  <div class="card">
    <h3>3. The Loop (The Factory Line)</h3>
    <p>Disciplined workflow: 1 task → <code>agent/&lt;family&gt;/&lt;slug&gt;</code> branch → PR template.</p>
  </div>
  <div class="card">
    <h3>4. Memory (The Vault)</h3>
    <p>Honesty ledger, findings ledger, ADRs, and dev journal preserving institutional knowledge.</p>
  </div>
  <div class="card">
    <h3>5. Permissions (The Keycard)</h3>
    <p>Branch protection on <code>main</code>, IAM scoped credentials, and fail-closed checks.</p>
  </div>
  <div class="card">
    <h3>6. Observability (The Dashboard)</h3>
    <p>Real-time Prometheus + Grafana telemetry proving the entire system is healthy at <a href="https://zorg.artof.link/grafana/">zorg.artof.link/grafana/</a>.</p>
  </div>
</div>
`;
if (!aeaContent.includes('class="mermaid"')) {
  throw new Error("knowledge build: AEA page produced no mermaid diagram");
}
writeFileSync(join(distDir, "aea.html"), pageShell({ title: "AEA Harness", current: "aea", content: aeaContent }));

// 10. CNAME for GitHub Pages
writeFileSync(join(distDir, "CNAME"), "knowledge.zorg.artof.link\n");

// 11. Copy stylesheet and sibling favicons
const knowledgeRoot = join(__dirname, "..");
copyFileSync(join(knowledgeRoot, "style.css"), join(distDir, "style.css"));
for (const asset of ["favicon.svg", "favicon-32x32.png", "apple-touch-icon.png"]) {
  const src = join(knowledgeRoot, asset);
  if (!existsSync(src)) {
    throw new Error(`knowledge build: missing ${asset} at ${src}`);
  }
  copyFileSync(src, join(distDir, asset));
}

console.log("✓ Knowledge website built successfully in apps/knowledge/dist/");
