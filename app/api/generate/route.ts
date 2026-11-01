import { generate } from "@/lib/generate";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** NDJSON stream: cached | redirect | stage | fact | correction | graph | trace | published | notice | error. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const enc = new TextEncoder();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "anon";
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        for await (const ev of generate({ q: body.q, slug: body.slug, composioSlug: body.composioSlug, fresh: !!body.fresh }, { ip })) send(ev);
      } catch (e: any) {
        send({ type: "error", code: "model_down", message: `Unexpected error: ${String(e?.message || e).slice(0, 200)}` });
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
