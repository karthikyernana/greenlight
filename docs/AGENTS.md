# Agents (pipeline stages)

A fixed pipeline, not a conversation: `lib/pipeline/run.ts`. Each stage streams `stage`, `fact` and `correction` events to the investigation view.

| Stage | Inputs | Tools | Output | Failure modes → handling |
|---|---|---|---|---|
| **Scout** | app name or URL | web search, model pointer to docs, fetch, Composio probe | domain, doc corpus, Composio fact (Tested) | search returns junk → model pointer + conventional hosts; no readable docs → stop with a clear message, probes still shown |
| **Scope classifier** | top passages | model (JSON) | capabilities → scopes → tier, each with claim/quote/url | invalid JSON → one repair round; model slow → hedged to the next model |
| **Gate finder** | same passages | model (JSON) | gates (kind, tiers that trigger them, skip conditions, needsBusiness) and steps (owner, effort, wait, dependsOn) | same as above |
| **Prober** | domain | OIDC/RFC 8414 discovery, authorize endpoint with fake client | Tested facts (endpoints, PKCE, DCR) | no discovery doc → recorded as a miss, never fatal |
| **Verifier** | all facts + fetched pages | `checkQuote` (code), model critic, targeted search + fetch | statuses, corrections | see below |

Scope classifier, Gate finder and Prober run in parallel.

**Verifier, in order.**
1. Code: every non-Tested fact's quote must appear in the fetched text of its URL (normalised; punctuation-insensitive; or ≥90% of 8-word windows for stitched quotes). Fail → status Uncertain, quote dropped, `correction` event ("downgraded: quote not found in source").
2. One model critic pass over the claims for contradictions (tier vs gate, implausible waits). Flagged facts join the weak set.
3. Re-check: up to 2 rounds, 4 facts per round. Targeted search + the fact's own URL, ranked passages, model returns confirmed / corrected / unsupported with a new quote, which goes through the same code check. Corrections can change a capability's tier or a step's wait.

Weak facts are downgraded, not deleted: the structure stays in the graph so the runway errs long, and the evidence panel shows why.

**Limits per run.** Token budget (default 120k, `LLM_TOKEN_BUDGET`), per-call timeout 150s, deadline ~270s (critic and re-check are skipped when time runs short), retries on 429/5xx, model hedging and fallback (`lib/llm.ts`), 20 runs per IP per hour.

**Trace.** Every run records stages, tool calls, model calls (model, ms, tokens, repaired), and verifier counts. Shown in the guide's "Run trace" fold and at `/trace/<id>`.
