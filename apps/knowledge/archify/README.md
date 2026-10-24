# Archify diagrams (Zorg Knowledge)

Documentation aids generated with [artofdream/archify](https://github.com/artofdream/archify). **Documented aid — not Live.** Same-origin host after Pages deploy: `https://knowledge.zorg.artof.link/archify/`.

Cite `GAME_SPEC.md` / companion docs. Do not invent room `C`, Gunner duration, or FR-4 gating (author-deferred).

## Artifacts

| File | Kind | Topic |
|------|------|--------|
| [`zorg-knowledge-workflow.architecture.json`](./zorg-knowledge-workflow.architecture.json) + [`.html`](./zorg-knowledge-workflow.architecture.html) | architecture | Knowledge Pages pipeline + same-origin `/archify/` |
| [`index.html`](./index.html) | index | Thin listing of diagrams |

### Honesty

- Status wording: **Documented** aid (readable map). **Not Live.**
- Intended URLs after Pages deploy:
  - `https://knowledge.zorg.artof.link/archify/`
  - `https://knowledge.zorg.artof.link/archify/zorg-knowledge-workflow.architecture.html`
  - `https://knowledge.zorg.artof.link/archify/zorg-knowledge-workflow.architecture.json`
- Do not claim Live / production status from this folder alone. A this-session HTTPS GET after merge closes the Pages probe.

### Regenerate

Generated with Archify **v3.2.0** (`archify/package.json` version 3.2.0). Render in a scratch directory, validate, then copy **only** the `.json` and `.html` back into this folder:

```bash
export ARCHIFY_UPDATE_CHECK_DISABLED=1
node /path/to/archify/archify/bin/archify.mjs validate architecture zorg-knowledge-workflow.architecture.json
node /path/to/archify/archify/bin/archify.mjs deliver architecture \
  zorg-knowledge-workflow.architecture.json \
  zorg-knowledge-workflow.architecture.html \
  --quality showcase
node /path/to/archify/archify/bin/archify.mjs browser-check zorg-knowledge-workflow.architecture.html --summary --out-dir ./receipts
```

- Do **not** commit `*.delivery.json` or `*.browser-check.json` receipts: they hold local absolute paths and `build.mjs` would publish them under `/archify/` (the root `.gitignore` ignores them).
- Archify 3.x has **no guided views / "Play story" / press-`P` chapters**: `meta.views` is retired and ignored. Former chapter notes live in the diagram's **cards**; use the viewer's **Route** and **Lens** controls for paths and roles.
- Boundary rule (3.x): a boundary's `wraps` list must match the components its frame encloses. Keep non-members outside the frame (see the Restaurant region below the pipeline).

`apps/knowledge/scripts/build.mjs` copies this directory to `dist/archify/` so GitHub Pages serves `/archify/`.
