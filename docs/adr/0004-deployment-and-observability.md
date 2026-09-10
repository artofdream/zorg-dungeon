# ADR-0004: Deployment architecture, knowledge site, and observability

- Status: Accepted
- Date: 2026-09-10

## Context

Following the dual-site architecture of the Adaptive Experience Architecture framework (`architecture.artof.link` + `aea.artof.link`) and Café Fausse (`knowledge.cafe.artof.link` + `cafe.artof.link`), Zorg's Dungeon Maker requires two distinct public endpoints:
1. **Implementation & Playback view (`zorg.artof.link`)**: Interactive 2D Maker grid canvas and extermination simulation runner.
2. **Knowledge Base (`knowledge.zorg.artof.link`)**: Canonical reference for game rules, requirements traceability graph, honesty ledger, coherence findings, and dev journals.
3. **Observability (`https://zorg.artof.link/grafana/`)**: Public monitoring of host and container metrics, matching `https://aea.artof.link/grafana/`.

Evaluation between AWS ECS Fargate + ALB vs. AWS Lightsail + Docker Compose revealed:
- ECS Fargate + ALB costs \$45–\$75+/month baseline (ALB alone is \$18–\$22/mo) and requires complex multi-task coordination and EFS volume CSI drivers for Prometheus TSDB storage.
- AWS Lightsail (`small_3_0`, \$12/mo flat) provides 2 vCPUs, 2 GB RAM, 60 GB SSD, 3 TB egress, and static IP. It hosts a self-contained Docker Compose stack with zero cloud sprawl and matches the existing operational model of `cafe.artof.link`.

## Decision

1. **Implementation Compute:** Deploy `zorg.artof.link` on AWS Lightsail instance `zorg-dungeon-prod` (Ubuntu 24.04, `small_3_0`) in `us-east-1a` with static IP `54.152.172.19`.
2. **Implementation Stack:** Use Docker Compose running:
   - `web`: Multi-stage build of `@zorg/engine` and `@zorg/web` served by Nginx.
   - `caddy`: Reverse proxy providing automated Let's Encrypt TLS and reverse proxying `/grafana/*` to Grafana and `/*` to the web app.
   - `prometheus`: Scrapes node and web metrics with local TSDB persistence.
   - `grafana`: Served at `/grafana/` with anonymous viewer access enabled, pre-provisioned Prometheus datasource, and system dashboards.
   - `node-exporter`: Exposes host CPU, RAM, disk, and network metrics.
3. **Knowledge Site:** Host `knowledge.zorg.artof.link` on GitHub Pages (`artofdream.github.io.`) built via GitHub Actions (`.github/workflows/knowledge.yml`) from markdown files in `docs/` and `GAME_SPEC.md`.
4. **DNS Management:** Manage records in Route 53 zone `Z1178AFMV41RWP` (`artof.link.`):
   - `zorg.artof.link.` $\rightarrow$ `A` `54.152.172.19` (TTL: 60)
   - `knowledge.zorg.artof.link.` $\rightarrow$ `CNAME` `artofdream.github.io.` (TTL: 300)

## Consequences

- Hosting costs are minimized to \$12/mo flat with zero load balancer idle fees.
- The knowledge site is decoupled from compute and globally distributed via GitHub CDN at zero cost.
- Full observability is publicly visible under `/grafana/` without credentials required for inspection.
- The production stack can be run verbatim on local development machines using Docker Desktop.
