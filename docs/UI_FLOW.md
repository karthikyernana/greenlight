# UI flow

**Landing (`/`).** One command bar. Type an app to filter the board; type a sentence and a "Read as" line shows how it was parsed (app, capabilities, audience, scale, business). Enter opens the plan with all of that in the URL.

**Guide (`/guide/<slug>?need=…&who=team&scale=small&biz=no`).** Above the fold, and nothing else:
- Verdict: what you picked, how long until real users can connect, and why (fact dots on hover show the quote).
- Chips: capabilities, then only the personalisation toggles that change this provider's answer.
- Runway: four numbers (count up on change) and three lanes, Agent / You / Provider, on a log time scale. Bars glide to their new place on every change (~260ms); hatching = provider wait between likely and worst case.

Folded below: Faster paths (with "Use this"), Why it takes this long (or why there's no wait), Steps (checklist saved on the device), Evidence (every fact the plan relies on, with quote, source and status), If you get stuck, Run trace (generated guides).

**Investigation (unknown app).** Five lanes: Scout, Scopes, Gates, Prober, Verifier. Facts tick in as they're found; the Verifier lane shows downgrades and corrections, and struck-through facts in the other lanes. When the graph arrives, the same guide layout replaces the skeleton and the lanes fold into "How this plan was found".

**Setup kit.** Drawer with redirect URIs, scope list, justification text, privacy checklist, demo-video shot list, a provider email and a coding-agent handoff, built from the current plan.

Motion respects `prefers-reduced-motion`. Jargon (CASA, scope, DCR, Publisher verification, critical path…) has a dotted underline and a plain definition on hover or focus.
