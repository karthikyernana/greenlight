# Rules engine

`lib/engine.ts`. Pure TypeScript: `plan(graph, need) → Plan`. No model, no I/O, deterministic. 200 recomputes run in well under a second, so every chip tap recomputes in the browser.

**Input.** `need = { caps: string[], profile: { audience: team|public, scale: small|large, business: boolean } }`. Defaults are the honest worst case: public users, more than 100, registered business.

**Steps.**
1. Base steps (registration, redirect URIs) unless a step's `skip` matches the profile.
2. For each selected capability, each of its gates: skipped if a `skip` condition matches (e.g. Google internal apps, ≤100-user unverified path, Meta Standard Access for your own team), otherwise its steps join the plan.
3. A gate with `needsBusiness` and `business = false` adds a "Register a legal business" step in front of it (our estimate, marked Uncertain).
4. Longest-path schedule over the step DAG (`lib/plan.ts`): waits run in parallel unless `dependsOn` says otherwise. Runway = [min, max] days; critical path = chain that sets the max.

**Explanations.** The verdict's "because" is built from the longest wait on the critical path, traced to its gate and the scope that triggered it: `5w–2mo because gmail.readonly is restricted → CASA security assessment`, with the fact ids behind each link. A scope is named only when the graph classifies that scope with its own fact; otherwise the capability is named.

**Faster paths.** Priced by re-running the engine:
- Composio fast lane when Composio runs a managed app (saves the whole runway; trade-off: Composio's name on the consent screen).
- Graph alternatives (e.g. Gmail add-on scope instead of `gmail.readonly`; `gmail.send` instead of drafts). Applicable alternatives are also tried together.
- Dropping one capability, shown only if it saves ≥ 7 days and something worth shipping remains.

**Personalisation chips** appear only when flipping them changes this provider's plan (`relevantToggles`). GitHub and X show none; Gmail shows audience and scale; Outlook and Instagram show audience and business.

Tests: `tests/engine.test.ts` (CASA chain, send vs read, internal skip, 100-user warning, combined alternative, business step, toggle relevance, determinism, every cited fact exists and every Sourced fact has a quote).
