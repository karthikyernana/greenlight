# Greenlight v3

**ChatGPT writes an answer. Greenlight works one out.**

Say what your agent needs ("triages my users' Gmail and drafts replies"). Greenlight computes your path from today to "real users can connect": how long, why, what an agent can prepare, and the fastest legitimate route. Every number traces to a fact with a source URL, a verbatim quote, a checked date and a status.

Live: https://oauth-greenlight-v2.vercel.app · Branch `v3` · Composio APM (Integrations) take-home.

## How it works
- **Requirement graph** (`data/graph/*.json`): provider → capability → scopes → review tier → gates → steps, every claim a fact. 10 hand-researched providers (the golden set) + 6 generated. [docs/REQUIREMENT_GRAPH.md](docs/REQUIREMENT_GRAPH.md)
- **Rules engine** (`lib/engine.ts`): pure TypeScript, recomputes on every tap. Verdict, runway, critical path, gates hit and skipped, priced faster paths, explanations that cite facts. [docs/RULES_ENGINE.md](docs/RULES_ENGINE.md)
- **Need intake** (`lib/intent.ts`): an app or a sentence, plus three toggles (who connects, how many, registered business) shown only where they change the answer.
- **Agent pipeline** for unknown apps (`lib/pipeline/run.ts`): Scout → Scope classifier ‖ Gate finder ‖ Prober → Verifier (code quote check, critic, ≤2 re-check rounds). [docs/AGENTS.md](docs/AGENTS.md), [docs/RETRIEVAL.md](docs/RETRIEVAL.md)
- **Harness** (`npm run eval`): runs the pipeline blind on the golden set and scores it. [docs/HARNESS.md](docs/HARNESS.md)
- More: [ARCHITECTURE](docs/ARCHITECTURE.md) · [UI_FLOW](docs/UI_FLOW.md) · [VERIFICATION_LOG](docs/VERIFICATION_LOG.md) · [PRODUCT_DECISIONS](docs/PRODUCT_DECISIONS.md) · [DEMO](docs/DEMO.md)

## Setup
```bash
npm install
npm run dev            # http://localhost:3000
npm test               # engine, verifier, provider layer, pipeline (mocked), URL state
npm run typecheck
npm run eval -- --mock --faults   # harness with the heuristic mock model, no key
```

## Environment
| Variable | Purpose |
|---|---|
| `LLM_BASE_URL` | OpenAI-compatible endpoint, e.g. `https://gate.joingonka.ai/v1` (primary provider) |
| `LLM_API_KEY` | its key |
| `LLM_MODEL` | model id, or a comma list in preference order |
| `LLM_HEDGE_MS` | start the next model if the current one hasn't answered (default 25000) |
| `LLM_AUTO_FALLBACK` | `0` to stop using the endpoint's other listed models as fallbacks |
| `LLM_TOKEN_BUDGET` | per-investigation token cap (default 120000) |
| `LLM_MAX_TOKENS` | max output tokens per call (default 2500) |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | optional fallbacks, tried in that order |
| `TYPESAFE_API_KEY` | optional: Jev typed decisions (scope tier, quote-supports-claim, need → capabilities). Unset = LLM/rules path. `TYPESAFE_MODEL` (default `jev-latest`), `JEV_TIMEOUT_MS` (6000), `JEV_DISABLE=1` |
| `FIRECRAWL_API_KEY` | optional: JS-rendered scrape + search for the Scout's picked pages. `FIRECRAWL_MAX_PAGES` per run (default 6) |
| `JINA_API_KEY`, `RETRIEVAL_JINA` | optional key for Jina Reader (free fallback, anonymous by default); `RETRIEVAL_JINA=0` turns it off |

`/api/status` reports which provider is primary, whether Jev and Firecrawl are configured (yes/no), never a key. Ready guides, the engine and the probes need no key.

## Decisions
- Code decides, models assist. The plan is computed; models only propose facts, and a fact without a matching quote is downgraded.
- Our own retrieval, no provider grounding: the verifier must see the same text the model saw.
- No database: graphs are versioned JSON; generated graphs travel in the share URL.
- Defaults are the honest worst case (public users, >100, registered business); toggles show the shortcuts.
- Weak facts are downgraded, not deleted, so the runway errs long.

## Limitations
- The gateway models measured on 2026-11-01 were slow (DeepSeek-V4-Flash ~2–3 tokens/s, GLM-5.3-Flash ~7, MiniMax-M2.7 ~100+). A live investigation takes 2–5 minutes; the provider layer hedges across models to keep it under Vercel's 300s limit.
- HTML search from datacenter IPs is weak (see RETRIEVAL). JS-rendered docs (Meta, Salesforce help) can't be read.
- Generated graphs are labelled "not human-reviewed". Curated waits that providers don't publish are our estimates, marked Uncertain.
- Not legal or provider advice.
