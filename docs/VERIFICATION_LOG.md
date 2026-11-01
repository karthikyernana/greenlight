# Verification log

Curated graphs, rebuilt 2026-11-01 by `scripts/build-graph.ts`: every source was fetched and every key claim's quote was looked up on the page.

**Totals (10 golden providers):** 89 facts. 38 Tested (live probes), 33 Sourced (quote found verbatim), 18 Uncertain.

## Confirmed with a verbatim quote
| Claim | Source |
|---|---|
| gmail.readonly, gmail.compose and gmail.metadata are restricted; gmail.send is sensitive | developers.google.com/workspace/gmail/api/auth/scopes |
| Gmail add-on scopes that read only the open message are sensitive, not restricted | same page |
| Brand verification 2–3 business days; sensitive scopes 10 business days; restricted 6 weeks incl. security assessment | support.google.com/cloud/answer/13463817 |
| Restricted scopes need an annual security assessment | support.google.com/cloud/answer/13465431 |
| Internal apps for one Workspace organisation don't need verification | support.google.com/cloud/answer/7454865 |
| Unverified apps are limited to 100 new users; the cap is for the project's lifetime and can't be reset | answers 7454865 and 13463817 |
| Microsoft: users in other tenants can't consent to unverified multitenant apps asking for more than sign-in (registered after Nov 8, 2020); the rule doesn't apply inside your own tenant | learn.microsoft.com/…/publisher-verification-overview |
| Slack: 10 active installs held through review; preliminary review ≤10 business days, functional review ≤10 weeks | docs.slack.dev changelog 2026-09-01; review guide |
| HubSpot: 10 allowlisted accounts private, 25 before listing, unlimited after; listing needs 3 active installs | developers.hubspot.com |
| LinkedIn: only Open Permissions need no approval; Community Management starts at Development tier | learn.microsoft.com/linkedin |
| X: billed per resource read / per request written; post read $0.005 | docs.x.com/x-api/getting-started/pricing |
| Notion: installation scope chosen at creation; only "Any workspace" can be listed | developers.notion.com |

## Corrected
| Was | Now |
|---|---|
| Brief suggested "gmail.send + metadata skips CASA" | **Wrong**: gmail.metadata is restricted. The engine's cheaper path is gmail.send (sensitive) for sending, and the Gmail add-on scope (sensitive) for reading the open message. Both quoted. |
| v2: X "a bit more with a link" | $0.20 per post containing a URL (v2 correction, kept) |
| v2: Docusign Go-Live needs 20 API calls | Removed Oct 2025 (v2 correction, kept) |

## Pre-submission audit (2026-11-02)
- **All library source links checked** (142 unique URLs, HEAD then GET with a browser user agent). One was dead: Zoom's "Key concepts" page (404) behind the claim "unpublished apps work inside your own account without review". Replaced with Zoom's Publish page, which says so verbatim ("These apps are intended for internal use and don't require the standard Marketplace review"); the fact moved from Uncertain to Sourced. The other non-200s are bot blocks (Salesforce 403, Shopify dashboard 406, Google Help 429 to a datacenter IP) or OAuth endpoints probed on purpose (authorize URLs answer 400 without a client).
- **Generated guides on the shared store re-read by hand.** Two had been promoted to Verified while built from the wrong company's docs: Zomato (every gate cited Google's OAuth verification pages; Zomato has no public OAuth API) and Google Contacts (a Gmail CASA gate cited from a Nylas page). A fourth publishing check now requires every gate to cite a page on the provider's own domain, and it is applied when stored guides are read, so both are Draft and off the board. "capiclan" (a consultancy, investigated before the input gate existed, built as a Google guide) is withdrawn from the store.
- Google's "~10 business days" for sensitive scopes: the quote came from the JS-rendered FAQ table; a plain fetch of the page now shows only the questions, so it can't be re-checked without a rendering fetch. Still shown, labelled approximate.

## Unverified (stay Uncertain)
- Meta / Instagram official docs return HTTP 400 to non-browser clients. Instagram facts rest on a third-party guide (ugcapi.dev, quoted) and are labelled as such.
- Salesforce help articles are client-rendered; AppExchange security review timing and fee are unquoted.
- Review times nobody publishes: GitHub Marketplace, Notion Marketplace, HubSpot listing, Microsoft Partner Center verification. Kept as our estimates.
- Capability-level claims carried over from v2 without a captured quote (e.g. GitHub scopes need no review) are Uncertain until a phrase is added to the overlay.
- Registering a business (1–4 weeks) is our estimate.

## Live model check
The OpenAI-compatible path was exercised against the JoinGonka gateway on 2026-11-01 (DeepSeek-V4-Flash, GLM-5.3-Flash, MiniMax-M2.7). See HARNESS.md for scores and latency.
