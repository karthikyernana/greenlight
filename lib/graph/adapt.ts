import type { Guide } from "../types";
import type { ProviderGraph } from "./schema";

const BACK: Record<string, Guide["capabilities"][number]["tier"]> = { none: "self_serve", sensitive: "review", restricted: "restricted", partner: "partner", paid: "paid" };

/** Sources list for a graph: every distinct fact URL, in first-use order. */
export function graphSources(gr: ProviderGraph) {
  const out: { title: string; url: string }[] = [];
  for (const f of gr.facts) if (f.url && f.status !== "tested" && !out.some((s) => s.url === f.url)) out.push({ title: f.title || f.url, url: f.url });
  return out;
}

/** v2-shaped view of a graph (setup kit, OG image). Step requiredFor is derived from capability → gate → step links. */
export function graphToGuide(gr: ProviderGraph): Guide {
  const sources = graphSources(gr);
  const req = (sid: string) => gr.capabilities.filter((c) => c.steps.includes(sid) || c.gates.some((gid) => gr.gates.find((x) => x.id === gid)?.steps.includes(sid))).map((c) => c.id);
  const ev = (ids: string[]) => {
    const st = ids.map((i) => gr.facts.find((f) => f.id === i)?.status);
    return st.includes("tested") ? "tested" : st.includes("sourced") ? "sourced" : "uncertain";
  };
  const srcIdx = (ids: string[]) => [...new Set(ids.map((i) => sources.findIndex((s) => s.url === gr.facts.find((f) => f.id === i)?.url)).filter((n) => n >= 0))];
  return {
    slug: gr.slug, name: gr.name, domain: gr.domain, category: gr.category, summary: gr.summary, console: gr.console, appType: gr.appType,
    composio: { managed: gr.composio.managed, slug: gr.composio.slug, note: gr.composio.note, evidence: "tested" },
    capabilities: gr.capabilities.map((c) => ({ id: c.id, label: c.label, scopes: c.scopes.map((s) => s.name), tier: BACK[c.tier], why: c.why, default: c.default, evidence: ev(c.facts) as any, sources: srcIdx(c.facts) })),
    steps: gr.steps.map((s) => ({ id: s.id, title: s.title, detail: s.detail, owner: s.owner, agent: s.agent, human: s.human, activeMinutes: s.effortMin, waitDays: s.wait, after: s.dependsOn, requiredFor: s.base ? [] : req(s.id), link: s.link, cost: s.cost, evidence: ev(s.facts) as any, sources: srcIdx(s.facts) })),
    launchToday: gr.context.launchToday, rejections: gr.context.rejections, blockers: gr.context.blockers, uncertain: gr.context.uncertain,
    probes: gr.probes, sources, verifiedAt: gr.verifiedAt, checks: gr.checks, origin: gr.origin, model: gr.model,
  };
}
