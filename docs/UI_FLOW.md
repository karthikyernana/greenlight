# UI flow (v4)

Three places, nothing else: **Home** (command bar → Your apps → board), **Guide**, **Trace**. The setup kit is a sheet over the guide.

**Home (`/`).**
- One command bar (autofocus; `/` or ⌘K from anywhere). Typing swaps the board for a results list: library apps, stored guides (with their badge, "Already investigated · opens instantly"), "Did you mean X?" for near misses, and **Investigate "…"** only when nothing matches. A sentence ("drafts replies in my users' Gmail") shows a "Read as" line; Enter plans exactly that.
- **Your apps**: pinned guides, then recently viewed, kept in this browser. Hidden until there is something. Pin/unpin on the tile or on the guide.
- **Board**: one list in a panel. Filter `Ready / On demand / All`, sort `Fastest / A–Z` (segmented controls with a sliding thumb). Columns: App, What stands in the way (one line, ellipsis, full text on hover), Time to live (default / worst), Composio, Guide badge. Below 768 px each row is two lines: name + time, then the gate. Rows glide to their new order on filter/sort (FLIP).

**Guide (`/guide/<slug>?need=…&who=team&scale=small&biz=no`).**
- Above the fold: breadcrumb and actions (Pin, Copy link, Setup kit), the app name with its badge (Curated / Verified by checks / Draft · agent-generated), checked date and Re-check (generated guides), the verdict sentence with fact dots, then the chips and only the toggles that change the answer.
- One panel: four numbers (tween to the new value on change) and the runway (Agent / You / Provider lanes on a log time scale; bars glide when the plan recomputes; click a bar to open that step).
- One panel of progressive sections, each opening with a spring: Faster paths, Why it takes this long, Steps (expand a step inline; checklist saved in this browser; rows FLIP when steps are added/removed), Evidence (+ Publishing checks for generated guides), If you get stuck, Run trace.
- A Draft shows a one-line amber notice under the verdict; expand it for the failed checks.
- Mobile: actions move to a glass bar at the bottom; the setup kit opens as a bottom sheet.

**Investigation (unknown app).** The same page: name, an "Investigating" badge, one sentence, then a panel with a progress hairline and five lanes (Scout, Scopes, Gates, Prober, Verifier). Facts tick in (two lines max, full text on hover); the Verifier lane shows downgrades and corrections. When the graph lands, the guide fills in and the lanes fold into "How this plan was found". The finished guide is stored, so the next person gets it instantly.

**Trace (`/trace/<id>`).** Stages, model calls, tool calls, decisions, each in its own panel; wide tables scroll inside their panel on small screens. Traces are stored with the guide, so they open from any instance.

**Motion.** Real spring curves (`lib/spring.ts`, compiled to CSS `linear()`), 150–350 ms: FLIP for list reorders, height springs for expand/collapse, number tweening, a sliding segmented thumb, the setup-kit sheet, a glass toast, and a shared-element transition (View Transitions API) from a board row's name to the guide title. No bounce, no confetti. `prefers-reduced-motion` turns all of it off.

**Overflow rules.** Every grid cell is `min-width: 0`; one-line cells ellipsize with the full text in `title`; long URLs and code wrap anywhere; wide tables scroll inside their panel. Checked at 1440 px and 390 px (and down to 375 px).
