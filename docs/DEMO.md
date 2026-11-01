# Demo script (3 minutes, v4.1)

**Before recording.** Open https://oauth-greenlight-v2.vercel.app in a clean browser window at 1440 px, zoom 100%. Pick the live app now: an app that is **not** already in `https://oauth-greenlight-v2.vercel.app/api/store` (e.g. Asana or Typeform; Pipedrive, Miro, Webflow and Todoist are already stored and would open instantly). Check `/api/status` shows `"any": true`. Have a second browser (or an incognito window) ready for the share-link check.

**0:00 · The problem (20 s) — Home.**
> "Getting an OAuth client ID takes five minutes. Getting approved so your agent's users can connect can take a day or two months, and the scopes you ask for decide which. Greenlight works out that path, cites every number, and tells you what to start today."
Point at the board: 100 apps, the ready ones sorted by wait, badges Curated / Verified / Draft.

**0:20 · Say what the agent does (25 s).** Click the command bar, type `agent that triages my users' Gmail and drafts replies`. Point at "Read as: Gmail · Read email · Draft replies". Press **Enter**.

**0:45 · The verdict (35 s) — Gmail guide.**
> "Five weeks to two months, because gmail.readonly is restricted, which means a paid CASA security assessment."
Hover one of the three evidence dots after the verdict: the verbatim quote from Google's page appears. Point at the four numbers (wait, hands-on, steps, "Agent can prepare 6 of 8"), then the runway: Agent / You / Provider lanes, orange = critical path, "LIVE BY ≈" date.

**1:20 · Change the need (30 s).** Tick **Read email** off and **Send email only** on: the wait drops to 12 days–3 weeks (sensitive scope: brand + scope verification, no CASA). Click **Who connects → My team**: live today (internal Workspace apps skip verification). Click **Public** again.

**1:50 · What to do next (20 s).** Open **Faster paths**: "Composio's approved app: users connect today", and the Gmail add-on path with its trade-off. Open **Steps**, expand step 06: the Agent / You split. Click **Setup kit**: redirect URIs, scope justification, demo-video shot list, coding-agent handoff. Close it.

**2:10 · An app nobody researched (40 s).** Click the header search, type the live app (e.g. `Asana`), press **Enter**.
> "Five agents: Scout finds the official docs and checks Composio, Scopes and Gates read them in parallel, Prober tests the OAuth endpoints live, and the Verifier checks every quote against the page it came from."
Narrate the lanes as they tick (a run takes about 70–100 s; keep talking over the lanes). When the guide lands, point at the **Draft · agent-generated** badge and the "Not yet verified" note if shown, then open **Evidence** (Tested / Sourced / Uncertain).
If it is slow: open `/guide/pipedrive` (generated live on 2026-11-02 in 83 s) and its **Run trace**.

**2:50 · Share and close (10 s).** Click **Copy link**, paste it in the second browser: the same guide opens instantly, no new run.
> "It's generated once and shared with everyone. Managed auth is the launch-today path; when a developer needs their own app, Greenlight makes that path concrete instead of scary."
