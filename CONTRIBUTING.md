# Contributing

Read [`AGENTS.md`](./AGENTS.md) first — it applies to human and AI
contributors alike.

## Workflow

1. Branch off `main`. One topic per branch.
2. If you're fixing a discrepancy (bug, spec/code mismatch, a wrong ledger
   claim), add or update its `CF-NNN` entry in `docs/FINDINGS.md` first.
3. If your change implements or changes behavior for an FR-xx/NFR-xx,
   reference it in code (see `packages/engine/src/geometry.ts`) and update
   its row in `docs/STATUS_LEDGER.md` — honestly (`Simulated` for a passing
   automated test, not `Live & Probed` unless it's actually been run for
   real).
4. Open a PR using the template. CI runs two required workflows:
   - **`ci`** — install, build, typecheck, test across all workspaces.
   - **`governance`** — requirements-trace, honesty-ledger, findings-ledger,
     docs-graph (see `AGENTS.md` §4 and `scripts/*.mjs`).
5. A PR needs a green `ci` + `governance` and one review before merge. The
   author does not self-approve.

## One-time repo setup (do this in GitHub's Settings, not in code)

These can't be expressed as committed files — they're GitHub repository
settings. Set them once:

- **Settings → Branches → Branch protection rule** on `main`:
  - Require a pull request before merging (require 1 approval).
  - Require status checks to pass before merging — select the `ci` and
    `governance` workflow jobs once they've run at least once (GitHub only
    lists checks that have executed on the repo before).
  - Require branches to be up to date before merging.
  - Do not allow bypassing the above, including for admins, if you want the
    "producer doesn't merge its own change" rule to actually hold.
- **Settings → General → Pull Requests**: disable "Allow auto-merge" unless
  you want it, and consider requiring linear history.

## Running the gates locally

```
pnpm install
pnpm build && pnpm test
pnpm governance
```

`pnpm governance` runs the exact four scripts CI runs, so a red CI run
should never be a surprise.
