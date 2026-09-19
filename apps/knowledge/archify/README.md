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

```bash
node /path/to/archify/bin/archify.mjs deliver architecture \
  apps/knowledge/archify/zorg-knowledge-workflow.architecture.json \
  apps/knowledge/archify/zorg-knowledge-workflow.architecture.html \
  --quality showcase
```

`apps/knowledge/scripts/build.mjs` copies this directory to `dist/archify/` so GitHub Pages serves `/archify/`.
