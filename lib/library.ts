import { Guide, type IndexEntry } from "./types";
import { seeds } from "@/data/seeds";
import toolkits from "@/data/composio-toolkits.json";
import generatedList from "@/data/generated/index.json";
import { worstCase, headline, gateLabel } from "./plan";

const curated: Guide[] = seeds.map((s) => Guide.parse(s));
const generated: Guide[] = (generatedList as unknown[]).map((g) => Guide.parse(g));

// Runtime cache for guides generated on this instance (also persisted in share URLs + visitor localStorage).
const g = globalThis as unknown as { __glCache?: Map<string, Guide> };
const cache = (g.__glCache ??= new Map<string, Guide>());

export function getGuide(slug: string): Guide | undefined {
  return curated.find((x) => x.slug === slug) || generated.find((x) => x.slug === slug) || cache.get(slug);
}
export function putGuide(guide: Guide) {
  cache.set(guide.slug, guide);
}
export function curatedGuides() {
  return curated;
}

const ALIASES: Record<string, string> = { twitter: "twitter", outlook: "outlook", gmail: "gmail" };

export function libraryIndex(): IndexEntry[] {
  const out: IndexEntry[] = [];
  const seen = new Set<string>();
  for (const c of curated) {
    const h = headline(c);
    const w = worstCase(c);
    out.push({
      slug: c.slug, name: c.name, managed: c.composio.managed, composioSlug: c.composio.slug, category: c.category, curated: true,
      difficulty: h.difficulty.label, wait: h.wait, maxWait: w.wait, waitDays: h.sch.daysMax, worstDays: w.sch.daysMax, gate: gateLabel(c), tags: tagsFor(c),
    });
    seen.add(c.slug);
    if (c.composio.slug) seen.add(c.composio.slug);
  }
  for (const c of generated) {
    if (seen.has(c.slug)) continue;
    const w = worstCase(c);
    const h = headline(c);
    out.push({ slug: c.slug, name: c.name, managed: c.composio.managed, composioSlug: c.composio.slug, category: c.category, generated: true, difficulty: h.difficulty.label, wait: h.wait, maxWait: w.wait, waitDays: h.sch.daysMax, worstDays: w.sch.daysMax, gate: gateLabel(c), tags: tagsFor(c) });
    seen.add(c.slug);
    if (c.composio.slug) seen.add(c.composio.slug);
  }
  for (const t of toolkits as { slug: string; name: string; managed: IndexEntry["managed"] }[]) {
    const slug = ALIASES[t.slug] || t.slug.replace(/_/g, "-");
    if (seen.has(t.slug) || seen.has(slug)) continue;
    out.push({ slug, name: t.name, managed: t.managed, composioSlug: t.slug, category: (t as { category?: string }).category });
    seen.add(slug);
  }
  return out;
}

export function tagsFor(c: Guide): string[] {
  const tiers = new Set(c.capabilities.map((x) => x.tier));
  const tags: string[] = [];
  if (tiers.has("instant") || tiers.has("self_serve")) tags.push("self-serve");
  if (tiers.has("review") || tiers.has("restricted")) tags.push("review");
  if (tiers.has("restricted")) tags.push("security-review");
  if (tiers.has("partner")) tags.push("partner-only");
  if (tiers.has("paid") || c.steps.some((s) => s.cost)) tags.push("paid");
  return tags;
}
