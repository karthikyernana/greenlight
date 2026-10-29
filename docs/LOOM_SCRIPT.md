# Loom demo script (~3 min)

**Before recording:** open https://oauth-greenlight.vercel.app in a clean window, close other tabs, zoom to 110%. Check that live generation works: `/api/status` should show `"any": true` (needs `GEMINI_API_KEY` or a card on file for AI Gateway). Don't pre-generate Calendly. It's the live demo.

---

**0:00–0:20 · The problem (home page)**
> "If you're building an agent that acts on your users' Gmail or Salesforce, you need your own OAuth app approved. Getting a client ID takes five minutes. What nobody tells you is whether you're an hour or eight weeks from real users, and that depends on the scopes you ask for. Greenlight answers that."

Hover the library cards: difficulty, typical wait, worst case, Composio-managed status.

**0:20–0:50 · Easy app: GitHub**
Open GitHub.
> "Easy, same day. Composio already manages this app, so Plan A is to ship today. The only real decision is GitHub App vs OAuth app."
Tick "Listed on Marketplace". The wait jumps to ~3 weeks. Untick.
> "Every number recalculates from what your agent needs."

**0:50–1:50 · Hard app: Gmail (the core insight)**
Open Gmail. Deselect "Read email" and leave only "Sign in with Google".
> "Sign-in: instant, no verification."
Select "Send email only".
> "Sensitive scope: about 10 business days."
Select "Read email".
> "Restricted scope: verification plus a third-party CASA security assessment. Five weeks to two months."
Point at:
- **Plan A, Launch today:** Composio-managed, or testing mode with 100 users whose tokens expire every 7 days. "This is the trap people hit the week after launch."
- **Start the clock today:** domain verification → brand verification → scope review → CASA.
- **Critical path:** black = your effort, striped = waiting on Google.
- One step: the **Agent / You** split, the evidence badge, the source link.
- **What we know:** Tested probes (the discovery doc, fake-client authorize), Uncertain items, sources.
Click **Hand off to a coding agent**:
> "This copies a prompt that does the agent half and stops at anything that needs a human: signing in, legal docs, payment, clicking Submit."

**1:50–2:40 · Unfamiliar app, live: Calendly (or whatever the interviewer names)**
Type "Calendly" in search → "Investigate with the agent".
Narrate the steps as they stream in:
> "It checks Composio's directory, researches the docs with citations, probes Calendly's OAuth endpoints live (discovery, a fake-client authorize call), reads the official pages, then writes the guide in the same schema."
When it renders:
> "Same scope picker, same evidence rules. It's marked agent-generated and not human-reviewed. The URL now carries the guide itself, so this link works for anyone, permanently."
Click **Copy link**.

**2:40–3:00 · Why this matters for Composio**
> "Composio-managed auth is the launch-today answer for 72 of the 100 OAuth toolkits. The guide also says exactly when to bring your own app: HubSpot's unverified warning, X being dropped, LinkedIn's scope conflicts. Next steps: show it inside the Composio dashboard when a toolkit needs a custom auth config, and track real review times so the estimates turn into data."

---

**Backup if live generation is down:** open Zoom or Shopify (batch-generated), show the "agent-generated" badge, and explain the pipeline from `/why`.
