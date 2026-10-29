# Greenlight

**How long until your OAuth app can launch? Start the slow parts today.**

Live: https://oauth-greenlight.vercel.app · Product memo: https://oauth-greenlight.vercel.app/why

Greenlight helps developers building AI agents get their own OAuth app approved with a provider (Gmail, Salesforce, LinkedIn…) so their users can connect accounts. You pick an app and **what your agent needs to do**. Greenlight then shows how hard it is, the realistic wait, what blocks approval, which steps an agent can do for you, and which long waits to start today. Apps outside the library are investigated live by an agent and get a shareable guide.

Built as a take-home for Composio's APM (Integrations) role.

---

## The problem, and the insight

Creating a client ID takes five minutes on every provider. What's unpredictable is **approval**, and that depends almost entirely on **the scopes you request**:

| Same provider | Scope | What it takes |
|---|---|---|
| Google | `openid email profile` | Nothing. Works even in testing mode |
| Google | `gmail.send` | Sensitive-scope verification, ~10 business days |
| Google | `gmail.readonly` | Restricted: verification + annual CASA security assessment, ~6+ weeks |
| LinkedIn | `w_member_social` | Self-serve, instant |
| LinkedIn | company pages | Partner program, vetting, not guaranteed |

Provider docs are organised by provider. A developer's question is organised by *what my agent needs*. So the core control in Greenlight is a **capability picker**, and everything else recalculates from it.

## Who it's for

A developer or founder shipping an agent that acts on users' accounts, deciding between Composio-managed auth and their own OAuth app, and needing to know (and tell their team) how long until real users can connect.

## What's in the product

- **Scope-aware guides.** Capability chips (e.g. "Read email", "Send email only", "Post as member"). Difficulty, time to full approval, hands-on effort and the step list all recalculate.
- **Two plans.** *Launch today* (Composio-managed auth, testing-mode limits, ship low-risk scopes first) next to *Full approval*.
- **Start the clock today + critical path.** Steps form a DAG (`after`). A longest-path schedule shows hands-on effort vs waiting on the provider, and flags which waits can start right now.
- **Agent vs you, per step.** What an agent can do (configs, manifests, redirect URIs, privacy policy drafts, reviewer notes, screencast shot lists) vs what needs a human (legal docs, payment, identity, recording, Submit).
- **Evidence on everything.** Each claim is *Sourced* (cited doc), *Uncertain* (estimate), or backed by *Tested* live probes.
- **Common rejection reasons** and **If you're blocked** for each provider.
- **Make progress, not just read.** A checklist with progress saved locally, a share URL that keeps your scope selection, *Copy as Markdown*, *Hand off to a coding agent* (a prompt that does the agent half and stops at the human half), and *Draft email to provider* built from the guide's open questions.
- **Composio angle.** Live managed-auth status for 100 OAuth toolkits, scraped from the public `docs.composio.dev/toolkits/<slug>` pages, plus the caveats (unverified-app warnings, actor shown as "Composio", dropped apps like X).
- **Live generation.** Type any app or URL and watch the agent work.

## Scope chosen (and why)

**10 hand-researched guides**, picked to cover every kind of gate rather than the most popular apps:

| App | Gate type | Headline (default needs → all scopes) |
|---|---|---|
| GitHub | none | Easy, same day → up to ~3 weeks only if you list on Marketplace |
| Notion | none (users pick pages) | Easy, same day → ~1–3 weeks only for a Marketplace listing |
| Slack | workspace policy + install count | Easy, same day → Marketplace: 10 installs + review, ~3 weeks–3 months |
| HubSpot | install caps (25 before listing) | Moderate, ~2–7 weeks to list → certification 6+ months |
| Microsoft Outlook (Graph) | publisher verification, admin consent | Moderate, ~1–10 days for mail scopes → Hard with app-only permissions |
| Gmail (Google) | sensitive/restricted scopes + CASA | Hard, ~5 weeks–2 months to read mail (sign-in instant) |
| Salesforce | Connected Apps disabled Spring '26 → ECA; AppExchange review | Easy, same day (ECA) → Hard, ~5 weeks–3 months for AppExchange |
| Instagram (Meta) | Business Verification + App Review per permission | Hard, ~1–5 weeks |
| LinkedIn | partner-only APIs | Easy (≤2 days) for sign-in/post → Gated, ~3 weeks–3 months for company pages |
| X (Twitter) | money (pay-per-use, no free tier) | Moderate, same day, with paid credits |

Plus **3 batch-generated guides** (Spotify, Zoom, Shopify) showing the path to 100, and **100 OAuth toolkits** indexed from Composio's directory, each one click from a live-generated guide.

I put the depth into getting the *decision* right (how long, what blocks you, what to start now) rather than covering more apps. A wrong timeline is worse than no guide.

