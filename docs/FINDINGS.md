# Findings ledger (antifragility)

> "The same miss twice is a missing sensor or gate, not a missing paragraph."
> — AEA's antifragility principle (architecture.artof.link/schema.html).

A **Coherence Finding (CF-NNN)** is any discrepancy between what the docs
claim and what the system actually does — a bug, a spec/code mismatch, a
broken promise in `STATUS_LEDGER.md`, anything a reviewer or a user catches.

Discipline: **1 finding → 1 issue → 1 branch**, until resolved. File one here
before opening the GitHub issue (use the `coherence_finding` issue template,
which links back to the CF-NNN ID).

The rule that makes this antifragile rather than just a bug tracker:
**once a finding's `Recurrence` reaches 2, the PR that resolves it must also
add or change something in `.github/workflows/**` or a `*.test.*` file** —
a sensor or a gate, not just a fix. `scripts/check-findings-ledger.mjs`
enforces this on the closing PR's diff.

## Format

```
## CF-NNN: <short title>
- Status: Open | Resolved
- Recurrence: <how many times this exact class of miss has happened>
- Linked: <issue/PR link>
- Sensor added: <path touched to prevent recurrence> (required once Recurrence >= 2)
```

## Ledger

## CF-001: Example — seed the format
- Status: Resolved
- Recurrence: 1
- Linked: (none — this is a seed entry demonstrating the format, not a real finding)
- Sensor added:

## CF-002: Unix placeholder commands in package scripts fail on Windows
- Status: Resolved
- Recurrence: 1
- Linked: (none — resolved in CI/CD stabilization)
- Sensor added:

## CF-003: pnpm/action-setup duplicate version specification in CI workflow
- Status: Resolved
- Recurrence: 1
- Linked: #2
- Sensor added: .github/workflows/ci.yml

## CF-004: GitHub Pages site missing / configure-pages Not Found
- Status: Resolved
- Recurrence: 1
- Linked: #4
- Sensor added: .github/workflows/knowledge.yml

`deploy-knowledge` failed on `main` after PR #2: `actions/configure-pages@v5`
returned Get Pages site failed / Not Found because `GET /repos/.../pages`
404'd — the Pages site had never been created. DNS already pointed
`knowledge.zorg.artof.link` at `artofdream.github.io`.

Resolution: a repo admin enabled Pages via the GitHub API with
`build_type=workflow` (site `https://artofdream.github.io/zorg-dungeon/`,
custom domain set to match the journal). `deploy-knowledge` was re-triggered
on `main` and completed success (Actions run 34530132314). This PR hardens
Setup Pages with `enablement: true` and records the sensor rule: **the repo
Pages site must exist with `build_type=workflow`**. Default `GITHUB_TOKEN`
cannot create a Pages site; `enablement: true` is not a substitute for that
admin enablement.

Do not mark the knowledge site `Live & Probed` from this finding. A green
deploy job is not a production content probe.

## CF-005: Base-classic N11 Dream Trap and N18 Math Bath are not green-corpus targets
- Status: Open
- Recurrence: 1
- Linked: https://github.com/artofdream/zorg-dungeon/pull/5
- Sensor added:

Sponsor resolution S5: Base N11 “Dream Trap” is author-flagged in the source
(`euh y a un problème dans celui-ci à mon grand regret`). Base N18 “Math Bath”
has a malformed heroes line (`Guerrier(choix(1, {1,3,5}), Guerrier(2)` —
unbalanced `choix`). Deluxe 10.7 `Artilleur(_)` is noted for when/if that pack
is imported. Both N11 and N18 live under
`packages/engine/fixtures/base-classic/quarantine/` and are `describe.skip`’d
so they cannot fail the green corpus suite. This is Recurrence 1 — quarantine
+ skip is documentation, not a second-miss gate.

