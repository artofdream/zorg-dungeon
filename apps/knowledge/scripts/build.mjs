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

    // Code blocks
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code class="language-${codeLang}">${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        inCode = false;
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
  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);

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
    { id: "spec", label: "Rules & Spec", href: "spec.html" },
    { id: "honesty", label: "Honesty Ledger", href: "honesty.html" },
    { id: "findings", label: "Findings", href: "findings.html" },
    { id: "adr", label: "ADRs", href: "adr.html" },
    { id: "journal", label: "Dev Journal", href: "journal.html" },
    { id: "architecture", label: "Architecture", href: "architecture.html" },
    { id: "observability", label: "Observability", href: "observability.html" },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Zorg's Dungeon Knowledge</title>
  <link rel="stylesheet" href="style.css">
</head>
<body class="is-wide page-${current}">
  <header>
    <div class="brand">
      <div class="brand-badge">⚔️</div>
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
<h1>Zorg's Dungeon Maker — Knowledge Base</h1>
<p class="lead">The single source of truth for game rules, deterministic simulation logic, requirements traceability, architecture decisions, and antifragility findings.</p>

<div class="grid-cards">
  <div class="card">
    <h3>📜 Rules & Specification</h3>
    <p>Complete translated and restructured rules from the original design manual: room mechanics, hero AI priority layers, single-use spells, and win/loss conditions.</p>
    <a href="spec.html">Explore Game Spec →</a>
  </div>
  <div class="card">
    <h3>⚖️ Honesty Ledger</h3>
    <p>56 requirements (FR-1–46, NFR-1–10) strictly tracked against automated tests with zero unproven claims. Current verified proof: <strong>FR-10</strong> (Manhattan distance).</p>
    <a href="honesty.html">View Honesty Ledger →</a>
  </div>
  <div class="card">
    <h3>🛡️ Antifragility & Findings</h3>
    <p>Discrepancies and miss tracking (CF-NNN). Enforces mandatory CI sensors and test additions upon recurrence.</p>
    <a href="findings.html">Read Findings Ledger →</a>
  </div>
  <div class="card">
    <h3>🏛️ Architecture & ADRs</h3>
    <p>Permanent decisions: pure TypeScript engine, 2D-to-3D renderer split, multi-agent collaboration framework, and AWS deployment.</p>
    <a href="adr.html">Read ADRs →</a>
  </div>
  <div class="card">
    <h3>🤖 Multi-Agent Collaboration</h3>
    <p>Collaboration model across Anthropic Claude, OpenAI/Codex, xAI Grok, Google Antigravity (AGY), GitHub Copilot, Moonshot Kimi, and DeepSeek.</p>
    <a href="architecture.html">View Agent Architecture →</a>
  </div>
  <div class="card">
    <h3>📊 Observability</h3>
    <p>Live metrics and monitoring stack based on Prometheus, Grafana, and Node Exporter on <a href="https://zorg.artof.link/grafana/">zorg.artof.link/grafana/</a>.</p>
    <a href="observability.html">Observability Architecture →</a>
  </div>
</div>
`;
writeFileSync(join(distDir, "index.html"), pageShell({ title: "Home", current: "home", content: homeContent }));

// 2. Spec Page
const specMd = readDoc("GAME_SPEC.md");
writeFileSync(join(distDir, "spec.html"), pageShell({ title: "Rules & Specification", current: "spec", content: markdownToHtml(specMd) }));

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

// 7. Architecture Page
const agentsMd = readDoc("AGENTS.md");
writeFileSync(join(distDir, "architecture.html"), pageShell({ title: "Architecture & Agent Framework", current: "architecture", content: markdownToHtml(agentsMd) }));

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

// 9. CNAME for GitHub Pages
writeFileSync(join(distDir, "CNAME"), "knowledge.zorg.artof.link\n");

// 10. Copy stylesheet
copyFileSync(join(__dirname, "../style.css"), join(distDir, "style.css"));

console.log("✓ Knowledge website built successfully in apps/knowledge/dist/");
