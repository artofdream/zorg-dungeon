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
- **Settings → Secrets and variables → Actions** (production web CD, `.github/workflows/deploy-web.yml`): required `LIGHTSAIL_SSH_KEY` (private key PEM); optional `LIGHTSAIL_HOST` (Lightsail static IP or hostname; falls back to `zorg.artof.link`) and `LIGHTSAIL_USER` (default `ubuntu`); required `GRAFANA_ADMIN_PASSWORD` (Grafana admin password — the deploy writes it to a root-only env file on the host, `/etc/zorg/grafana.env`, and resets the admin password in Grafana's DB; rotate by updating the secret and re-running `deploy-web`); required `GRAFANA_SECRET_KEY` (Grafana `secret_key`, a random 64-hex value, e.g. `openssl rand -hex 32 | tr -d '\n' | gh secret set GRAFANA_SECRET_KEY`; delivered the same way into `/etc/zorg/grafana.env`. On a change the deploy first verifies Grafana stores no secrets encrypted with the old key (`grafana_admin.py stored-secrets`) and refuses to switch otherwise, then rotates the envelope data keys and re-encrypts). Per-project credentials via the sponsor's 3DX Lab secrets method will replace these repo secrets later. Do not invent or commit credentials.

## Grafana admin access (SSH tunnel only)

Public `https://zorg.artof.link/grafana/` is **anonymous and read-only**.
Caddy answers `/grafana/login`, the admin UI and admin APIs with 404, and
refuses any request that carries credentials (basic auth, bearer token, or a
Grafana session cookie) with 403. Grafana's basic auth is disabled. Admins sign
in over an SSH tunnel to Grafana's host-local port, which is published on
`127.0.0.1:3000` only:

```
ssh -N -L 3000:127.0.0.1:3000 <LIGHTSAIL_USER>@<LIGHTSAIL_HOST>
# then open http://localhost:3000/grafana/login and sign in as admin
```

- Use the existing deploy access; do not open port 3000 in the Lightsail
  firewall or publish it on `0.0.0.0`.
- The admin password is the `GRAFANA_ADMIN_PASSWORD` repo secret (re-applied on
  every deploy). Sign out when done; sessions are revocable in Grafana.
- `deploy-web` checks this path on every deploy (`deploy/scripts/grafana_admin.py
  login-check` on the host) and probes the public surface
  (`deploy/scripts/probe-public-grafana.sh`).

## Caddy admin API and metrics

- Caddy's admin API listens on `localhost:2019` **inside the Caddy container**
  only (`docker compose exec caddy caddy reload ...` still works); other
  containers cannot reach it. `deploy-web` checks this from the Grafana
  container on every deploy.
- Prometheus scrapes Caddy's HTTP metrics from a dedicated listener,
  `caddy:9180/metrics`, which is not published on the host.

## Grafana upgrades and DB backups

- The Grafana image is pinned to an exact patched release in
  `deploy/compose.prod.yaml` (never `latest`). Check
  https://github.com/grafana/grafana/releases and bump deliberately.
- Every `deploy-web` run first backs up `grafana.db` on the host with SQLite's
  online backup API (`deploy/scripts/backup-grafana-db.py`) to
  `/var/backups/zorg-grafana/` (root, 0600): `grafana.db.<UTC ts>` (newest 5
  kept) and, when the image tag changes, `grafana.db.<UTC ts>.pre-<old>-to-<new>`
  (newest 3 kept).
- Major upgrades migrate the DB, so a downgrade needs the pre-upgrade copy:
  revert the image pin, then on the host
  `sudo docker compose -f deploy/compose.prod.yaml stop grafana`, copy the
  `.pre-*` backup over `grafana.db` in the `deploy_grafana_data` volume
  (keep the current file's owner and mode, check with `stat` first), and re-run
  `deploy-web`.

## Production logs (short retention: they contain client IPs)

- **Caddy access log** (whole site, `/grafana` included): JSON at
  `/var/log/caddy/access.log` in the `caddy_logs` volume. Caddy rolls it at
  20 MiB and keeps at most 14 rolled files, none older than 14 days
  (`roll_keep_for 336h`). Cookie and Authorization headers are redacted.
- **Grafana log** (server log + one line per request, including tunnel/admin
  traffic that bypasses Caddy): `/var/log/grafana/grafana.log` in the
  `grafana_logs` volume, rotated daily, 14 days kept.
- Both volumes survive container recreation and redeploys. `deploy-web` prints
  counts only (files, lines, oldest/newest timestamp) and checks that both logs
  grow after a probe request (`deploy/scripts/log-stats.py`).
- Read them on the host, e.g.
  `sudo docker compose -f deploy/compose.prod.yaml exec caddy tail -n 50 /var/log/caddy/access.log`.
  Do not paste log lines (IPs) into issues, PRs or public CI logs; do not
  extend retention beyond 14 days without a reason recorded in ADR-0004.

## Running the gates locally

```
pnpm install
pnpm build && pnpm test
pnpm governance
```

`pnpm governance` runs the exact four scripts CI runs, so a red CI run
should never be a surprise.
