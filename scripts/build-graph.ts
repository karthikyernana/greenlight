/* One-off migration, kept for provenance: v2 guides (data/seeds.ts + data/generated) + scripts/graph-overlays.ts
   → data/graph/<slug>.json (schema greenlight.graph/1). Quotes are pulled verbatim from the cached source pages.
   Run: npx tsx scripts/build-graph.ts   (fetches sources into scripts/.cache on first run) */
import { writeFileSync, mkdirSync } from "node:fs";
import { seeds } from "../data/seeds";
import generated from "../data/generated/index.json";
import { Guide } from "../lib/types";
import { ProviderGraph, type Fact, type ReviewTier, type GateKind } from "../lib/graph/schema";
import { extractQuote } from "../lib/quote";
import { fetchCached } from "./fetch-sources";
import { overlays, type OFact } from "./graph-overlays";

const TODAY = "2026-11-01";
const tierMap: Record<string, ReviewTier> = { instant: "none", self_serve: "none", review: "sensitive", restricted: "restricted", partner: "partner", paid: "paid" };
const kindByTier: Record<ReviewTier, GateKind> = { none: "app_review", sensitive: "app_review", restricted: "security_assessment", partner: "partner_program", paid: "payment" };

async function resolveFact(f: OFact, title: string): Promise<Fact> {
  const page = await fetchCached(f.url);
  let quote = "";
  if (page.status === 200 && f.find) {
    if (f.to) {
      const t = page.text.replace(/\s+/g, " ");
      const a = t.toLowerCase().indexOf(f.find.toLowerCase());
      const b = a < 0 ? -1 : t.toLowerCase().indexOf(f.to.toLowerCase(), a);
      if (a >= 0 && b > a && b - a < 1400) quote = t.slice(a, b + f.to.length);
    } else quote = extractQuote(page.text, f.find);
  }
  return {
    id: f.id, claim: f.claim, url: f.url, title, quote, checked: TODAY,
    status: quote ? (f.status || "sourced") : "uncertain",
    note: quote ? undefined : page.status === 200 ? "Quote not found on the page: wording changed or claim not supported" : `Source not fetchable (HTTP ${page.status || "error"}; JS-rendered or blocks bots)`,
  };
}

