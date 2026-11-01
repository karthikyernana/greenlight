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
- Accounts, saved projects, a database: share URLs carry the whole state. Not needed to prove the idea.
- Automating console steps with a browser agent: signing into users' provider accounts is a trust problem worth its own design.
- Chat. A plan the user can change by tapping is faster to read and to trust than a conversation.
- Search APIs with keys: retrieval is our own and works without one, at the cost of weaker search from datacenter IPs (documented).

**How it scales to 100.** Composio already lists 100+ OAuth toolkits (`data/composio-toolkits.json`). Run the pipeline in batch, keep graphs whose verifier pass rate is high, have a person review the Uncertain facts (the evidence panel is the review queue), commit the JSON. The harness guards against regressions on every model or prompt change. Re-running `build-graph.ts` weekly re-checks every curated quote and flags pages that changed.

**What Composio could do with it.**
- Show the runway inside the toolkit page and the auth-config flow, at the moment a developer chooses managed vs bring-your-own.
- Use "Faster paths" to sell the managed app honestly: it saves weeks, and the trade-off is stated.
- Use aggregate needs (which scopes developers ask for) to decide which managed apps to get verified next.
- Use the graph as a living checklist for its own verification submissions.
