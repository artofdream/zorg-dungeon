---
name: zorg-pr
description: >
  Open a small pull request on zorg-dungeon the way this repo's Godot rounds
  did. Use when branching, writing the PR body, or finishing a Godot or
  engine change. Branch agent/grok/<task>, keep the diff small, show a green
  parity run and the debug APK artifact when those jobs apply, and leave
  merge and production deploy approval to the owner.
---

# Pull requests

One topic, one branch, one PR. The owner merges. The author does not
approve their own PR (`CONTRIBUTING.md`).

## Branch

From current `main`:

```bash
git fetch origin main
git checkout main
git merge --ff-only origin/main
git checkout -b agent/grok/<task-slug>
```

`<task-slug>` is short and lowercase (`agent/grok/godot-lighting`,
`agent/grok/docs-godot-refresh`). The repo pattern for every agent is
`agent/<agent-family>/<task-slug>` (`AGENTS.md`). Do not rebase onto
another agent's open branch.

## Keep it small

Godot rounds #84 through #112 each landed as their own PR. Bugbot
follow-ups were further PRs (#91, #93, #95, #98, #104), not extra commits
pushed onto a merged branch. A docs refresh stays docs. A light change
stays in `apps/godot/levels/visual-lights.json` (see
`.cursor/skills/godot-cosmetic-lights/SKILL.md`).

## Godot or engine changes

When the diff touches `apps/godot/**`, `packages/engine/**`, or
`.github/workflows/godot.yml`, the `godot` workflow runs. Before you call
the PR ready:

1. Run `.cursor/skills/godot-headless-verify/SKILL.md`. Parity must exit 0.
   Write the script's count in the PR body (`parity: N/N cases match the TS engine`). Rounds #84, #91, #97, and #98 did this.
2. Wait until the `godot` workflow is green. Its Android export uploads
   the artifact `zorg-godot-android-debug-apk`. Link that run in the PR.
   Hand install, if you do it, follows
   `.cursor/skills/debug-apk-reinstall/SKILL.md`.

A docs-only PR does not need a local Godot run unless you changed the
commands the skill tells people to run. Say so, and still leave the
workflow result as the evidence when GitHub starts it.

## PR body

Use `.github/pull_request_template.md`:

- What and why, in plain sentences.
- Requirements touched, or `none`.
- Ledger boxes stay unchecked when no FR/NFR proof changed and no CF-NNN closed.
- Evidence a reviewer can re-run (command, exit code, workflow run). "It builds" is not evidence.

Push the feature branch only:

```bash
git push -u origin agent/grok/<task-slug>
```

Do not push to `main`.

## Merge and deploys

Leave the PR open. Do not merge it. Do not approve GitHub environments.

`deploy-web`, `deploy-godot`, and `deploy-itch` use the `production`
environment and wait for a person. A merge to `main` that touches
`apps/godot/**` queues `deploy-godot` and `deploy-itch`. A merge that
touches `AGENTS.md` or `docs/**` queues `deploy-knowledge`. Write in the
PR that this change does not approve those runs (the wording on #107 and
#113). A green check is not the same as the site serving the new build.
