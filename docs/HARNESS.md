# Harness

`scripts/eval.ts` runs the investigation pipeline **blind** on the golden set (the 10 providers whose graphs were researched by hand in `data/graph/`, `origin: "curated"`) and scores what it produces against those graphs. The pipeline never sees the golden graph; it starts from the app name, exactly like a user typing an unknown app.

## Metrics

| Metric | How it is computed |
|---|---|
| Completed | Runs that produced a valid `ProviderGraph`. A failed run scores 0 on every other metric and is included in the averages. |
| Scope-tier accuracy | For each golden capability, the best-matching predicted capability (shared scope string, or label token overlap ≥ 0.34); correct if its review tier matches. Averaged over golden capabilities. |
| Capability coverage | Share of golden capabilities that found any match. |
| Gate recall | Share of golden gate kinds (app_review, security_assessment, …) present in the prediction. "Family" groups near-synonyms (app_review ≈ brand_verification ≈ marketplace_listing). |
| Wait-range overlap | The rules engine plans both graphs with the default need; IoU of the two wait ranges on a log(1+days) scale. Both under a day counts as 1. |
| Citation validity | Of the facts the specialists cited, share whose quote was found verbatim in the fetched page (`lib/quote.ts`), measured **before** any re-check. |
| Downgraded / corrected | Facts the Verifier turned Uncertain, and facts a re-check corrected. |
| Injected fake quotes caught | `--faults` only: the mock model plants one fabricated quote per run; caught = a `correction` event with reason "quote not found in source". |
| Latency, tokens | Wall time per run and prompt+completion tokens across all model calls. |

## Latest scores (2026-11-01)

### Real model run (`eval/results/2026-11-01-live.{md,json}`)

In-process, JoinGonka gateway (OpenAI-compatible) with MiniMax-M2.7, DeepSeek-V4-Flash and GLM-5.3-Flash (the endpoint's other models are hedges/fallbacks), `--budget 60000 --concurrency 3`. Wall time ≈ 13 min.

| Metric | All 10 | The 7 that completed |
|---|---|---|
| Completed | 7/10 | – |
| Scope-tier accuracy | 11% | 15% |
| Capability coverage | 23% | 33% |
| Gate recall (exact / family) | 25% / 25% | 36% |
| Wait-range overlap | 30% | 43% |
| Citation validity (before re-check) | 58% | |
| Facts downgraded / corrected | 23 / 0 | |
| Median latency | 237 s (range 78–290 s) | |
| Tokens | 165,486 total | |

Notion, Gmail and X failed: every model timed out on a specialist call (150 s per call). Slack was the best run (gates 100%, citations 100%); Salesforce and Instagram completed but cited nothing that matched.

### Mock model with faults (`eval/results/2026-11-01-mock-faults.{md,json}`)

Heuristic mock model, live web retrieval, one fabricated quote per run.

| Metric | Score |
|---|---|
| Completed | 7/10 (Gmail, X, Outlook: no readable docs fetched from the sandbox) |
| **Injected fake quotes caught** | **7/7** |
| Citation validity | 12% |
| Gate recall | 10% |
| Wait-range overlap | 40% |
| Median latency | 5 s |

The mock is a floor, not a target: it exists to prove the Verifier catches fabricated quotes without a model key.

## Re-run

```bash
npm run eval -- --mock --faults --concurrency 3          # no key needed; verifier fault test
LLM_BASE_URL=… LLM_API_KEY=… LLM_MODEL="MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731" \
  npm run eval -- --budget 60000 --concurrency 3         # real model, in-process
EVAL_BASE_URL=https://oauth-greenlight-v2.vercel.app npm run eval -- --apps slack,hubspot   # against a deployment
npm run eval -- --apps gmail,slack                       # subset
```

In the Hark sandbox, local runs need `NODE_USE_ENV_PROXY=1` so Node's fetch uses the egress proxy. Results go to `eval/results/<date>-<mode>.{json,md}`; every trace to `public/traces/<id>.json`, viewable at `/trace/<id>`.

## Honest limits

- **Small golden set.** 10 providers, hand-researched; one person's reading of the docs is the ground truth. Matching capabilities by label overlap is fuzzy.
- **Scores are low.** The blind pipeline is far from the curated graphs: it under-finds gates and tiers and tends to say "Same day" where the truth is weeks. This is why curated guides stay the default and generated guides are labelled as such, with Uncertain facts shown.
- **Latency.** Median ≈ 4 minutes on the free gateway, close to Vercel's 300 s function limit; 3/10 runs hit per-call timeouts. Model throughput varies widely (MiniMax ≈ 120 tok/s, DeepSeek ≈ 2.4 tok/s measured the same day).
- **Retrieval from a datacenter IP is weak.** HTML search engines return junk or challenges; some doc sites (Gmail, X, Outlook) were not readable from the sandbox at all.
- **Run-to-run variance.** One run per app; numbers move between runs because models, hedging winners and fetched pages change.
- **Citation validity is a floor on honesty, not accuracy.** A quote that exists verbatim can still be misapplied to the claim.
