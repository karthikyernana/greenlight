import { gate } from "@/lib/generate";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Input gate for the command bars: is this a real app (or a sentence about one)? Cheap (≤ ~2 s, no model calls).
    GET /api/check?q=… → { ok: true, via, app, slug, href, evidence } | { ok: false, code, message, suggestions } */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const r = await gate(q);
  return Response.json(r, { status: r.ok ? 200 : 422, headers: { "cache-control": r.ok || r.code !== "not_found" ? "public, max-age=60, s-maxage=600" : "no-store" } });
}
