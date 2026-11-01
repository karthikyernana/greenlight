/* What /api/generate does, without the HTTP: serve from the library or the shared store when possible (zero model
   calls), otherwise investigate, then store the result with its publishing verdict. */
import { investigate, type PipeEvent, type RunOpts } from "./pipeline/run";
import { getGraph, GRAPHS } from "./graph/load";
import { canonicalSlug, sameApp } from "./canonical";
import { claimRun, findStored, getStored, isStale, markRunStarted, putStored, recheckWaitMin, releaseRun, storeStatus, type StoredGuide } from "./store";
import { publishVerdict } from "./publish";
import type { ProviderGraph } from "./graph/schema";
import type { Trace } from "./pipeline/trace";
import { fakeInvestigate } from "./pipeline/fake";
import { checkInput, directoryFrom, gibberishReason, normalise, type CheckResult, type Suggestion } from "./validate";
import { libraryIndex, intentIndex } from "./library";
import { listStored } from "./store";

/** The input gate with the server's directory (library + Composio list + shared store). */
export async function gate(q: string): Promise<CheckResult> {
  // Fixture names for the fake pipeline (tests and local e2e only; ignored unless GREENLIGHT_FAKE_PIPELINE=1).
  const allow = process.env.GREENLIGHT_FAKE_PIPELINE === "1" ? (process.env.GREENLIGHT_GATE_ALLOW || "").trim() : "";
  const n = normalise(q);
  if (allow && new RegExp(allow, "i").test(n) && !gibberishReason(n)) return { ok: true, via: "search", q: n, app: n, slug: canonicalSlug(n), href: `/guide/${canonicalSlug(n)}?q=${encodeURIComponent(n)}`, evidence: "test fixture", ms: 0 };
  const stored = await listStored().catch(() => []);
  return checkInput(q, { directory: directoryFrom(libraryIndex()), intents: intentIndex(), stored });
}

export type GenEvent =
  | PipeEvent
  | { type: "redirect"; slug: string; name: string; reason: string }
  | { type: "cached"; source: "library" | "store"; storedAt?: string; stale?: boolean; recheckInMin?: number }
  | { type: "notice"; message: string }
  | { type: "waiting"; message: string }
  | { type: "error"; code: "not_an_app"; message: string; suggestions: Suggestion[]; reason: string }
  | { type: "error"; code: "rate_limited"; message: string; retryInMin: number }
  | { type: "published"; publish: StoredGuide["publish"]; storedAt: string; store: "blob" | "memory" };

export type GenBody = { q?: string; slug?: string; composioSlug?: string; fresh?: boolean };

const hits = new Map<string, number[]>();
const gi = globalThis as unknown as { __glInflight?: Map<string, Promise<void>> };
const inflight = (gi.__glInflight ??= new Map());
export const IP_LIMIT = 20;
/** Sliding hour per IP (per instance). Returns minutes until the next investigation is allowed, or 0 when allowed. */
export function ipLimited(ip: string, max = IP_LIMIT, now = Date.now()): number {
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= max) { hits.set(ip, arr); return Math.max(1, Math.ceil((arr[0] + 3600_000 - now) / 60_000)); }
  arr.push(now);
  hits.set(ip, arr);
  return 0;
}
export function rateLimitMessage(min: number, max = IP_LIMIT) {
  return `You've started ${max} new investigations in the last hour, which is this demo's limit (each one costs model calls). Guides that already exist still open instantly. A new one can start in ${min} min.`;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function storedEvents(rec: StoredGuide): GenEvent[] {
  return [
    { type: "cached", source: "store", storedAt: rec.storedAt, stale: isStale(rec), recheckInMin: recheckWaitMin(rec) },
    { type: "graph", graph: rec.graph },
    { type: "published", publish: rec.publish, storedAt: rec.storedAt, store: storeStatus().mode },
  ];
}

export async function* generate(body: GenBody, opts: { ip?: string; run?: RunOpts; investigateImpl?: typeof investigate; check?: (q: string) => Promise<CheckResult>; waitMs?: number; pollMs?: number } = {}): AsyncGenerator<GenEvent> {
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

  // 2b. input gate: nothing is investigated until the input resolves to a real product (≤ ~2 s, no model calls)
  if (!found) {
    const c = await (opts.check || gate)(q);
    if (!c.ok) { yield { type: "error", code: "not_an_app", message: c.message, suggestions: c.suggestions, reason: c.code }; return; }
  }

  // 3. investigate (one run per app per instance: a second request waits for the first and gets the stored result)
  const running = inflight.get(slug);
  const waitMsg = "Someone else started investigating this app a moment ago. Joining that run instead of starting a second one; the guide appears here when it finishes.";
  if (running) {
    yield { type: "waiting", message: waitMsg };
    await running.catch(() => {});
    const rec = await getStored(slug, { fresh: true });
    if (rec) { for (const e of storedEvents(rec)) yield e; return; }
  }
  if (opts.ip) {
    const min = ipLimited(opts.ip);
    if (min) { yield { type: "error", code: "rate_limited", message: rateLimitMessage(min), retryInMin: min }; return; }
  }
  // same app already running on another server instance: wait for its stored result
  const runId = Math.random().toString(36).slice(2, 10);
  const lock = await claimRun(slug, runId);
  if (!lock.ok) {
    yield { type: "waiting", message: waitMsg };
    const deadline = Date.now() + (opts.waitMs ?? 260_000);
    while (Date.now() < deadline) {
      await sleep(opts.pollMs ?? 4000);
      const rec = await getStored(slug, { fresh: true });
      if (rec && Date.parse(rec.storedAt) >= lock.since - 2000) { for (const e of storedEvents(rec)) yield e; return; }
    }
    yield { type: "error", code: "invalid", message: "The other investigation of this app didn't finish. Retry to start a new one." };
    return;
  }
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
    await releaseRun(slug, runId);
  }
}
