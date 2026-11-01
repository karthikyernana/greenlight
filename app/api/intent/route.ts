import { refineIntent } from "@/lib/intake";
import { intentIndex } from "@/lib/library";
export const dynamic = "force-dynamic";
/** Sentence → app + capabilities. Rules always; Jev when configured. Returns the href the command bar should open. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const q = String(body.q || "").trim().slice(0, 300);
  if (!q) return Response.json({ error: "empty" }, { status: 400 });
  const r = await refineIntent(q, intentIndex());
  return Response.json({ href: r.href, engine: r.engine, caps: r.intent.caps, decisions: r.decisions, error: r.error });
}
