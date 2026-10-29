import { getGuide } from "@/lib/library";
import { headline } from "@/lib/plan";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return Response.json({ error: "not_found", hint: "POST /api/generate {q} to investigate this app" }, { status: 404 });
  const h = headline(g);
  return Response.json({ ...g, headline: { difficulty: h.difficulty.label, wait: h.wait, effort: h.effort, tier: h.tier } });
}
