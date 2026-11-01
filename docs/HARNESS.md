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

Heuristic mock model, live web retrieval (plain fetch; Jina answers 401 from the sandbox), one fabricated quote per run.

| Metric | Score |
|---|---|
| Completed | 7/10 (Gmail, X, Outlook: no readable docs fetched from the sandbox) |
| **Injected fake quotes caught** | **7/7** |
| Citation validity | 17% |
| Gate recall (exact / family) | 10% / 10% |
| Wait-range overlap | 40% |
| Median latency | 3 s |

The mock is a floor, not a target: it exists to prove the Verifier catches fabricated quotes without a model key.

### Retrieval before/after Firecrawl (mock model, so only retrieval changes)

The real-model "after" run could not be done: on 2026-11-01 ~18:40 IST the JoinGonka gateway started answering **402 Insufficient balance** for every model (both the sandbox key and the deployment's key), so the comparison uses the mock model, which reads passages the same way for both runs.

| | Without Firecrawl | With Firecrawl, `--concurrency 3` | With Firecrawl, `--concurrency 1` (`eval/results/2026-11-01-mock-faults-firecrawl.*`) |
|---|---|---|---|
| Completed | 7/10 | 9/10 | 8/10 |
| Citation validity (quote-match) | 17% | 47% | 45% |
| Gate recall (exact / family) | 10% / 10% | 32% / 35% | 25% / 25% |
| Fake quotes caught | 7/7 | 9/9 | 8/8 |
| Median latency | 3 s | 4 s | 3 s |

Caveat: Karthik's Firecrawl plan rate-limits requests per minute. Mock runs take seconds per app, so after 2–4 apps Firecrawl answered 429 and the rest fell back to plain fetch (in the second run only GitHub and Notion were scraped by Firecrawl). A 429 now stops Firecrawl for the rest of that run. Real-model runs take minutes per app and use ≤ 6 scrapes + 1–2 searches, so they stay under the limit. ≈ 110 Firecrawl credits were used for all local testing.

## v4 re-run (2026-11-01 evening): measured effect vs the earlier baseline

Real harness, in-process in the Hark sandbox (`NODE_USE_ENV_PROXY=1`), `--budget 60000 --concurrency 1 --tag groq-firecrawl`. Result: `eval/results/2026-11-01-live-groq-firecrawl.{md,json}`. Baseline: `eval/results/2026-11-01-live.*` (JoinGonka gateway models, plain fetch retrieval).

| Metric | Baseline (JoinGonka, fetch) | v4 run (Groq `openai/gpt-oss-120b` + Firecrawl) | Change |
|---|---|---|---|
| Completed | 7/10 | **10/10** | +30 pts |
| Scope-tier accuracy | 11% | 17% | +6 pts |
| Gate recall (exact) | 25% | **65%** | +40 pts |
| Wait-range overlap | 30% | 50% | +20 pts |
| Quote-match (before re-check) | 58% | **74%** | +16 pts |
| Median latency | 237 s | **56 s** | −76% |
| Tokens (10 apps) | 165,486 | 171,887 | +4% |

What each feature contributed, as far as it can be separated:

| Feature | Measured effect | How measured |
|---|---|---|
| Firecrawl retrieval (alone) | quote-match 17% → 47% (+30 pts), gate recall 10% → 32% (+22 pts), completed 7 → 9 | Mock model, so only retrieval changes (v3 table above) |
| Model order → Groq (`gpt-oss-120b`, with `gpt-oss-20b` / `qwen3.8-27b` as fallbacks and 429 reset waits) + Firecrawl, together | the v4 row above: +30 pts completed, −76% median latency | Real run. Not split further: isolating Groq-without-Firecrawl needs another ~170k Groq tokens, skipped to keep usage modest |
| JoinGonka (`LLM_*`) | **not measured** | No `LLM_*` credentials were bound in this sandbox session (the gateway also answered 402 earlier today) |
| Jev typed decisions | **not measured** | `TYPESAFE_API_KEY` not available in the sandbox; mocked tests only |
| Generate-once cache | Xero: cold investigation 57 s → cached 0.07 s (−99.9%), zero model calls | Local production build, same server, second request for `xero.com` |

Caveats: 10 apps is a small sample; tier accuracy stays low because the model labels capabilities differently from the golden graphs (the scorer matches by scope string or label overlap). X still scores 0 (its docs are JS-rendered and its gates are pricing, not review). Groq's free tier rate-limits tokens per minute, so runs use `--concurrency 1`.

### Production: cold vs cached (Xero, https://oauth-greenlight-v2.vercel.app, 2026-11-01)

| Request | Latency | Model calls | Served from |
|---|---|---|---|
| Cold: first `POST /api/generate {"q":"Xero"}` (trace `mvxxse3mwkx62`, started ~20:09 IST) | **280.6 s** | full pipeline (5 lanes) | live investigation → stored as Draft in Vercel Blob |
| Cached, before redeploy (1st / 2nd request, 20:36 IST) | **1.19 s / 0.29 s** | 0 | Blob store (`cached` event, `source: "store"`; only `cached → graph → published`, no `stage` events) |
| Cached, after redeploy of 6820f73 (1st / 2nd request, 20:38 IST) | **0.82 s / 0.42 s** | 0 | Blob store, same `storedAt` (8:14 PM IST): the guide survived the deploy |
| `GET /guide/xero` after redeploy | 0.59 s | 0 | Blob store |

Production cold → cached: 280.6 s → 0.29–1.19 s (−99.6% or better). The first request on a fresh instance pays a cold start plus one Blob read (~0.8–1.2 s); warm requests are 0.3–0.4 s. Measured with `curl -w time_total` from the Hark sandbox (India), so network RTT to Vercel is included.

## Re-run

```bash
npm run eval -- --mock --faults --concurrency 3          # no key needed; verifier fault test
LLM_BASE_URL=… LLM_API_KEY=… LLM_MODEL="MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731" \
  npm run eval -- --budget 60000 --concurrency 3         # real model, in-process
EVAL_BASE_URL=https://oauth-greenlight-v2.vercel.app npm run eval -- --apps slack,hubspot   # against a deployment
npm run eval -- --apps gmail,slack                       # subset
FIRECRAWL_API_KEY=… npm run eval -- --mock --faults --tag firecrawl   # retrieval comparison; result file gets the tag
```

In the Hark sandbox, local runs need `NODE_USE_ENV_PROXY=1` so Node's fetch uses the egress proxy. Results go to `eval/results/<date>-<mode>.{json,md}`; every trace to `public/traces/<id>.json`, viewable at `/trace/<id>`.

## Honest limits

- **Small golden set.** 10 providers, hand-researched; one person's reading of the docs is the ground truth. Matching capabilities by label overlap is fuzzy.
- **Scores are low.** The blind pipeline is far from the curated graphs: it under-finds gates and tiers and tends to say "Same day" where the truth is weeks. This is why curated guides stay the default and generated guides are labelled as such, with Uncertain facts shown.
- **Latency.** Median ≈ 4 minutes on the free gateway, close to Vercel's 300 s function limit; 3/10 runs hit per-call timeouts. Model throughput varies widely (MiniMax ≈ 120 tok/s, DeepSeek ≈ 2.4 tok/s measured the same day).
- **Retrieval from a datacenter IP is weak without Firecrawl.** HTML search engines return junk or challenges; some doc sites (Gmail, X, Outlook) were not readable from the sandbox at all. Firecrawl roughly triples quote-match on the mock run (above); production has no Firecrawl key, and anonymous Jina timed out from Vercel.
- **Run-to-run variance.** One run per app; numbers move between runs because models, hedging winners and fetched pages change.
- **Citation validity is a floor on honesty, not accuracy.** A quote that exists verbatim can still be misapplied to the claim.
