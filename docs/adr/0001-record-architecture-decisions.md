# ADR-0001: Record architecture decisions as ADRs

- Status: Accepted
- Date: 2026-09-09

## Context

`GAME_SPEC.md` captures *what* the game is (rules, FR/NFR). It doesn't
capture *why* we built it a particular way, and that reasoning otherwise
lives only in chat history or a contributor's head — which the AEA framework
explicitly excludes as shared memory ("Chat is not shared memory";
architecture.artof.link/comparison.html).

## Decision

Every non-trivial technical decision (stack choice, engine/UI split,
data format, a reversal of an earlier decision) gets a short ADR in
`docs/adr/`, numbered sequentially, following `TEMPLATE.md`. ADRs are never
renumbered or deleted (same ID-freeze discipline as FR/NFR IDs).

## Consequences

Anyone — human or AI agent — picking this repo up cold reads `AGENTS.md`,
then `GAME_SPEC.md`, then skims `docs/adr/` to understand not just the rules
but the reasoning already spent, instead of re-litigating settled questions.
