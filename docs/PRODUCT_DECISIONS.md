# Product decisions

**Problem.** An agent that acts in Gmail, Slack or Salesforce needs its users to connect those accounts. Registering the OAuth app takes minutes. Getting it approved for strangers takes from zero days to three months, depends on the exact scopes, and is documented across dozens of pages that disagree. Developers find out late, usually from a rejection email.

**Who it's for.** A developer building an agent on Composio, the week they decide which integrations to ship. Secondary: Composio's own integrations team deciding which managed apps matter most.

**Positioning.** ChatGPT writes an answer; Greenlight works one out. The answer is computed by a rules engine from facts that each carry a source, a quote and a status. Models only find and classify facts, and code checks them.

**Scope chosen, and why.**
- One question answered well: "how long until real users can connect, and what's the fastest legitimate path?" Everything on the page serves that.
- A typed requirement graph instead of prose guides, so the plan can recompute on every tap and every sentence can point at its evidence.
- Three personalisation questions only (who connects, how many, registered business), shown only where they change the answer. They capture the biggest real-world shortcuts: Google internal apps, the 100-user unverified path, Meta Standard Access, Microsoft single-tenant.
- Cheaper paths priced in weeks, not suggested in prose.
- A fixed agent pipeline with a code verifier for unknown apps, and a harness that scores it against the hand-built graphs.

**Cut, and why.**
- Accounts and sign-up. "Your apps" (pinned + recently viewed) lives in localStorage instead: a demo that asks for an account before showing a plan loses most people at the door, and nothing on the shelf is sensitive. Future: sync the shelf to the user's Composio account, where their toolkits and auth configs already live.
- Automating console steps with a browser agent: signing into users' provider accounts is a trust problem worth its own design.
- Chat. A plan the user can change by tapping is faster to read and to trust than a conversation.
- Search APIs with keys as a requirement: retrieval works without one. Firecrawl (JS-rendered scrape + search) is used only when `FIRECRAWL_API_KEY` is set, capped at a few pages per run; Jina Reader is the free fallback; plain fetch is always last (docs/RETRIEVAL.md).

**Jev only for typed decisions.** TypeSafe's Jev returns typed answers (a choice with probabilities, a yes/no probability), no text, in well under a second. We use it only where our code consumes a decision: a scope's review tier (Choice), "does this verbatim quote support this claim?" (Noul), and "does this need sentence ask for capability X?" (Noul). Text generation (gates, steps, summaries) stays with the LLM, and the code quote check stays first and authoritative. Every Jev call is behind `TYPESAFE_API_KEY`, falls back to the LLM/rules path when unset or failing, and is shown in the trace as "Jev 0.93" so a person can see which engine decided.

**How it scales to 100.** Composio already lists 100+ OAuth toolkits (`data/composio-toolkits.json`). Run the pipeline in batch, keep graphs whose verifier pass rate is high, have a person review the Uncertain facts (the evidence panel is the review queue), commit the JSON. The harness guards against regressions on every model or prompt change. Re-running `build-graph.ts` weekly re-checks every curated quote and flags pages that changed.

**What Composio could do with it.**
- Show the runway inside the toolkit page and the auth-config flow, at the moment a developer chooses managed vs bring-your-own.
- Use "Faster paths" to sell the managed app honestly: it saves weeks, and the trade-off is stated.
- Use aggregate needs (which scopes developers ask for) to decide which managed apps to get verified next.
- Use the graph as a living checklist for its own verification submissions.

## v4: generate once, reuse for everyone

**Why.** An investigation costs 1–4 minutes and tens of thousands of model tokens. The answer for "Xero" is the same for every developer that week, so paying for it twice is waste and makes the second person wait for nothing.

**How.** A finished investigation is stored in a shared store keyed by a canonical slug (`lib/canonical.ts`: "Xero", "xero.com", "developer.xero.com", "Xero API" → `xero`). Any later request for the same app, from anyone, is served from the store with zero model calls (`lib/generate.ts`). The store is Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (`guides/<slug>.json`, `traces/<id>.json`); without it, the server instance's memory, and `/api/status → store.mode` says `memory` and `shared: false`.
- **Re-check** happens only when the guide is older than 30 days (shown as "older than 30 days", Re-check always allowed) or someone presses **Re-check**, which is rate-limited per app (10 minutes after the last run starts) and per IP (20 runs/hour).
- **No duplicate generations.** The command bar matches what you type against the library and the store (exact canonical slug, then fuzzy name/domain/aliases: one typo in a 4–6 letter name, two in 7+), and offers "Did you mean X?" before "Investigate". The server repeats the check, so a direct API call can't create a duplicate either.

## v4: publishing policy (no human click)

| State | Where it shows | How it gets there |
|---|---|---|
| **Draft · agent-generated** | Its own share link, instantly; command-bar matches; "Your apps". Not on the public board. | Every new guide starts here. |
| **Verified by checks** | The public board, with the badge. | Promoted automatically when **all four** pass: (1) ≥ 80% of the specialists' quotes were found verbatim in the fetched source (code check, before re-checks); (2) no unresolved contradiction: every fact the critic flagged was confirmed or corrected on re-check; (3) every gate fact is Sourced or Tested (each gate cites ≥ 1 fact; none Uncertain); (4) every gate cites at least one page on the provider's own domain (added 2026-11-02 after two guides passed 1–3 while quoting another company's docs; applied to stored guides when read). |
| **Curated · hand-researched** | Board, separate badge. | Researched and re-checked by a person; never computed. |

A Draft lists exactly which checks failed (amber notice under the verdict, and "Publishing checks" in Evidence). The verdict is computed by `lib/publish.ts` and stored with the guide. The six agent-generated guides shipped in the repo since v2 (Calendly, Dropbox, Docusign, Shopify, Spotify, Zoom) are scored the same way; their quotes were never verbatim-checked, so they show **Draft**. They stay listed on the board (they were public before v4) with the Draft badge rather than silently disappearing.

**Future work: human review queue.** Composio's integrations team gets a queue of Drafts sorted by demand (how often each is opened), each showing its failed checks and Uncertain facts; one click promotes to Curated after a person confirms the facts. Not built: the automatic policy is enough for a demo and keeps the "no human click" property.
