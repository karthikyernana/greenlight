# Greenlight v4

**ChatGPT writes an answer. Greenlight works one out.**

Say what your agent needs ("triages my users' Gmail and drafts replies"). Greenlight computes your path from today to "real users can connect": how long, why, what an agent can prepare, and the fastest legitimate route. Every number traces to a fact with a source URL, a verbatim quote, a checked date and a status.

Live: https://oauth-greenlight-v2.vercel.app · Branch `v4` · Composio APM (Integrations) take-home.

## What's new in v4
- **Generate once, reuse for everyone.** A finished investigation is stored (Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; else this instance's memory) under a canonical slug, so "Xero", "xero.com" and "developer.xero.com" are one guide. The next request, from anyone, renders it with zero model calls. Re-check only after 30 days or on request (rate-limited). `lib/store.ts`, `lib/generate.ts`, `lib/canonical.ts`.
- **Publishing policy, no human click.** New guides are live at once on their own link as *Draft · agent-generated*; promoted to the board as *Verified by checks* only when ≥ 80% of quotes match the fetched source, no contradiction is left unresolved, and every gate fact is Sourced/Tested. *Curated* stays a separate, hand-researched badge. `lib/publish.ts`, [docs/PRODUCT_DECISIONS.md](docs/PRODUCT_DECISIONS.md).
- **Your apps** shelf on Home: pinned + recently viewed, in localStorage, no login.
- **Command bar matches before it generates**: library + store, exact and fuzzy (name/domain/typos); the server double-checks and also collapses concurrent requests for the same app into one run.
- **Redesign**: calm panels on hairlines, glass only where content scrolls underneath (header, toast), spring motion (FLIP reorders, height springs, number tweening, shared-element row → title), no overflow down to 375 px. [docs/UI_FLOW.md](docs/UI_FLOW.md)
- **Model fallback**: `LLM_*` → `GEMINI_API_KEY` (default `GEMINI_MODEL` = `gemini-2.5-flash,gemini-flash-latest`) → `GROQ_API_KEY` (default `openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b`) → OpenRouter; `/api/status` reports the order and each fallback's models. Rate limits that name their reset are waited out (≤ 15 s).

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
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | optional fallbacks, tried in that order. `GEMINI_MODEL`, `GROQ_MODEL`, `OPENROUTER_MODEL` override the default model lists; `GEMINI_THINKING_BUDGET` (default 0) for 2.5-flash |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store connected to the project: shared guide store. Unset = per-instance memory (reported in `/api/status → store`). `BLOB_ACCESS=private` if the store is private (auto-detected otherwise) |
| `TYPESAFE_API_KEY` | optional: Jev typed decisions (scope tier, quote-supports-claim, need → capabilities). Unset = LLM/rules path. `TYPESAFE_MODEL` (default `jev-latest`), `JEV_TIMEOUT_MS` (6000), `JEV_DISABLE=1` |
| `FIRECRAWL_API_KEY` | optional: JS-rendered scrape + search for the Scout's picked pages. `FIRECRAWL_MAX_PAGES` per run (default 6) |
| `JINA_API_KEY`, `RETRIEVAL_JINA` | optional key for Jina Reader (free fallback, anonymous by default); `RETRIEVAL_JINA=0` turns it off |

`/api/status` reports which provider is primary, the fallback order, whether Jev, Firecrawl and Blob persistence are configured, how many guides are stored/verified, never a key. `/api/store` lists stored guides (for the command bar). Ready guides, the engine and the probes need no key.

## Decisions
- Code decides, models assist. The plan is computed; models only propose facts, and a fact without a matching quote is downgraded.
- Our own retrieval, no provider grounding: the verifier must see the same text the model saw.
- No database server: curated graphs are versioned JSON; generated graphs are JSON blobs in Vercel Blob (one file per app + its trace). Share links stay short because the guide lives at its slug.
- No accounts: "Your apps" lives in the browser. A sign-up wall would cost more demo users than it's worth; future = the Composio account.
- Defaults are the honest worst case (public users, >100, registered business); toggles show the shortcuts.
- Weak facts are downgraded, not deleted, so the runway errs long.

## Limitations
- The gateway models measured on 2026-11-01 were slow (DeepSeek-V4-Flash ~2–3 tokens/s, GLM-5.3-Flash ~7, MiniMax-M2.7 ~100+). A live investigation takes 2–5 minutes; the provider layer hedges across models to keep it under Vercel's 300s limit.
- HTML search from datacenter IPs is weak (see RETRIEVAL). JS-rendered docs (Meta, Salesforce help) can't be read.
- Generated graphs are labelled Draft until every automatic check passes; Verified means the checks passed, not that a person reviewed it. Curated waits that providers don't publish are our estimates, marked Uncertain.
- Not legal or provider advice.
