# Eval 2026-11-01 (mock-faults)

Pipeline run blind on 10 golden providers. Golden = hand-researched graphs in data/graph.

| Metric | Score |
|---|---|
| Completed | 8/10 |
| Scope-tier accuracy | 3% |
| Capability coverage | 3% |
| Gate recall (exact kind / family) | 25% / 25% |
| Wait-range overlap (log-scale IoU) | 40% |
| Citation validity (quotes found in source, before re-check) | 45% |
| Facts downgraded / corrected by verifier | 8 / 0 |
| Injected fake quotes caught | 8/8 |
| Median latency | 3s |
| Tokens (total) | 53275 |

| App | Tier acc | Gates | Wait (gold vs run) | Citations | Latency | Tokens | Trace |
|---|---|---|---|---|---|---|---|
| GitHub | 0% | 0% | Same day vs Same day | 50% | 7s | 8720 | /trace/mvxurr5rglmht |
| Notion | 0% | 100% | Same day vs Same day | 67% | 3s | 8289 | /trace/mvxurwhc76q8j |
| Slack | 33% | 0% | Same day vs Same day | 50% | 2s | 6729 | /trace/mvxurysgod7uf |
| HubSpot | 0% | 100% | 2w–7w vs Same day | 67% | 4s | 9082 | /trace/mvxus0bf6c6ja |
| Microsoft Outlook | 0% | 50% | 1d–10d vs Same day | 75% | 10s | 9202 | /trace/mvxus3c9lpdt6 |
| Gmail | 0% | 0% |  vs – | – | 2s | 151 | /trace/mvxusatgdhaky |
| Salesforce | 0% | 0% | Same day vs Same day | 0% | 5s | 4122 | /trace/mvxusc6k58wqw |
| Instagram | 0% | 0% | 7d–5w vs Same day | 0% | 3s | 2280 | /trace/mvxusfpcvkpgv |
| LinkedIn | 0% | 0% | ≤2d vs Same day | 50% | 2s | 4544 | /trace/mvxushxw8zaqr |
| X (Twitter) API | 0% | 0% |  vs – | – | 1s | 156 | /trace/mvxusjlcbohuy |
