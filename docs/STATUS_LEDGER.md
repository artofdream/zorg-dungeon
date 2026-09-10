# Honesty ledger

> "A status word is a claim. Probe it, or write Unknown." — adapted from the
> AEA framework's Honesty Gate (architecture.artof.link/comparison.html).

Every FR-xx / NFR-xx defined in `GAME_SPEC.md` gets exactly one row here.
`scripts/check-honesty-ledger.mjs` (run by `.github/workflows/governance.yml`
on every PR) fails the build if:

- a row is missing or an ID doesn't exist in `GAME_SPEC.md` (stale/orphaned row),
- the `Status` value isn't one of the five allowed words below, or
- `Status` is anything but `Unknown`/`Planned` and `Evidence` is empty.

`scripts/check-requirements-trace.mjs` additionally fails the build if a row
says `Simulated`, `Probed (date)`, or `Live & Probed` but no test file under
`packages/**` or `apps/**` actually references that ID — closing a ticket, or
writing a table row, is not proof.

## Allowed statuses

| Status | Meaning |
|---|---|
| `Unknown` | Not verified. Default for everything not yet built. |
| `Planned` | Scheduled (e.g. tied to a build-plan phase) but not started. |
| `Simulated` | Proven by an automated, deterministic test — no live/physical run yet. |
| `Probed (YYYY-MM-DD)` | Verified against a real build/device/server on that date. |
| `Live & Probed` | Verified in production and still actively monitored. |

## Ledger

| ID | Status | Evidence |
|---|---|---|
| FR-1 | Simulated | packages/engine/src/loader.test.ts |
| FR-2 | Simulated | packages/engine/src/loader.test.ts |
| FR-3 | Simulated | packages/engine/src/loader.test.ts |
| FR-4 | Unknown | |
| FR-5 | Unknown | |
| FR-6 | Unknown | |
| FR-7 | Unknown | |
| FR-8 | Unknown | |
| FR-9 | Unknown | |
| FR-10 | Simulated | packages/engine/src/geometry.test.ts |
| FR-11 | Unknown | |
| FR-12 | Unknown | |
| FR-13 | Unknown | |
| FR-14 | Unknown | |
| FR-15 | Unknown | |
| FR-16 | Unknown | |
| FR-17 | Unknown | |
| FR-18 | Unknown | |
| FR-19 | Unknown | |
| FR-20 | Unknown | |
| FR-21 | Unknown | |
| FR-22 | Unknown | |
| FR-23 | Unknown | |
| FR-24 | Unknown | |
| FR-25 | Unknown | |
| FR-26 | Unknown | |
| FR-27 | Unknown | |
| FR-28 | Unknown | |
| FR-29 | Unknown | |
| FR-30 | Unknown | |
| FR-31 | Unknown | |
| FR-32 | Unknown | |
| FR-33 | Unknown | |
| FR-34 | Unknown | |
| FR-35 | Unknown | |
| FR-36 | Unknown | |
| FR-37 | Unknown | |
| FR-38 | Unknown | |
| FR-39 | Unknown | |
| FR-40 | Unknown | |
| FR-41 | Unknown | |
| FR-42 | Unknown | |
| FR-43 | Unknown | |
| FR-44 | Unknown | |
| FR-45 | Unknown | |
| FR-46 | Unknown | |
| NFR-1 | Unknown | |
| NFR-2 | Simulated | packages/engine/src/base-classic-corpus.test.ts |
| NFR-3 | Unknown | |
| NFR-4 | Unknown | |
| NFR-5 | Unknown | |
| NFR-6 | Unknown | |
| NFR-7 | Unknown | |
| NFR-8 | Unknown | |
| NFR-9 | Simulated | packages/engine/src/base-classic-corpus.test.ts |
| NFR-10 | Unknown | |
