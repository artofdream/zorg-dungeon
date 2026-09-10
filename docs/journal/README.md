# Dev journal

One markdown file per day of real work (`YYYY-MM-DD.md`), written from the
commit history — this is the repo's "second brain": what shipped, why,
and what was decided that isn't captured anywhere more formal.

Wikilinks (`[[FR-10]]`, `[[0002-typescript-monorepo-2d-to-3d]]`) are
encouraged and checked for dead links by `scripts/check-docs-graph.mjs`
(part of the `governance` workflow) — link a journal entry to the ADR or
requirement it touches rather than re-explaining it.

Entries can be generated/updated from git history with the `git-day-blog`
skill once there's history worth summarizing.
