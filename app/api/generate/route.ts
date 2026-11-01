import { investigate } from "@/lib/pipeline/run";
import { getGraph, putGraph } from "@/lib/graph/load";
import { slugify } from "@/lib/urlstate";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

/** NDJSON stream of pipeline events: stage, fact, correction, graph, trace, error. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const q = String(body.q || "").trim().slice(0, 120);
  const enc = new TextEncoder();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "anon";
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (!q) { send({ type: "error", code: "invalid", message: "Type an app name or website." }); return; }
        const slug = body.slug ? String(body.slug) : slugify(q);
        const cached = getGraph(slug);
        if (cached && !body.fresh) { send({ type: "graph", graph: cached, cached: true }); return; }
        if (limited(ip)) { send({ type: "error", code: "invalid", message: "Limit reached: 20 investigations per hour. Ready guides still work." }); return; }
        for await (const ev of investigate(q, { composioSlug: body.composioSlug ? String(body.composioSlug) : undefined })) {
          if (ev.type === "graph") {
            const g = { ...ev.graph, slug };
            putGraph(g);
            send({ type: "graph", graph: g });
          } else send(ev);
        }
      } catch (e: any) {
        send({ type: "error", code: "model_down", message: `Unexpected error: ${String(e?.message || e).slice(0, 200)}` });
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
