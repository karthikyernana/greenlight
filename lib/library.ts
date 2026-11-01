import type { Guide, IndexEntry } from "./types";
import toolkits from "@/data/composio-toolkits.json";
import { GRAPHS, getGraph, graphToGuide, putGraph } from "./graph/load";
import { plan, defaultNeed, TIER_LABEL } from "./engine";
import { fmtDays } from "./plan";
import type { IntentIndex } from "./intent";
import type { ProviderGraph } from "./graph/schema";

/** v2-shaped guide (setup kit, OG image, JSON API). */
export function getGuide(slug: string): Guide | undefined {
  const g = getGraph(slug);
  return g ? graphToGuide(g) : undefined;
}
export function putGuideGraph(g: ProviderGraph) { putGraph(g); }

const ALIASES: Record<string, string> = { twitter: "twitter", outlook: "outlook", gmail: "gmail" };

function gateText(g: ProviderGraph): string {
  const all = plan(g, { caps: g.capabilities.map((c) => c.id), profile: defaultNeed(g).profile }, { suggestions: false });
  const hit = all.gatesHit.map((x) => x.gate.label);
  return hit.length ? hit.slice(0, 2).join(", ") : all.tier === "paid" ? "Pay per call" : "None";
}

export function libraryIndex(): IndexEntry[] {
  const out: IndexEntry[] = [];
  const seen = new Set<string>();
  for (const g of GRAPHS) {
    const d = plan(g, defaultNeed(g), { suggestions: false });
    const w = plan(g, { caps: g.capabilities.map((c) => c.id), profile: defaultNeed(g).profile }, { suggestions: false });
    out.push({
      slug: g.slug, name: g.name, managed: g.composio.managed, composioSlug: g.composio.slug, category: g.category,
      curated: g.origin === "curated", generated: g.origin === "generated",
      difficulty: TIER_LABEL[d.tier], wait: d.wait, maxWait: fmtDays(w.days[0], w.days[1]), waitDays: d.days[1], worstDays: w.days[1], gate: gateText(g),
    });
    seen.add(g.slug);
    if (g.composio.slug) seen.add(g.composio.slug);
  }
  for (const t of toolkits as { slug: string; name: string; managed: IndexEntry["managed"]; category?: string }[]) {
    const slug = ALIASES[t.slug] || t.slug.replace(/_/g, "-");
    if (seen.has(t.slug) || seen.has(slug)) continue;
    out.push({ slug, name: t.name, managed: t.managed, composioSlug: t.slug, category: t.category });
    seen.add(slug);
  }
  return out;
}

const EXTRA_ALIASES: Record<string, string[]> = { gmail: ["google mail", "gmail api"], outlook: ["microsoft 365", "office 365", "microsoft graph", "outlook mail"], twitter: ["x", "x.com", "twitter"], instagram: ["meta", "ig"], hubspot: ["hub spot"] };

/** Compact index the command bar uses to read a sentence. */
export function intentIndex(): IntentIndex[] {
  const ready = new Map(GRAPHS.map((g) => [g.slug, g]));
  return libraryIndex().map((e) => {
    const g = ready.get(e.slug);
    return {
      slug: e.slug, name: e.name.replace(/\s*\(.*\)$/, ""), aliases: [...(EXTRA_ALIASES[e.slug] || []), ...(e.composioSlug && e.composioSlug !== e.slug ? [e.composioSlug.replace(/_/g, " ")] : [])],
      ready: !!g, composioSlug: e.composioSlug, caps: g ? g.capabilities.map((c) => ({ id: c.id, label: c.label, keywords: c.keywords })) : [],
    };
  });
}
