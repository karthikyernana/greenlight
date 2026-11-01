# Eval 2026-11-01 (live)

Pipeline run blind on 10 golden providers. Golden = hand-researched graphs in data/graph.

| Metric | Score |
|---|---|
| Completed | 10/10 |
| Scope-tier accuracy | 17% |
| Capability coverage | 32% |
| Gate recall (exact kind / family) | 65% / 65% |
| Wait-range overlap (log-scale IoU) | 50% |
| Citation validity (quotes found in source, before re-check) | 74% |
| Facts downgraded / corrected by verifier | 23 / 3 |
| Median latency | 56s |
| Tokens (total) | 171887 |

| App | Tier acc | Gates | Wait (gold vs run) | Citations | Latency | Tokens | Trace |
|---|---|---|---|---|---|---|---|
| GitHub | 25% | 100% | Same day vs Same day | 100% | 56s | 17598 | /trace/mvxx5y7hafj9q |
| Notion | 0% | 100% | Same day vs Same day | 100% | 44s | 19309 | /trace/mvxx75eescxt3 |
| Slack | 33% | 100% | Same day vs Same day | 100% | 50s | 17378 | /trace/mvxx83fq50m3x |
| HubSpot | 0% | 100% | 2w–7w vs Same day | 85% | 30s | 13232 | /trace/mvxx9684amu8c |
| Microsoft Outlook | 0% | 50% | 1d–10d vs Same day | 73% | 54s | 19004 | /trace/mvxx9t5x69jbx |
| Gmail | 33% | 100% | 5w–2mo vs 5d–2w | 64% | 96s | 17376 | /trace/mvxxaymvpy6kh |
| Salesforce | 50% | 0% | Same day vs Same day | 40% | 69s | 16335 | /trace/mvxxd13d9nge8 |
| Instagram | 0% | 100% | 7d–5w vs Same day | 80% | 46s | 14836 | /trace/mvxxeih5lx9qk |
| LinkedIn | 25% | 0% | ≤2d vs Same day | 100% | 56s | 17825 | /trace/mvxxfhn1t8v3t |
| X (Twitter) API | 0% | 0% | Same day vs Same day | 0% | 70s | 18994 | /trace/mvxxgov8hvp0q |
