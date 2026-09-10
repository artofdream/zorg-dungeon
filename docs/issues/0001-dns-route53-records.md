# Issue #1: Open Route 53 DNS Records for Zorg Implementation and Knowledge Map

- **Status**: Completed / Applied
- **Date**: 2026-09-10
- **AWS Account**: 737290977112
- **Hosted Zone**: `/hostedzone/Z1178AFMV41RWP` (`artof.link.`)
- **Author**: Antigravity (AGY) / CTS

---

## 1. Summary

In accordance with the dual-site architecture established for AEA framework sites (`aea.artof.link` + `architecture.artof.link`) and Café Fausse (`cafe.artof.link` + `knowledge.cafe.artof.link`), two domain records are established under the `artof.link` zone for Zorg's Dungeon Maker:

1. **Implementation & Playback View**: `zorg.artof.link`
2. **Knowledge Base & Traceability Graph**: `knowledge.zorg.artof.link`

---

## 2. Records Provisioned

| Record Name | Type | Routing / Target | TTL | Purpose |
|---|---|---|---|---|
| `zorg.artof.link.` | `A` | `54.152.172.19` | 60s | Points to the AWS Lightsail production cluster (`zorg-dungeon-prod`, `small_3_0` in `us-east-1a`), hosting the Maker SPA, Caddy auto-TLS proxy, and Prometheus/Grafana observability stack at `/grafana/`. |
| `knowledge.zorg.artof.link.` | `CNAME` | `artofdream.github.io.` | 300s | Points to GitHub Pages hosting the static knowledge site generated from `docs/` and `GAME_SPEC.md`. |

---

## 3. Route 53 Change Batch Execution

Submitted and applied to Route 53 via Change ID: `/change/C0623464W4RXX8MUUEVD`.

```json
{
  "Comment": "DNS records for Zorg implementation (Lightsail) and knowledge site (GitHub Pages)",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "zorg.artof.link.",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [
          { "Value": "54.152.172.19" }
        ]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "knowledge.zorg.artof.link.",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          { "Value": "artofdream.github.io." }
        ]
      }
    }
  ]
}
```

---

## 4. Verification

- `aws route53 list-resource-record-sets` confirms both records active in zone `/hostedzone/Z1178AFMV41RWP`.
- DNS resolution propagation in progress.
