# Retrieval

The model never searches. We fetch, and the model reads only what we fetched (`lib/retrieval.ts`). The Verifier's quote check runs against the exact text the model was shown, whichever retriever produced it, and the trace records the retriever for every source (`via firecrawl | jina | fetch`, plus what was tried first).

## Retriever order

| Order | Retriever | When | Notes |
|---|---|---|---|
| 1 | **Firecrawl** `POST https://api.firecrawl.dev/v2/scrape` (markdown, `onlyMainContent`, `maxAge` 2 days) | `FIRECRAWL_API_KEY` set, page was *picked* by the Scout | JS-rendered (Meta, Salesforce help). Credits kept low: at most `FIRECRAWL_MAX_PAGES` (default 6) scrapes per run, URL cache per run, Firecrawl's own cache allowed, stops after 3 errors. |
| 1b | Firecrawl `POST /v2/search` | same key | Replaces Bing/DDG HTML search for the Scout and re-check queries (no scraping in search, to save credits). |
| 2 | **Jina Reader** `GET https://r.jina.ai/<url>` | picked pages without Firecrawl (or after it failed); guessed hosts only when plain fetch looks JS-rendered or blocked | Free; `JINA_API_KEY` optional. Runs in parallel with plain fetch so it adds no wall time. A 401/403/429 trips a per-run breaker. Measured 2026-11-01: anonymous Jina answers **401 "bad IP reputation"** from the Hark sandbox, so locally it falls through to fetch; whether Vercel's IPs are allowed shows in each trace. `RETRIEVAL_JINA=0` disables it. |
| 3 | **Plain fetch** + HTML→text | always last; first for conventional-host guesses | Unchanged from v3. |

Markdown from Firecrawl/Jina is flattened (`mdToText`: link targets, images and emphasis markers removed) before passages are cut, so the quotes the model copies match the stored text.

*Picked* pages: search hits on the official domain or a developer-looking host, the model's doc pointers, and re-check sources. *Guessed* pages: `developers.<domain>`, `developer.<domain>`, `docs.<domain>`, `<domain>/developers`, `<domain>/docs`, and the Composio toolkit page.

## Pipeline steps

1. **Search**: Firecrawl search when configured; otherwise Bing HTML (result links decoded from `/ck/a?u=a1<base64>`), DuckDuckGo HTML as fallback. Query: `<app> OAuth app scopes review verification developer documentation`.
2. **Model pointer** (Scout, in parallel): the model names the official domain and up to 5 doc URLs. We fetch them; a wrong URL just fails to load.
3. **Conventional hosts** (guesses, see above).
4. **Composio toolkit page** for the managed-OAuth status.
5. **Passage ranking**: pages cut into ~700-character passages, scored on OAuth/review vocabulary and day/week numbers, max 4 per page, top 14 go to the specialists (~26k characters).

`/api/status` → `retrievalLayer: { firecrawl: true|false, jina: "anonymous"|"key"|"off", order }`. Never a key.

## Known limits (2026-11-01)
- From datacenter IPs, Bing returns navigational results and DuckDuckGo answers 202 challenges. Without Firecrawl, search is best effort; the model pointer and conventional hosts carry most investigations.
- Without Firecrawl (and with Jina blocked), JS-rendered docs (developers.facebook.com answers 400 to non-browsers; Salesforce help is client-rendered) yield no text; those facts stay Uncertain.
- Firecrawl was not exercised live: no key was available to Hark on 2026-11-01. The path is covered by mocked tests (`tests/retrieval.test.ts`).
- Probes are public and unauthenticated only: nothing is created, signed into or submitted.
