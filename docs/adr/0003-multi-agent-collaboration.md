# ADR-0003: Multi-agent collaboration across OpenAI, Claude, Grok, AGY, Copilot, Kimi, and DeepSeek

- Status: Accepted
- Date: 2026-09-10

## Context

Development on this repository involves multiple autonomous AI agents and coding assistants across distinct providers and frameworks — including Anthropic Claude, OpenAI/Codex, xAI Grok, Google Antigravity / Gemini (AGY), GitHub Copilot, Moonshot Kimi, and DeepSeek.

Without strict architectural constraints:
1. Each tool introduces proprietary configuration formats or instructions that drift out of sync.
2. Agents assume ephemeral chat history represents shared knowledge, leading to forgotten context between different agent sessions.
3. Concurrent agent sessions can rebase or overwrite each other's in-flight work or make simultaneous uncoordinated edits to single-source ledgers (`docs/STATUS_LEDGER.md`, `docs/FINDINGS.md`).
4. Cross-platform checkout differences (e.g., Windows CRLF vs. Linux/Mac LF in CI containers) cause diff noise across agents.

## Decision

1. **Single Source of Truth (`AGENTS.md`):** All agent guidelines reside exclusively in `AGENTS.md`. Tool-specific entrypoints (`CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `OPENAI.md`, `GROK.md`, `KIMI.md`, `DEEPSEEK.md`, `.github/copilot-instructions.md`, `.cursorrules`) are strict, minimal pointers that redirect directly to `AGENTS.md`. No tool-specific instructions may diverge.
2. **Shared Memory Discipline:** Chat history is not shared memory. The default branch, PR branches, and committed docs (`GAME_SPEC.md`, `docs/STATUS_LEDGER.md`, `docs/FINDINGS.md`, `docs/journal/`) are the sole shared memory between agents.
3. **Isolated Workspaces & Branch Convention:** Agents work on separate topic branches named `agent/<agent-family>/<task-slug>` or `copilot/<task-slug>`. Agents must never rebase over another in-flight branch.
4. **Peer Review & Verification:** A producer agent does not self-approve or merge its own changes. Pull requests must pass automated CI checks (`pnpm test`) and governance checks (`pnpm governance`) before review and merge by another agent or human.
5. **Cross-Platform Line Ending Normalization:** Enforce `eol=lf` via `.gitattributes` so agents operating across heterogeneous environments (Windows, Linux, macOS) produce uniform diffs.

## Consequences

- Any supported agent immediately discovers `AGENTS.md` and operates under identical constraints without prompt drift.
- Multi-agent collaboration is asynchronous, safe from race conditions, and fully auditable through git history and daily dev journal entries.
- Automated CI and governance gates guarantee that every agent adheres to requirements-trace and honesty validation regardless of model architecture.
