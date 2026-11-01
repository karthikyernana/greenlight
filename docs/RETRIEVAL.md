# Retrieval

The model never searches. We fetch, and the model reads only what we fetched (`lib/retrieval.ts`).

1. **Search**: Bing HTML (result links decoded from `/ck/a?u=a1<base64>`), DuckDuckGo HTML as fallback. Short query: `<app> OAuth app scopes review verification developer documentation`.
2. **Model pointer** (Scout, in parallel): the model names the official domain and up to 5 doc URLs it believes describe OAuth registration and review. We fetch them; a wrong URL just fails to load.
3. **Conventional hosts**: `developers.<domain>`, `developer.<domain>`, `docs.<domain>`, `<domain>/developers`, `<domain>/docs`.
4. **Composio toolkit page** for the managed-OAuth status.
5. **Passage ranking**: pages are cut into ~700-character passages, scored on OAuth/review vocabulary and day/week numbers, max 4 per page, top 14 go to the specialists (~26k characters).

Known limits, measured on 2026-11-01:
- From datacenter IPs, Bing returns navigational results (sign-in pages, Wikipedia) and DuckDuckGo answers 202 challenges. Search is best effort; the model pointer and conventional hosts carry most investigations.
- JS-rendered docs (Meta's developers.facebook.com returns 400 to non-browsers; Salesforce help is client-rendered) yield no text. Those facts stay Uncertain.
- Probes are public and unauthenticated only: nothing is created, signed into or submitted.
