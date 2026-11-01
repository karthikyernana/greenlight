/* What /api/generate does, without the HTTP: serve from the library or the shared store when possible (zero model
   calls), otherwise investigate, then store the result with its publishing verdict. */
import { investigate, type PipeEvent, type RunOpts } from "./pipeline/run";
import { getGraph, GRAPHS } from "./graph/load";
import { canonicalSlug, sameApp } from "./canonical";
import { findStored, getStored, isStale, markRunStarted, putStored, recheckWaitMin, storeStatus, type StoredGuide } from "./store";
import { publishVerdict } from "./publish";
import type { ProviderGraph } from "./graph/schema";
import type { Trace } from "./pipeline/trace";
import { fakeInvestigate } from "./pipeline/fake";

export type GenEvent =
  | PipeEvent
  | { type: "redirect"; slug: string; name: string; reason: string }
  | { type: "cached"; source: "library" | "store"; storedAt?: string; stale?: boolean; recheckInMin?: number }
  | { type: "notice"; message: string }
  | { type: "published"; publish: StoredGuide["publish"]; storedAt: string; store: "blob" | "memory" };

export type GenBody = { q?: string; slug?: string; composioSlug?: string; fresh?: boolean };

const hits = new Map<string, number[]>();
const gi = globalThis as unknown as { __glInflight?: Map<string, Promise<void>> };
const inflight = (gi.__glInflight ??= new Map());
export function ipLimited(ip: string, max = 20) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

export function storedEvents(rec: StoredGuide): GenEvent[] {
  return [
    { type: "cached", source: "store", storedAt: rec.storedAt, stale: isStale(rec), recheckInMin: recheckWaitMin(rec) },
    { type: "graph", graph: rec.graph },
    { type: "published", publish: rec.publish, storedAt: rec.storedAt, store: storeStatus().mode },
  ];
}

export async function* generate(body: GenBody, opts: { ip?: string; run?: RunOpts; investigateImpl?: typeof investigate } = {}): AsyncGenerator<GenEvent> {
  const q = String(body.q || "").trim().slice(0, 120);
  if (!q) { yield { type: "error", code: "invalid", message: "Type an app name or website." }; return; }
  const slug = canonicalSlug(body.slug || q);

  // 1. hand-researched or shipped guide
  const lib = getGraph(slug);
  if (lib) { yield { type: "cached", source: "library" }; yield { type: "graph", graph: lib }; return; }
  if (!body.fresh) {
    const near = GRAPHS.map((g) => ({ g, s: sameApp(q, [g.slug, g.name, g.domain, g.composio.slug || ""]) })).filter((x) => x.s >= 0.8).sort((a, b) => b.s - a.s)[0];
    if (near) { yield { type: "redirect", slug: near.g.slug, name: near.g.name, reason: `${near.g.name} is already in the library` }; return; }
  }

  // 2. shared store: exact slug, then fuzzy
  const found = body.fresh ? (await getStored(slug, { fresh: true })) : (await findStored(q))?.rec || (body.slug ? await getStored(body.slug) : null);
  if (found && !body.fresh) {
    if (found.slug !== slug) { yield { type: "redirect", slug: found.slug, name: found.graph.name, reason: `${found.graph.name} was already investigated` }; return; }
    for (const e of storedEvents(found)) yield e;
    return;
  }
  if (found && body.fresh) {
    const wait = recheckWaitMin(found);
    if (wait > 0) {
      yield { type: "notice", message: `${found.graph.name} was checked a few minutes ago. Re-check opens again in ${wait} min; here is the stored guide.` };
      for (const e of storedEvents(found)) yield e;
      return;
    }
    await markRunStarted(found.slug).catch(() => {});
  }

  // 3. investigate (one run per app per instance: a second request waits for the first and gets the stored result)
  const running = inflight.get(slug);
  if (running) {
    yield { type: "notice", message: "Someone is already investigating this app. Waiting for that run instead of starting another." };
    await running.catch(() => {});
    const rec = await getStored(slug, { fresh: true });
    if (rec) { for (const e of storedEvents(rec)) yield e; return; }
  }
  if (opts.ip && ipLimited(opts.ip)) { yield { type: "error", code: "invalid", message: "Limit reached: 20 investigations per hour. Stored guides still load." }; return; }
  let graph: ProviderGraph | null = null;
  let trace: Trace | undefined;
  let release!: () => void;
  inflight.set(slug, new Promise<void>((r) => (release = r)));
  try {
  const impl = opts.investigateImpl || (process.env.GREENLIGHT_FAKE_PIPELINE === "1" ? (fakeInvestigate as unknown as typeof investigate) : investigate);
  for await (const ev of impl(q, { ...(opts.run || {}), composioSlug: body.composioSlug ? String(body.composioSlug) : opts.run?.composioSlug })) {
    if (ev.type === "graph") {
      graph = { ...ev.graph, slug };
      yield { type: "graph", graph };
      // provisional verdict right away (Draft until the trace's verifier numbers are in)
    } else if (ev.type === "trace") {
      trace = ev.trace;
      yield ev;
    } else yield ev;
  }
  if (graph) {
    try {
      const rec = await putStored(graph, { trace, q });
      yield { type: "published", publish: rec.publish, storedAt: rec.storedAt, store: storeStatus().mode };
    } catch (e: any) {
      const v = trace?.verifier;
      yield { type: "published", publish: publishVerdict(graph, v ? { checked: v.checked, quoteMatched: v.quoteMatched, unresolved: v.unresolved ?? 0 } : undefined), storedAt: new Date().toISOString(), store: storeStatus().mode };
      yield { type: "notice", message: `Guide built but not stored: ${String(e?.message || e).slice(0, 120)}` };
    }
  }
  } finally {
    inflight.delete(slug);
    release();
  }
}
