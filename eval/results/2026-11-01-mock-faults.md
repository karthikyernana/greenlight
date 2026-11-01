# Eval 2026-11-01 (mock-faults)

Pipeline run blind on 10 golden providers. Golden = hand-researched graphs in data/graph.

| Metric | Score |
|---|---|
| Completed | 7/10 |
| Scope-tier accuracy | 0% |
| Capability coverage | 0% |
| Gate recall (exact kind / family) | 10% / 10% |
| Wait-range overlap (log-scale IoU) | 40% |
| Citation validity (quotes found in source, before re-check) | 12% |
| Facts downgraded / corrected by verifier | 10 / 0 |
| Injected fake quotes caught | 7/7 |
| Median latency | 5s |
| Tokens (total) | 28687 |

| App | Tier acc | Gates | Wait (gold vs run) | Citations | Latency | Tokens | Trace |
|---|---|---|---|---|---|---|---|
| GitHub | 0% | 0% | Same day vs Same day | 0% | 5s | 3738 | /trace/mvxthh3a8f82v |
| Notion | 0% | 100% | Same day vs Same day | 50% | 2s | 6051 | /trace/mvxthh3al4gg7 |
| Slack | 0% | 0% | Same day vs Same day | 0% | 3s | 2108 | /trace/mvxthh3acpope |
| HubSpot | 0% | 0% | 2w–7w vs Same day | 0% | 5s | 4218 | /trace/mvxthiee4xjni |
| Microsoft Outlook | 0% | 0% |  vs – | – | 14s | 157 | /trace/mvxthjgdyyutt |
| Gmail | 0% | 0% |  vs – | – | 6s | 151 | /trace/mvxthl71xg71n |
| Salesforce | 0% | 0% | Same day vs Same day | 0% | 5s | 4122 | /trace/mvxthm086a6eg |
| Instagram | 0% | 0% | 7d–5w vs Same day | 0% | 3s | 2278 | /trace/mvxthppq2txk5 |
| LinkedIn | 0% | 0% | ≤2d vs Same day | 33% | 2s | 5708 | /trace/mvxthptm753de |
| X (Twitter) API | 0% | 0% |  vs – | – | 1s | 156 | /trace/mvxthrhszritd |