async function convert(raw: unknown, origin: "curated" | "generated") {
  const g = Guide.parse(raw);
  const ov = overlays[g.slug];
  const srcTitle = (url: string) => g.sources.find((s) => s.url === url)?.title || (url.includes("composio") ? `Composio: ${g.name} toolkit` : url.replace(/^https?:\/\//, "").slice(0, 60));
  const facts: Fact[] = [];
  for (const f of ov?.facts || []) facts.push(await resolveFact(f, srcTitle(f.url)));

  // capabilities: v2 "why" + first cited source becomes a fact; the quote is only kept if the overlay found one
  const caps = [...g.capabilities.map((c) => ({ id: c.id, label: c.label, scopes: c.scopes, tier: tierMap[c.tier], why: c.why, default: c.default, src: c.sources[0], facts: [] as string[] })),
    ...(ov?.addCaps || []).map((c) => ({ ...c, default: false, src: undefined as number | undefined, facts: c.facts || [] }))];
  const capOut = caps.map((c) => {
    const capFacts = [...(ov?.capFacts?.[c.id] || []), ...c.facts];
    if (!capFacts.length && c.src !== undefined && g.sources[c.src]) {
      const id = `cap-${c.id}`;
      facts.push({ id, claim: `${c.label}: ${c.why}`, url: g.sources[c.src].url, title: g.sources[c.src].title, quote: "", checked: g.verifiedAt, status: "uncertain", note: "Cited in hand research; no verbatim quote captured yet" });
      capFacts.push(id);
    }
    return {
      id: c.id, label: c.label, keywords: ov?.keywords?.[c.id] || c.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3),
      scopes: c.scopes.map((s) => ({ name: s, tier: ov?.scopeTier?.[s] ?? c.tier, facts: ov?.scopeTier?.[s] !== undefined ? capFacts.slice(0, 1) : [] })),
      tier: c.tier, why: c.why, default: c.default, gates: [] as string[], steps: [] as string[], facts: [...new Set(capFacts)],
    };
  });

  // gates
  let gates = (ov?.gates || []).map((x) => ({ id: x.id, kind: x.kind, label: x.label, plain: x.plain, steps: x.steps, skip: (x.skip || []).map((s) => ({ ...s, facts: s.facts || [] })), needsBusiness: !!x.needsBusiness, cap: x.cap, facts: x.facts || [], caps: x.caps }));
  if (!ov) {
    // generated guides: one gate per distinct set of capability-gated steps that carries a provider-side wait
    const byKey = new Map<string, { steps: string[]; caps: string[]; tier: ReviewTier }>();
    for (const c of capOut) {
      const st = g.steps.filter((s) => s.requiredFor.includes(c.id)).map((s) => s.id);
      if (!st.length || c.tier === "none") continue;
      const k = st.join(",");
      const e = byKey.get(k) || { steps: st, caps: [], tier: c.tier };
      e.caps.push(c.id);
      byKey.set(k, e);
    }
    gates = [...byKey.values()].map((e, i) => {
      const first = g.steps.find((s) => s.id === e.steps[e.steps.length - 1])!;
      return { id: `gate-${i + 1}`, kind: kindByTier[e.tier], label: first.title.replace(/\s*\(.*\)$/, ""), plain: "", steps: e.steps, skip: [], needsBusiness: false, cap: undefined, facts: [], caps: e.caps };
    });
  }
  for (const gt of gates) for (const cid of gt.caps) capOut.find((c) => c.id === cid)?.gates.push(gt.id);
  const gated = new Set(gates.flatMap((x) => x.steps));

  const steps = g.steps.map((s) => {
    const sf = [...(ov?.stepFacts?.[s.id] || [])];
    if (!sf.length && s.sources[0] !== undefined && g.sources[s.sources[0]] && s.waitDays[1] > 0) {
      const id = `wait-${s.id}`;
      facts.push({ id, claim: `${s.title}: ${s.waitDays[0]}–${s.waitDays[1]} days provider-side`, url: g.sources[s.sources[0]].url, title: g.sources[s.sources[0]].title, quote: "", checked: g.verifiedAt, status: "uncertain", note: s.evidence === "uncertain" ? "Our estimate: the provider doesn't publish this wait" : "Cited in hand research; no verbatim quote captured yet" });
      sf.push(id);
    }
    if (!gated.has(s.id) && s.requiredFor.length) for (const r of s.requiredFor) capOut.find((c) => c.id === r)?.steps.push(s.id);
    return {
      id: s.id, title: s.title, detail: s.detail, owner: s.owner, agent: s.agent, human: s.human, effortMin: s.activeMinutes, wait: s.waitDays,
      dependsOn: s.after, base: !gated.has(s.id) && !s.requiredFor.length, link: s.link, cost: s.cost, facts: sf,
      skip: (ov?.stepSkip?.[s.id] || []).map((x) => ({ ...x, facts: x.facts || [] })),
    };
  });

  // probes become tested facts too
  g.probes.forEach((p, i) => facts.push({ id: `probe-${i + 1}`, claim: `${p.label}: ${p.result}`, url: p.url, title: p.label, quote: p.result, checked: p.at, status: "tested" }));

  const out = ProviderGraph.parse({
    slug: g.slug, name: g.name, domain: g.domain, category: g.category, console: g.console, appType: g.appType, summary: g.summary,
    composio: { managed: g.composio.managed, slug: g.composio.slug, note: g.composio.note, facts: ov?.composioFacts || [] },
    capabilities: capOut, gates: gates.map(({ caps: _c, ...x }) => x), steps,
    alternatives: (ov?.alternatives || []).map((a) => ({ ...a, facts: a.facts || [] })),
    facts, context: { launchToday: g.launchToday, rejections: g.rejections, blockers: g.blockers, uncertain: g.uncertain },
    probes: g.probes, checks: g.checks, origin, verifiedAt: origin === "curated" ? TODAY : g.verifiedAt, model: g.model,
  });
  return out;
}

async function main() {
  mkdirSync("data/graph", { recursive: true });
  const index: { slug: string; name: string; origin: string; facts: number; sourced: number; tested: number; uncertain: number }[] = [];
  for (const [raw, origin] of [...seeds.map((s) => [s, "curated"] as const), ...(generated as unknown[]).map((s) => [s, "generated"] as const)]) {
    const gr = await convert(raw, origin);
    writeFileSync(`data/graph/${gr.slug}.json`, JSON.stringify(gr, null, 1) + "\n");
    const c = (st: string) => gr.facts.filter((f) => f.status === st).length;
    index.push({ slug: gr.slug, name: gr.name, origin, facts: gr.facts.length, sourced: c("sourced"), tested: c("tested"), uncertain: c("uncertain") });
    for (const f of gr.facts) if (f.status === "uncertain" && overlays[gr.slug]?.facts.some((o) => o.id === f.id)) console.log(`MISS ${gr.slug}/${f.id}: ${f.note}`);
  }
  writeFileSync("data/graph/index.json", JSON.stringify({ schema: "greenlight.graph/1", version: 1, built: TODAY, providers: index }, null, 1) + "\n");
  console.table(index);
}
main();
