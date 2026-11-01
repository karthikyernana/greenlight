# Greenlight

**How long until your agent's users can connect? Start the slow parts today.**

Live: **https://oauth-greenlight-v2.vercel.app** · Source: this branch (`v4`) · Built as the Composio APM (Integrations) take-home.

Pick an app (or type any app name or website) and tick what your agent needs to do. Greenlight shows how hard approval is, the realistic wait including the provider's review, what an agent can prepare versus what only you can do, the next step, and what to do when you hit a blocker. Every number traces to a fact marked **Tested**, **Sourced** or **Uncertain**, with its source link. Apps outside the library are investigated live by agents and saved as a shareable guide.

---

## The problem

Creating an OAuth client ID takes five minutes on every provider. What developers can't predict is **approval**: whether real users can connect today, in a week, or in three months. That depends almost entirely on **which scopes you ask for** (Gmail `gmail.send` is a sensitive-scope review; `gmail.readonly` adds a paid security assessment and ~6 weeks), plus a few provider-specific gates: install caps before listing (HubSpot, Slack), business verification (Meta), per-call billing (X), tenant admin consent (Microsoft).

Provider docs explain each gate in isolation. Nobody tells you, for *your* agent's needs: how long, why, what to start today, and whether you could ship now on Composio's already-approved app instead.

## Scope decision, and why

