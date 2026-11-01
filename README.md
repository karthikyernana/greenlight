# Greenlight v2

**The runway from "I need a client ID" to "real users can connect".**

Live: **https://oauth-greenlight-v2.vercel.app** · v1 (unchanged): https://oauth-greenlight.vercel.app · branch `v2`

Developers building AI agents need their own OAuth app approved by Gmail, Salesforce, Slack and co. before strangers can connect accounts. Creating the client takes five minutes. Approval takes anywhere from zero to six months, and **the scopes you ask for decide which**. Greenlight tells you how long, what blocks you, what an agent can do for you right now, and hands you the artifacts to start.

Built as a take-home for Composio's APM (Toolkits) role.

---

## 30-second tour

1. **Type an app.** The landing page is one command bar over a departure board of 100 apps (16 with full guides, 84 investigated on demand). Typing filters live. `Enter` opens a guide; `Enter` on anything unknown (a name or a URL) starts an agent investigation **on the same page**.
2. **Read one line.** `Read email: 5w–2mo to live. Long pole: CASA security assessment.` Then three numbers (difficulty, hands-on effort, wait) and a runway from Today to Live, split into Agent / You / Provider lanes.
3. **Change what your agent needs.** Capability chips sit on the runway. Untick "Read email", tick "Send email only" and Gmail drops from ~2 months to ~2–3 weeks. Defaults are preselected, so zero clicks already gives an answer.
4. **Act.** Two buttons. *Copy link* (the URL carries the app and your selection). *Get setup kit* opens redirect URIs (incl. Composio's callback), the least-privilege scope list, a scope-justification draft, a privacy-policy checklist, a demo-video shot list, an email to the provider and a coding-agent handoff prompt. Copy each or download one `.md`.

## Why this approach

Composio's bet is that agents, not people, are the primary users of integrations, and that integration work should be an automated, observable function rather than a queue of manual chores. The APM (Toolkits) role is measured on supply: how many apps are live and how healthy they are, with "AI agents before humans" for the repeatable parts.

Greenlight takes that literally in three ways:

- **It does the agent half instead of describing it.** Every step is tagged Agent / You. The setup kit is the agent's output, generated instantly and deterministically from the guide, so it can't hallucinate. Only signing in, legal entities, payments, identity checks, recording video and clicking Submit are left to the human, and the runway shows exactly when those happen.
- **Managed auth first.** If Composio already runs an approved OAuth app for the toolkit, the guide opens with a *Fast lane*: skip all of this, with the honest trade-offs (Composio's name on the consent screen, unverified-app warnings on HubSpot/Slack). If it doesn't, the guide says so and the runway is the only route.
- **The same data is an ops tool.** Sort the board by wait and filter to `BYO APP`: that's the list of toolkits where Composio getting its own approval would save every customer weeks. The guides double as the SOP for getting that approval.

## Key decisions

**Scopes, not providers, are the unit.** Provider docs are organised by provider; a developer's question is organised by what the agent must do. Each capability carries a tier (instant → self-serve → review → restricted → partner, or paid) and each step says which capabilities need it. Everything recomputes from the selection.

**A runway, not a document.** Steps form a DAG (`after`). A longest-path schedule gives the wait and the critical path; the runway draws it on a **log time scale** so a 10-minute task and a 6-week review share one ruler. Work that can start at the same moment is merged into one numbered block. Numbers on the runway match the checklist. "Start today" lists the waits with no unfinished prerequisites.

**Design: Swiss-transit ops console.** Approval is a departure board. Light paper, near-black ink, thin rules instead of cards, **one signal colour** (international orange) used only for state: the critical path, long waits, corrections. Provider waits are amber hatching (solid = likely, hatched = worst case). Type is Host Grotesk for UI and JetBrains Mono for data, with tabular numbers. No gradients, no serif display, no pills, no emoji. Evidence is shown with shape, not just colour (● tested, ◐ sourced, hatched ○ uncertain). Details are collapsed by default; the first screen is one sentence, three numbers and the runway.

**One layout for library and live.** A live investigation streams into the exact guide layout: an agent log on top, and the fast lane, probes and sources fill in as they arrive, with skeletons for what's pending. Generated guides are labelled *Agent-generated · not human-reviewed*.

**Two buttons.** v1 had six actions per guide (copy markdown, agent prompt, email draft, share, progress, generate). v2 has *Copy link* and *Get setup kit*; everything else moved into the kit or is a click on the runway.

**No database.** A generated guide is compressed into its own share link (`#g=`), so links never die. Progress ticks are saved per device. The library is static JSON in the repo.

**Scope choice.** 16 guides picked for variety of gate, not popularity:

| App | Gate | Default needs → worst case |
|---|---|---|
| GitHub, Notion | none | same day → 1–3 weeks only for a marketplace listing |
| Calendly *(gen)* | none, one redirect URI per app | same day |
| X | pay per call ($0.015/post, $0.20 with a link) | same day, with credits |
| Docusign *(gen)* | paid production account | ≤5 days (often instant) → 1–4 weeks for a public app |
| Slack | workspace admins, then 10 installs + Marketplace review | same day → ~3 months |
| HubSpot | install cap (25) until listed | ~2–7 weeks → 6+ months for certification |
| Dropbox *(gen)* | production review at 50 users, 2-week clock | ~9 days–5 weeks |
| Outlook | publisher verification, admin consent | ~1–10 days → 2 weeks with app-only access |
| Gmail | sensitive/restricted scopes + CASA | ~5 weeks–2 months (send-only: 12 days–3 weeks) |
| Salesforce | ECA self-serve; AppExchange security review | same day → ~3 months |
| Instagram | business verification + App Review per permission | ~1–5 weeks |
| LinkedIn | partner vetting for pages/ads | ≤2 days → ~3 months |
| Spotify, Zoom, Shopify *(gen, v1)* | 5-user cap / security review / App Store review | varies |

## Tested vs Sourced vs Uncertain

- **Tested** = a live, public, unauthenticated probe: Composio toolkit page (managed or not), OAuth/OIDC discovery (PKCE, dynamic client registration), developer-portal reachability, and a fake-client authorize call. Nothing is created, signed into or submitted. Probes also run on every live investigation.
- **Sourced** = backed by a cited page, linked per step.
- **Uncertain** = estimates (mostly review turnaround times providers don't publish), listed per guide under "What we couldn't confirm".

New probe evidence in v2: Slack's `apps.manifest.validate` answers `not_authed` without a configuration token (so an agent can pre-validate a manifest only after you mint one); Calendly, Airtable and Salesforce discovery documents advertise **RFC 7591 dynamic client registration**, which the guide flags as an "Agent lane" (an agent might register a client by API, not a console). Probed, not exercised.

## Verification log (2026-11-01)

Re-checked v1 claims against the live pages. Each result is also shown in the guide's Evidence panel.

| Claim | Result | Source |
|---|---|---|
| Slack Marketplace needs 10 active installs, held during review | **Confirmed** (changelog Sep 1 2026; back up from a temporary lower bar) | docs.slack.dev/changelog/2026/09/01/… |
| HubSpot: 10 allowlisted (private), 25 before listing, unlimited after; AUP gates installs | **Confirmed** (page modified Aug 6 2026) | developers.hubspot.com/…/manage-apps-in-hubspot |
| Google: brand verification 2–3 business days; restricted scopes take weeks + security assessment every 12 months | **Confirmed** | developers.google.com/…/restricted-scope-verification |
| Google: sensitive-scope verification ~10 business days | **Unverifiable today** (the FAQ now renders answers client-side; kept as an estimate) | support.google.com/cloud/answer/13463817 |
| X: posting ~$0.015, "more with a link" | **Corrected**: $0.20 per post containing a URL; free credits are $20 + up to $50 auto-recharge match; 3M post-read monthly cap | docs.x.com/x-api/getting-started/pricing |
| Composio has no managed X app | **Confirmed** | docs.composio.dev/toolkits/twitter |
| Composio BYO callback `…/api/v3/toolkits/auth/callback` | **Confirmed, with a nuance now in the kit**: some toolkit defaults still use `…/api/v1/auth-apps/add`; the provider console and the auth config's `oauth_redirect_uri` must match | docs.composio.dev/docs/custom-auth-configs |
| (new guide) Docusign Go-Live needs 20 successful API calls | **Corrected**: removed Oct 2025; Go-Live now auto-promotes eligible apps | developers.docusign.com/docs/esign-rest-api/go-live/ |

## Live generation

`POST /api/generate {q}` streams NDJSON: `step` events (agent log), `patch` events (partial guide: Composio result, probes, sources) and finally `guide`.

1. Composio directory check (public toolkit page).
2. Research: **Gemini** with Google Search grounding → **Groq** (`groq/compound`, built-in web search) → **OpenRouter** free models (ungrounded, so the agent leans on pages it fetches itself and the model is told to mark unsupported claims uncertain) → Vercel AI Gateway. Each retries 429/5xx and walks a model list on 404.
3. Live probes on the resolved domain.
4. Reads up to 4 official pages itself.
5. Structures into the shared zod schema; enums clamped, models can never claim "tested", one repair retry.

**Status on the live deployment: no model key is set**, so steps 1, 3 and 4 run and the page explains how to turn research on. `/api/status` reports which providers are configured. The Gemini key in Karthik's vault couldn't be bound in the build sandbox (the host belongs to the Google connector), so the real Gemini call is untested; Gemini, Groq and OpenRouter paths are covered by mocked tests.

**To turn it on:** in Vercel project **greenlight-v2** → Settings → Environment Variables, add one of `GEMINI_API_KEY` (aistudio.google.com, free tier), `GROQ_API_KEY` (console.groq.com, free tier) or `OPENROUTER_API_KEY` (free `:free` models) for Production, then redeploy.

## How it scales to 100

1. **Batch, same agent, same schema.** `scripts/batch-v2.ts` shows the shape: draft → zod → live probes attached → committed JSON, labelled generated. The board already lists all 100 Composio OAuth toolkits; each is one keypress from a live run.
2. **Human promotion.** A reviewer clears the Uncertain items and flips `origin` to curated. Evidence badges tell them exactly what to check.
3. **Freshness.** Re-run probes weekly (cheap, deterministic) and re-verify claims monthly; the per-guide `checks` log records confirmed / corrected / unverifiable with dates. 2026 alone changed Salesforce (ECAs), X (pay-per-use), Slack (10 installs), Spotify (5 users) and Docusign (no 20-call rule).
4. **Outcome data.** Progress ticks plus "submitted on / approved on" would turn estimated waits into observed ones.

## Limitations

- Review times are estimates unless the provider publishes them; they're marked.
- Generated guides (6 in the library, plus anything investigated live) are not human-reviewed.
- Probes are unauthenticated by design: "Tested" means endpoints and directory behave as described, not that an app was approved.
- Live research is off until a model key is added (see above).
- Calendar dates on the runway ("Live ≈ 30 Jan") convert business-day estimates roughly (×1.4).
- No shared database: generated guides live in their link, the server instance cache and the visitor's browser.

## Run locally

```bash
npm install
npm run dev                        # optional: GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY
npm test                           # plan recompute, URL state, kit, search, agent pipeline (mocked)
npm run typecheck
npx tsx scripts/probe-seeds.ts     # refresh Tested evidence for curated guides
npx tsx scripts/batch-v2.ts        # rebuild the v2 generated guides with fresh probes
```

Env: `GEMINI_API_KEY`, `GEMINI_MODEL` (comma list), `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_RESEARCH_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `AI_GATEWAY_API_KEY`, `NEXT_PUBLIC_SITE_URL`.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · zod · Vercel (sin1).

## What changed from v1

| v1 | v2 |
|---|---|
| Cream + serif, pills, card grid | Ops-console: paper/ink, rules, one signal colour, grotesk + mono |
| Hero, search, then card library | One command bar over a sortable departure board |
| Separate `/generate` page | Live investigation fills the guide layout in place |
| Timeline + text-heavy sections | Verdict line, 3 numbers, Agent/You/Provider runway; details collapsed |
| 6 action buttons | 2: Copy link, Get setup kit (7 artifacts) |
| 13 guides | 16 (Calendly, Dropbox, Docusign added) |
| Gemini / AI Gateway | + Groq and OpenRouter fallbacks, partial streaming, clean no-key state |
| — | Verification log, corrected facts (X, Docusign), DCR "agent lane", Slack manifest probe |
| Mock script | 15 tests (`npm test`) |
