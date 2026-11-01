import { getGraph } from "@/lib/graph/load";
import { getStored } from "@/lib/store";
import { plan, defaultNeed, cleanCaps } from "@/lib/engine";
import { parseNeed, parseProfile } from "@/lib/urlstate";
import { publishVerdict } from "@/lib/publish";
export const dynamic = "force-dynamic";

/** JSON API: the requirement graph plus the computed plan. /api/guide/gmail?need=read,draft&who=team */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stored = getGraph(slug) ? null : await getStored(slug);
  const g = getGraph(slug) || stored?.graph;
  if (!g) return Response.json({ error: "not in library or store", investigate: `/guide/${slug}?q=${encodeURIComponent(slug)}` }, { status: 404 });
  const u = new URL(req.url);
  const need = { caps: cleanCaps(g, parseNeed(u.searchParams.get("need"))), profile: parseProfile(Object.fromEntries(u.searchParams)) };
  const p = plan(g, need.caps.length ? need : defaultNeed(g));
  return Response.json({
    graph: g, source: stored ? "store" : "library", publish: stored?.publish || publishVerdict(g), storedAt: stored?.storedAt,
    plan: { lead: p.lead, why: p.pole, days: p.days, wait: p.wait, tier: p.tier, steps: p.steps.map((s) => ({ id: s.id, title: s.title, owner: s.owner, wait: s.waitDays, facts: s.facts })), gates: p.gatesHit.map((x) => ({ gate: x.gate.label, because: x.because })), skipped: p.gatesSkipped.map((x) => ({ gate: x.gate.label, reason: x.reason })), suggestions: p.suggestions, toggles: p.toggles },
  });
}
