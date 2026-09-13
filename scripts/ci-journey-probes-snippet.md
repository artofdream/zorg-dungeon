# CI snippet for journey probes (#46)

Append these steps to `.github/workflows/ci.yml` under the `build-test` job
(after `pnpm test`). Requires a push token with the GitHub `workflow` scope
(OAuth Apps without that scope cannot update workflow files).

```yaml
      # Persona-journey browser probes (#46) — Simulated evidence only.
      - name: Install Playwright Chromium
        run: pnpm --filter @zorg/web exec playwright install --with-deps chromium
      - name: Journey probes
        run: pnpm --filter @zorg/web exec playwright test
        env:
          CI: true
```

Local: `pnpm probe:journeys` (builds web, then Playwright).

Simulated evidence only — not Live & Probed.
