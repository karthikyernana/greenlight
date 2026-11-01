# Eval 2026-11-01 (mock-faults)

Pipeline run blind on 10 golden providers. Golden = hand-researched graphs in data/graph.

| Metric | Score |
|---|---|
| Completed | 7/10 |
| Scope-tier accuracy | 0% |
| Capability coverage | 0% |
| Gate recall (exact kind / family) | 10% / 10% |
| Wait-range overlap (log-scale IoU) | 40% |
| Citation validity (quotes found in source, before re-check) | 17% |
| Facts downgraded / corrected by verifier | 7 / 0 |
| Injected fake quotes caught | 7/7 |
| Median latency | 3s |
| Tokens (total) | 27045 |

| App | Tier acc | Gates | Wait (gold vs run) | Citations | Latency | Tokens | Trace |
|---|---|---|---|---|---|---|---|
| GitHub | 0% | 0% | Same day vs Same day | 0% | 7s | 3316 | /trace/mvxu43i31va1g |
| Notion | 0% | 100% | Same day vs Same day | 67% | 2s | 5628 | /trace/mvxu43i46ixsg |
| Slack | 0% | 0% | Same day vs Same day | 0% | 3s | 3024 | /trace/mvxu43i4cts33 |
| HubSpot | 0% | 0% | 2w–7w vs Same day | 0% | 5s | 4218 | /trace/mvxu459nxsfds |
| Microsoft Outlook | 0% | 0% |  vs – | – | 14s | 157 | /trace/mvxu45nqrhf7c |
| Gmail | 0% | 0% |  vs – | – | 2s | 151 | /trace/mvxu48n07ymgz |
| Salesforce | 0% | 0% | Same day vs Same day | 0% | 4s | 3751 | /trace/mvxu48wi5ihba |
| Instagram | 0% | 0% | 7d–5w vs Same day | 0% | 3s | 2280 | /trace/mvxu4akk3wbwx |
| LinkedIn | 0% | 0% | ≤2d vs Same day | 50% | 2s | 4364 | /trace/mvxu4btbhdxdz |
| X (Twitter) API | 0% | 0% |  vs – | – | 1s | 156 | /trace/mvxu4cjkfn06k |
