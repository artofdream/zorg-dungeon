# Agent instructions

This file is the single source of truth for any AI collaborator on this
repo — Claude, Codex, or anything else. Tool-specific files (`CLAUDE.md`,
etc.) exist only so that tool finds its entry point; they must never
diverge from this one. If you're an agent and a tool-specific file
contradicts this file, this file wins.

The rules below are this repo's adaptation of the **Adaptive Experience
Architecture (AEA)** framework (architecture.artof.link) to a solo/small-team
game project. Citations point at the pages the rule is drawn from.

## 1. Knowledge First

> "Read committed shared memory before doing new work. Shared memory is
> [the repo's default branch]. Chat is not shared memory."
> — architecture.artof.link/comparison.html

Before changing anything, read in this order: this file, `GAME_SPEC.md`
(the rules + FR/NFR), `docs/adr/` (why things are the way they are),
`docs/STATUS_LEDGER.md` (what's actually proven vs. claimed). A prior chat
session's context does not exist for the next agent or the next person —
if it mattered, it's in one of these files, or it didn't happen.

## 2. Honesty

> "A status word is a claim. Probe it, or write Unknown."
> — architecture.artof.link/glossary.html ("Probe")

Never mark an FR/NFR, a PR description, or a commit message as "done",
"implemented", "working", or similar without evidence a reviewer (human or
CI) can check. Use `docs/STATUS_LEDGER.md`'s five-word vocabulary
(`Unknown`, `Planned`, `Simulated`, `Probed (date)`, `Live & Probed`) — see
that file for the exact rules. Closing an issue is not proof.

## Keep Learning and Apply

> When the build teaches something, write it into the harness (skill,
> sensor, guide, matrix row, or ADR) before the next loop — so the next
> agent inherits it instead of rediscovering the failure.
> — AEA [Keep Learning and Apply](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434)
> (GitLab work item #434; landing in open
> [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513))

This complements **Honesty** (§2) and **Knowledge First** (§1). It is
**not** Antifragility (§3). Antifragility is the second-miss → sensor
gate. This principle is the first-loop write: if the build taught
something, commit a skill, guide, [[SKILL_MATRIX]] row, or ADR before
the next agent starts — a chat note is not apply.

AEA cites (same GitLab project):
- Skill matrix (merged [!512](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/512), closes [#433](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/433)): [`research/random-thoughts/2026-09-12-session-memory-log-aea-grok-skill-matrix.md`](https://gitlab.com/artof-group/adaptive-experience-architecture/-/blob/main/research/random-thoughts/2026-09-12-session-memory-log-aea-grok-skill-matrix.md)
- Principle (open [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513), Closes [#434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434))

Status in zorg-dungeon: **Documented / Planned**. Knowledge Pages
content for this principle is **Unknown** until AEA probes it. Naming
it in docs is not `Live & Probed`. Do not treat !513 as merged.

Cross-project fit (Café Fausse App and Knowledge received; AEA agent
waiting) lives in [[SKILL_MATRIX]]. Those rows are assessments, not a
live probe and not a ledger promotion.

## 3. Antifragility

> "The same miss twice is a missing sensor or gate, not a missing
> paragraph." — architecture.artof.link/schema.html

Log every discrepancy you find or cause as a CF-NNN entry in
`docs/FINDINGS.md`. If something breaks the same way twice, the fix is not
allowed to be "be more careful" — it has to change `.github/workflows/**`
or add a test. See that file for the enforced rule.

## 4. Traceability (the "graph")

Every functional/non-functional requirement in `GAME_SPEC.md` has a stable
ID (FR-xx / NFR-xx, never renumbered — "ID Freeze",
architecture.artof.link/glossary.html). Code and tests that implement one
should say so in a comment (see `packages/engine/src/geometry.ts` for the
pattern). `scripts/check-requirements-trace.mjs` fails CI on orphaned IDs
(referenced in code but not defined) and on ledger entries claiming proof
with no matching test. Docs cross-reference each other with `[[wikilinks]]`
(checked by `scripts/check-docs-graph.mjs`) — this repo's docs are its
second brain; keep them linked, not siloed.

## 5. Collaboration ground rules (agent-neutral & multi-agent)

This repository is designed for concurrent, asynchronous collaboration across
diverse AI assistants and human contributors, including:
- **Anthropic Claude** (entrypoint: `CLAUDE.md`)
- **Google Antigravity / Gemini** (entrypoint: `GEMINI.md`)
- **OpenAI / Codex / ChatGPT** (entrypoints: `CODEX.md`, `OPENAI.md`)
- **xAI Grok** (entrypoint: `GROK.md`)
- **GitHub Copilot** (entrypoint: `.github/copilot-instructions.md`)
- **Moonshot Kimi** (entrypoint: `KIMI.md`)
- **DeepSeek** (entrypoint: `DEEPSEEK.md`)
- **Cursor** (entrypoint: `.cursorrules`)

All tool-specific entrypoints are minimal pointers that redirect to this file.
To ensure clean collaboration between different agents:

- **One codebase, any agent:** don't assume a specific AI tool's quirks in
  committed files — no tool-specific formatting, no instructions only one
  tool would understand.
- **No shared chat memory:** An agent has zero visibility into another agent's
  prior chat sessions. The committed default branch and files (`GAME_SPEC.md`,
  `docs/STATUS_LEDGER.md`, `docs/FINDINGS.md`, `docs/journal/`, `docs/adr/`)
  are the sole shared memory. If it matters, write it to docs or code;
  otherwise, it does not exist for the next agent.
- **Branch isolation:** Each task, finding, or requirement gets its own branch
  off `main` using the pattern `agent/<agent-family>/<task-slug>` (e.g.
  `agent/claude/phase-0-loader`, `agent/copilot/fr-10-geometry`). Never rebase
  over another agent's active in-flight branch.
- **A producer does not merge its own change:** Every PR requires passing `ci`
  and `governance` checks plus a peer review (human or peer agent) before
  merging — see `CONTRIBUTING.md`.
- **Atomic ledger updates:** When updating `docs/STATUS_LEDGER.md` or
  `docs/FINDINGS.md`, touch only the rows related to your task to minimize
  rebase friction with peer branches.
- **Dev journal handoffs:** Use `docs/journal/YYYY-MM-DD.md` to summarize
  shipped changes, active investigations, and pending decisions for the next
  agent.
- **Cross-platform hygiene:** Line endings are normalized to LF via
  `.gitattributes` across Windows, macOS, and Linux/container environments.
See `docs/adr/0003-multi-agent-collaboration.md` for the full rationale.

## 6. Repo shape

- `packages/engine` — pure TypeScript simulation/rules engine. No DOM, no
  UI framework. This is what `NFR-1` (determinism) and `NFR-10` (AI
  testability) are actually about — keep it that way.
- `apps/web` — the Maker (construction-phase editor) and the extermination
  playback view. Currently a 2D canvas app; see `docs/adr/0002-*.md` for
  the planned path to 3D and to Android/tablet via Capacitor.
- `docs/adr` — why we built it this way. `docs/journal` — what happened,
  day by day (the "second brain"). `docs/STATUS_LEDGER.md` and
  `docs/FINDINGS.md` — the honesty/antifragility ledgers above.
  `docs/PLAYER_GUIDE.md` — plain-English + diagram companion to
  `GAME_SPEC.md` (published as `guide.html`). Formal IDs stay in the spec;
  if they disagree, the spec wins. `docs/LEARN.md` — kid-facing rules
  (published as `learn.html`). `docs/PLAYER_JOURNEYS.md` — persona UX
  validation cases (published as `journeys.html`). Not a rules rewrite.
  `docs/SKILL_MATRIX.md` — which agent skills apply, who must load them,
  why they were chosen after the 2026-09 build, and how each row
  **Keep Learning and Apply**
  ([#434](https://gitlab.com/artof-group/adaptive-experience-architecture/-/work_items/434) /
  [!513](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/513);
  AEA matrix [!512](https://gitlab.com/artof-group/adaptive-experience-architecture/-/merge_requests/512))
  (published as `skills.html`). See [[SKILL_MATRIX]]. Compose with
  persona-journey / kid-rules pages; do not rewrite that copy here.
- `scripts/*.mjs` — the governance checks, runnable locally
  (`pnpm governance`) exactly as CI runs them.

## 7. Local commands

```
pnpm install
pnpm build            # all workspaces
pnpm test             # all workspaces
pnpm governance       # requirements trace + honesty ledger + findings + docs graph
```