## Tested vs Sourced vs Uncertain

**Tested** means live, *public, unauthenticated* probes run on 2026-10-30 (and on every live generation). No apps were created in any account, nothing was signed into, and nothing was submitted.

| App | Tested |
|---|---|
| All 13 | Composio toolkit page → managed OAuth available / not available |
| Google | OIDC discovery (PKCE plain/S256); fake-client authorize → redirected to `signin/oauth/error` |
| Microsoft | OIDC discovery (`/common/v2.0`); authorize endpoint live |
| Salesforce | OIDC discovery (PKCE S256, **advertises a dynamic client registration endpoint**); fake client → `invalid_client_id` |
| LinkedIn | OIDC discovery; fake client → "client_id is invalid" |
| Slack | OIDC discovery (openid/profile/email) |
| Notion | MCP server's OAuth metadata (**PKCE S256 + dynamic client registration**); authorize redirects to `install-integration` |
| Instagram/Meta | Facebook OIDC discovery; Instagram authorize live |
| GitHub, HubSpot, X | authorize endpoints live (GitHub → login redirect) |
| Zoom, Spotify, Shopify | discovery + fake-client rejections (Zoom: "Invalid client_id") |

**Sourced** means every step and capability cites the provider's docs (listed per guide). **Uncertain** means review turnaround times that providers don't publish (Slack total, HubSpot listing, Meta, LinkedIn vetting, Microsoft Partner verification, Salesforce review fee). These are marked in the UI and listed in each guide's "Uncertain" panel.

## How live generation works

`POST /api/generate {q}` streams NDJSON events to the UI:

1. **Composio directory check** (public toolkit page, managed-auth status, FAQ).
2. **Web research** with citations: Gemini + Google Search grounding if `GEMINI_API_KEY` is set; otherwise Vercel AI Gateway (`perplexity/sonar`) via the deployment's OIDC token.
3. **Live probes** on the resolved domain: RFC 8414 / OIDC discovery across likely hosts, developer-portal reachability, and a fake-client authorize call.
4. **Read the official pages** (top 3 cited, ranked by domain match) and extract the relevant excerpts.
5. **Structure** into the shared schema (`lib/types.ts`) with a strict system prompt (tiers, evidence rules, Composio callback URL). Output is normalised and validated with zod, with one repair retry.

Each call has a retry with backoff and falls through to the next model. If no model is reachable, the Composio check and probes still run and the UI says why.

**Persistence without a database:** a generated guide is compressed into its share URL (`/guide/<slug>#g=…`), so links never die. It's also cached per server instance and in the visitor's localStorage. Repeat lookups of library apps are instant.

## How it scales to 100 (and stays right)

1. **Batch generation** with the same agent and schema (`scripts/batch-offline.ts` shows the shape), committed as static JSON (`data/generated/`).
2. **Human spot-check** before a guide is promoted from *generated* to *curated*. Evidence badges show the reviewer exactly what to check.
3. **Freshness loop:** re-run probes weekly, re-research monthly, and diff the claims. Watch provider changelogs; 2026 alone brought Salesforce ECAs, X pay-per-use, Slack's 10-install bar and Spotify's 5-user dev mode.
4. **Outcome data:** developers mark steps done and report real review times, which turns estimates into observed data.

## What I'd build next

- Show the guide inline in the Composio dashboard when a toolkit needs a custom auth config, with the callback URL pre-filled.
- Browser-agent autopilot for the agent-owned steps (create the client, set redirect URIs) with the user signed in and in control.
- Review-status tracking: "submitted" starts a countdown, with an overdue nudge and a drafted follow-up.
- Track dynamic client registration (MCP-style) providers. For agents, "create an OAuth app" may disappear entirely for some providers.

## Known limitations

- Timelines are estimates unless the provider publishes them, and they're labelled.
- Generated guides aren't human-reviewed (badge shown).
- Probes are unauthenticated by design. "Tested" means the endpoints and directory behave as described, not that a full app was approved.
- No shared database yet. Generated guides live in their URL, the instance cache and localStorage.

## Run locally

```bash
npm install
GEMINI_API_KEY=... npm run dev     # or AI_GATEWAY_API_KEY=...
npx tsx scripts/probe-seeds.ts     # refresh Tested evidence for curated guides
npx tsx scripts/batch-offline.ts   # rebuild batch guides + probes
```

Env: `GEMINI_API_KEY` (optional; enables Gemini + Google Search grounding), `GEMINI_MODEL` (comma-separated fallbacks, default `gemini-flash-latest,gemini-2.5-flash,gemini-3-flash`), `AI_GATEWAY_API_KEY` (optional; on Vercel the OIDC token is used automatically), `GL_RESEARCH_MODEL`, `GL_STRUCT_MODELS`.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · zod · Vercel (sin1).
