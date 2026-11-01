# Requirement graph

One JSON file per provider in `data/graph/`, schema `greenlight.graph/1`, validated with zod (`lib/graph/schema.ts`).

```
provider
 ├─ capabilities[]   what an agent needs ("Read email"), keywords for intake, default flag
 │   ├─ scopes[]     exact scope string → review tier (none | sensitive | restricted | partner | paid)
 │   ├─ gates[]      ids of gates this capability triggers
 │   └─ facts[]
 ├─ gates[]          kind: app_review | brand_verification | security_assessment | business_verification |
 │   │               publisher_verification | install_cap | partner_program | payment | admin_approval | marketplace_listing
 │   ├─ steps[]      steps that make up the gate
 │   ├─ skip[]       { when: {audience?, scale?, business?}, reason, facts, warn? }  first match removes the gate
 │   ├─ needsBusiness, cap
 │   └─ facts[]
 ├─ steps[]          owner (agent | you | both), effortMin, wait [min,max] days, dependsOn[], base, skip[], facts[]
 ├─ alternatives[]   replace caps → with caps, label, tradeoff, facts   (priced by the engine)
 ├─ facts[]          { id, claim, url, title, quote, checked, status: tested | sourced | uncertain, note? }
 ├─ composio         managed: available | not_available | unknown, slug, facts
 └─ context          launchToday, rejections, blockers, uncertain (prose, not used by the engine)
```

Rules for facts:
- **Tested**: we ran a public, unauthenticated probe (Composio toolkit page, OIDC discovery, authorize endpoint with a fake client). The quote is the probe result.
- **Sourced**: the quote was found, verbatim, in the fetched page at `url`.
- **Uncertain**: no quote found, page not fetchable, or our own estimate. The note says which.

Curated graphs are built by `scripts/build-graph.ts` from the v2 guides plus `scripts/graph-overlays.ts` (gates, personalisation, alternatives, key facts). The script fetches every source and extracts the quote around a phrase; if the phrase isn't on the page the fact is written as Uncertain. Re-run it to re-check every curated quote: `npx tsx scripts/build-graph.ts`.

Versioning: `schema` and `version` on every file. A breaking schema change bumps `greenlight.graph/N` and the loader refuses old files.