- **Scope-aware plans, not provider pages.** The unit is "provider × what your agent needs", so the same Gmail guide says *today* for sign-in, *~10 business days* for sending, *5 weeks to 2 months* for reading. Ticking a capability recomputes everything instantly.
- **A small library done carefully, plus live generation for the long tail.** 100 apps on the board; 16 have full guides (10 hand-researched "golden" providers chosen to be varied: Google, Microsoft, Slack, HubSpot, Salesforce, Meta, LinkedIn, X, Notion, GitHub, and 6 agent-generated). Anything else is investigated on demand and stored, so it's generated once and instant for everyone after.
- **Managed auth is the launch-today path.** Where Composio runs an approved app, the guide says so first and prices the alternative; where it doesn't, the guide shows exactly what bring-your-own takes and gives the Composio callback URL to register.
- **Out of scope on purpose:** signing in to provider consoles, creating real apps, or submitting reviews (no paid accounts, and an agent can't prove your identity or record your demo video). The Setup kit prepares everything up to those clicks.

## How it works

- **Requirement graph** (`data/graph/*.json`, schema in `lib/graph/schema.ts`): provider → capability → scopes → review tier → gates → steps. Every claim is a fact with URL, verbatim quote, checked date and status.
- **Rules engine** (`lib/engine.ts`, pure TypeScript): verdict, wait range, critical path, gates hit and skipped (with reasons), faster paths, and the Agent / You / Provider runway. Code decides; models never compute the plan.
- **Live investigation for unknown apps** (`lib/pipeline/run.ts`), five agents streamed as lanes:
  1. **Scout** finds the official developer docs (search + conventional hosts + the model's pointer) and checks Composio's toolkit page for managed auth.
  2. **Scope classifier** and **Gate finder** read the fetched pages in parallel and propose capabilities, tiers, gates and steps, each with a quote.
  3. **Prober** tests the provider live: OIDC discovery, the authorize endpoint with a fake client, dynamic client registration.
  4. **Verifier** checks every quote against the fetched text in code, has a critic look for contradictions, re-checks weak facts (≤ 2 rounds), and downgrades anything unsupported to Uncertain.
- **Input gate** (`lib/validate.ts`): nothing is investigated until the input resolves to a real product (library, Composio directory, DNS + homepage, Wikidata, docs search, or Jev). Gibberish gets an answer in < 2 s.
- **Generate once, share always** (`lib/store.ts`): finished guides are stored in Vercel Blob under a canonical slug ("Xero", "xero.com", "developer.xero.com" are one guide). Concurrent requests for the same new app join one run, across server instances.
- **Publishing policy** (`lib/publish.ts`): a generated guide is live at once on its own link as *Draft*; it reaches the public board as *Verified by checks* only if ≥ 80% of quotes matched the source, no contradiction is unresolved, every gate fact is Sourced/Tested, and every gate cites the provider's own docs.
- **Setup kit** (`lib/kit.ts`): redirect URIs, scope list, scope justification, privacy-policy checklist, demo-video shot list, an email to the provider, and a coding-agent handoff, built from the guide and your selection.

More: [ARCHITECTURE](docs/ARCHITECTURE.md) · [AGENTS](docs/AGENTS.md) · [RULES_ENGINE](docs/RULES_ENGINE.md) · [REQUIREMENT_GRAPH](docs/REQUIREMENT_GRAPH.md) · [RETRIEVAL](docs/RETRIEVAL.md) · [HARNESS](docs/HARNESS.md) · [VERIFICATION_LOG](docs/VERIFICATION_LOG.md) · [PRODUCT_DECISIONS](docs/PRODUCT_DECISIONS.md) · [UI_FLOW](docs/UI_FLOW.md) · [DEMO](docs/DEMO.md)

## Tested vs sourced vs uncertain

| Label | Meaning | Example |
|---|---|---|
| **Tested** | We probed it live from the server (public, unauthenticated) | Google's authorize endpoint rejects an unknown client; Composio's Pipedrive toolkit page says managed OAuth is not available |
| **Sourced** | A verbatim quote was found on the cited page when it was fetched | "Please note the user cap applies over the entire lifetime of the project, and it cannot be reset" (Google) |
| **Uncertain** | Our estimate, or a claim we couldn't quote | Review times providers don't publish (GitHub Marketplace, Notion Marketplace) |

The 10 golden providers hold 89 facts: 38 Tested, 33 Sourced, 18 Uncertain. Weak facts are downgraded, never deleted, so waits err long.

### Checked against real sources (sample)
- **Corrected:** the brief's "gmail.send + metadata skips CASA" is wrong: `gmail.metadata` is *restricted* (quoted from Google's scope page). The engine suggests `gmail.send` and the Gmail add-on scope instead.
- **Corrected:** Docusign's "20 successful API calls" Go-Live rule was removed in October 2025.
- **Corrected:** an X post containing a URL costs $0.20, not "a bit more"; free credits are $20 plus up to $50 matched.
- **Corrected (2026-11-02):** the Zoom "private apps need no review" fact cited a page that now 404s; replaced with Zoom's Publish page and its quote.
- **Confirmed:** Slack 10 active installs before Marketplace review; HubSpot 10 / 25 / unlimited installs; Google brand verification 2–3 business days, restricted scopes ~6 weeks plus an annual assessment; Composio has no managed X app.
- **Can't be fully verified:** Google's "~10 business days" for sensitive scopes. The quote was captured from the JS-rendered FAQ; a plain fetch shows only the questions. Kept, labelled approximate.
- **Can't be read from a server:** Meta and Salesforce help pages (HTTP 400/403 to non-browsers). Those facts are labelled Uncertain or rest on a quoted third-party guide.
- **Caught by the new publishing check:** two generated guides (Zomato, Google Contacts) had passed the quote checks while citing the wrong company's docs (Google verification pages for Zomato; Gmail CASA rules for Contacts). They are now Draft and off the board.

Full log: [docs/VERIFICATION_LOG.md](docs/VERIFICATION_LOG.md).

## Results

| What | Result |
|---|---|
| Library guides audited on production (desktop 1440 and a 390 px phone at 4× CPU / Fast 3G) | 16/16: no console or hydration errors, no overflow, Copy link reopens the same state in a fresh browser, Setup kit complete |
| Source links in the library (HEAD/GET) | 142 checked; 1 dead (Zoom, fixed); the rest are live or bot-blocked (Salesforce 403, Shopify 406, Google 429) |
| Live generation on production, unfamiliar apps (2026-11-02) | Pipedrive 83 s · Miro 97 s (two browsers at once, one shared run) · `https://webflow.com` 99 s · FreshBooks 86 s (2026-11-01) |
| Harness on the 10 golden providers (`npm run eval`, blind) | 10/10 completed, gate recall 65%, quote-match 74% before re-check, median 56 s ([HARNESS](docs/HARNESS.md)) |
| Fabricated quotes injected by the fault harness | caught 9/9 |
| Tests | `npm test` 114 unit/integration; `npm run e2e` 16 browser tests (14 on production, 2 need the fake pipeline) |

## Setup (run locally)

```bash
npm install
npm run dev                      # http://localhost:3000 — library guides work with no keys
npm test                         # engine, verifier, store, publishing, gate, pipeline (mocked models)
npm run typecheck
npm run eval -- --mock --faults  # harness with a heuristic mock model, no key
```

Live investigation needs one model key. Copy the names you use into `.env.local` (never commit it):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | Model providers, tried in that order with hedging (`MODEL_ORDER` overrides; `/api/status` shows the active order) |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Any OpenAI-compatible endpoint (optional) |
| `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` | Vercel Blob for the shared guide store; unset = this server's memory only |
| `FIRECRAWL_API_KEY` | Optional JS-rendered fetch + search for the Scout |
| `TYPESAFE_API_KEY` | Optional Jev typed decisions (scope tier, quote supports claim, need → capabilities) |

Browser tests: `GREENLIGHT_FAKE_PIPELINE=1 npx next build && npx next start -p 3100`, then `npm run e2e` (system Chromium at `/usr/bin/chromium`). `E2E_BASE=<url> npm run e2e` runs them against a deployment. Never set `GREENLIGHT_FAKE_PIPELINE` in production.

## Key decisions

- **Code decides, models assist.** The plan is computed from the graph; models only propose facts, and a fact without a matching quote is downgraded.
- **Our own retrieval, no provider "grounding".** The verifier must see exactly the text the model saw.
- **Honest worst case by default** (public users, more than 100, registered business). Toggles appear only where they change the answer.
- **No accounts, no database server.** Curated graphs are versioned JSON; generated ones are blobs. "Your apps" lives in the browser.
- **Draft until checks pass.** "Verified" means automatic checks passed, not that a person reviewed it; "Curated" is the hand-researched badge.

## Limitations

- Generated guides are only as good as the docs the server can read: JS-only or bot-blocked docs (Meta, Salesforce help) give thin results, and the scope classifier is the weakest stage (17% tier accuracy on the harness).
- Waits that providers don't publish are our estimates, labelled Uncertain. Review queues change; the guide shows when each fact was checked.
- The agents never sign in, create real apps or submit reviews; probes are public and unauthenticated.
- Free-tier models rate-limit: a live run takes about 1.5 minutes and can take up to ~5. Each IP can start 20 new investigations per hour.
- The cross-instance run lock is best effort (read-then-write on Blob, no compare-and-swap).
- Not legal or provider advice; check the sources before you submit.

## Next

1. Grow the library to 100 full guides by running the pipeline in batch and promoting only Verified guides, with a weekly re-check that diffs facts and flags changes.
2. Feed real outcomes back: let developers mark "approved in N days" so waits come from data, not estimates.
3. Inside Composio: open the guide from a toolkit's "bring your own app" screen, pre-filled with the toolkit's scopes and callback.
4. Signed-in assisted setup where a provider allows it (dynamic client registration, Slack app manifests), with the user approving each step.
