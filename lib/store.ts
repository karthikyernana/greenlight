/* Shared guide store: generate once, reuse for everyone.
   - Vercel Blob when the project has a Blob store connected (guides/<slug>.json, traces/<id>.json). Auth is either
     BLOB_READ_WRITE_TOKEN, or Vercel OIDC with BLOB_STORE_ID (what "Connect store" sets up on newer projects; the SDK
     reads the function's OIDC token itself);
   - otherwise this server instance's memory (what v3 did), and /api/status says so.
   A stored guide is served with zero model calls. It is re-investigated only when it is older than 30 days
   (STALE_DAYS) or someone presses Re-check, and Re-check is rate-limited per app (RECHECK_COOLDOWN_MIN). */
import { ProviderGraph } from "./graph/schema";
import type { Trace } from "./pipeline/trace";
import { normaliseOwner } from "./engine";
import { publishVerdict, withSourceCheck, type PublishVerdict } from "./publish";
import { canonicalSlug, sameApp } from "./canonical";

export const STALE_DAYS = 30;
export const RECHECK_COOLDOWN_MIN = 10;

export type StoredGuide = {
  v: 1;
  slug: string;
  /** names, domain and anything typed that resolved here; used for fuzzy matching */
  keys: string[];
  graph: ProviderGraph;
  publish: PublishVerdict;
  storedAt: string;
  /** last time an investigation for this app started (cooldown for Re-check) */
  lastRunAt: string;
  runs: number;
  traceId?: string;
};
export type StoredSummary = Pick<StoredGuide, "slug" | "keys" | "storedAt" | "traceId"> & { name: string; domain: string; status: PublishVerdict["status"]; managed: ProviderGraph["composio"]["managed"]; composioSlug?: string };

/** Storage backend. Small on purpose so tests can fake it. */
export type Backend = {
  kind: "blob" | "memory";
  get(path: string): Promise<string | null>;
  put(path: string, body: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
};

function memoryBackend(): Backend {
  const g = globalThis as unknown as { __glStore?: Map<string, string> };
  const m = (g.__glStore ??= new Map());
  return {
    kind: "memory",
    async get(p) { return m.get(p) ?? null; },
    async put(p, b) { m.set(p, b); },
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
  };
}

function blobBackend(token: string | undefined): Backend {
  // Blob stores are public or private; the store's own setting wins. Try BLOB_ACCESS (default public) and flip once.
  let access: "public" | "private" = process.env.BLOB_ACCESS === "private" ? "private" : "public";
  const flipOn = (e: unknown) => /access|private|public/i.test(String((e as Error)?.message || e));
  const sdk = () => import("@vercel/blob");
  return {
    kind: "blob",
    async get(p) {
      const { get } = await sdk();
      const read = async () => {
        const r = await get(p, { access, token, useCache: false });
        if (!r || !r.stream) return null;
        return await new Response(r.stream).text();
      };
      try { return await read(); } catch (e) {
        if (/not.?found|404/i.test(String((e as Error)?.message))) return null;
        if (!flipOn(e)) throw e;
        access = access === "public" ? "private" : "public";
        try { return await read(); } catch (e2) { if (/not.?found|404/i.test(String((e2 as Error)?.message))) return null; throw e2; }
      }
    },
    async put(p, b) {
      const { put } = await sdk();
      const write = () => put(p, b, { access, token, addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
      try { await write(); } catch (e) {
        if (!flipOn(e)) throw e;
        access = access === "public" ? "private" : "public";
        await write();
      }
    },
    async list(prefix) {
      const { list } = await sdk();
      const out: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 5; i++) {
        const r = await list({ prefix, token, cursor, limit: 1000 });
        out.push(...r.blobs.map((b) => b.pathname));
        if (!r.hasMore || !r.cursor) break;
        cursor = r.cursor;
      }
      return out;
    },
  };
}

let override: Backend | null = null;
/** Tests swap the backend. */
export function _setBackend(b: Backend | null) { override = b; cacheReset(); }

export function backend(): Backend {
  if (override) return override;
  const token = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (token) return blobBackend(token);
  if ((process.env.BLOB_STORE_ID || "").trim()) return blobBackend(undefined); // OIDC
  return memoryBackend();
}

export function storeStatus() {
  const b = backend();
  return b.kind === "blob"
    ? { mode: "blob" as const, shared: true, auth: (process.env.BLOB_READ_WRITE_TOKEN || "").trim() ? "token" : "oidc", note: "Vercel Blob: generated guides are shared by every visitor and every server instance." }
    : { mode: "memory" as const, shared: false, note: "No Blob store connected (neither BLOB_READ_WRITE_TOKEN nor BLOB_STORE_ID is set): generated guides are kept in this server instance's memory only (lost on cold start, not shared across instances). Create a Blob store on the Vercel project to share them." };
}

/** Can we actually reach the store? (a real list call; errors are reported as text, never credentials) */
export async function storeHealth(): Promise<{ reachable: boolean; error?: string }> {
  try { await backend().list("guides/"); return { reachable: true }; }
  catch (e) { return { reachable: false, error: String((e as Error)?.message || e).replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "[token]").slice(0, 160) }; }
}

/* Per-instance read cache, so a busy guide is one Blob read per minute per instance. */
const g = globalThis as unknown as { __glStoreCache?: Map<string, { at: number; v: StoredGuide | null }>; __glListCache?: { at: number; v: StoredSummary[] } };
const rc = (g.__glStoreCache ??= new Map());
const CACHE_MS = 60_000;
function cacheReset() { rc.clear(); g.__glListCache = undefined; }

const guidePath = (slug: string) => `guides/${slug}.json`;
const tracePath = (id: string) => `traces/${id}.json`;

/** Stored guides withdrawn from the store, with why. They stop resolving (board, command bar, /guide/<slug>, API)
    without touching the blob, so this is reversible. A withdrawn name that is typed again goes through the input gate. */
export const RETIRED: Record<string, string> = {
  capiclan: "Not a product: investigated before the input gate existed (2026-11-01), and the agent built a Google guide for it.",
};

function parseRecord(raw: string | null): StoredGuide | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const gr = ProviderGraph.safeParse(j.graph);
    if (!gr.success) return null;
    if (RETIRED[canonicalSlug(j.slug || gr.data.slug)]) return null;
    const graph = { ...gr.data, steps: gr.data.steps.map((st) => ({ ...st, owner: normaliseOwner(st) })) };
    return { ...j, graph, publish: j.publish ? withSourceCheck(j.publish, graph) : j.publish };
  } catch { return null; }
}

export async function getStored(slug: string, opts: { fresh?: boolean } = {}): Promise<StoredGuide | null> {
  const key = canonicalSlug(slug);
  const hit = rc.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  try {
    const v = parseRecord(await backend().get(guidePath(key)));
    rc.set(key, { at: Date.now(), v });
    return v;
  } catch { return hit?.v ?? null; }
}

export function summarize(r: StoredGuide): StoredSummary {
  return { slug: r.slug, keys: r.keys, storedAt: r.storedAt, traceId: r.traceId, name: r.graph.name, domain: r.graph.domain, status: r.publish.status, managed: r.graph.composio.managed, composioSlug: r.graph.composio.slug };
}

export async function listStored(): Promise<StoredSummary[]> {
  const lc = g.__glListCache;
  if (lc && Date.now() - lc.at < CACHE_MS) return lc.v;
  try {
    const paths = (await backend().list("guides/")).filter((p) => p.endsWith(".json")).slice(0, 200);
    const recs = await Promise.all(paths.map((p) => getStored(p.replace(/^guides\/|\.json$/g, ""))));
    const v = recs.filter(Boolean).map((r) => summarize(r!));
    g.__glListCache = { at: Date.now(), v };
    return v;
  } catch { return lc?.v ?? []; }
}

/** Is there already a stored guide for what the user typed? Exact canonical slug first, then fuzzy (name/domain/aliases). */
export async function findStored(q: string): Promise<{ rec: StoredGuide; score: number } | null> {
  const exact = await getStored(canonicalSlug(q));
  if (exact) return { rec: exact, score: 1 };
  let best: { s: StoredSummary; score: number } | null = null;
  for (const s of await listStored()) {
    const score = sameApp(q, [s.slug, s.name, s.domain, ...s.keys]);
    if (score >= 0.8 && (!best || score > best.score)) best = { s, score };
  }
  if (!best) return null;
  const rec = await getStored(best.s.slug);
  return rec ? { rec, score: best.score } : null;
}

export const ageDays = (iso: string, now = Date.now()) => (now - Date.parse(iso)) / 86_400_000;
export const isStale = (r: Pick<StoredGuide, "storedAt">, now = Date.now()) => ageDays(r.storedAt, now) > STALE_DAYS;
/** Minutes until a Re-check is allowed (0 = now). A stale guide can always be re-checked. */
export function recheckWaitMin(r: Pick<StoredGuide, "storedAt" | "lastRunAt">, now = Date.now()): number {
  if (isStale(r, now)) return 0;
  const since = (now - Date.parse(r.lastRunAt || r.storedAt)) / 60_000;
  return since >= RECHECK_COOLDOWN_MIN ? 0 : Math.ceil(RECHECK_COOLDOWN_MIN - since);
}

/** Record that an investigation started (so two people pressing Re-check don't both spend model calls). */
/* Cross-instance run lock: a small blob per app, so two developers asking for the same new app on different server
   instances share one investigation. Best effort (read-then-write, no compare-and-swap); a lock older than
   RUN_LOCK_MS is ignored, so a crashed run can't block an app. */
export const RUN_LOCK_MS = 300_000;
const lockPath = (slug: string) => `locks/${canonicalSlug(slug)}.json`;
export async function claimRun(slug: string, id: string, now = Date.now()): Promise<{ ok: true } | { ok: false; since: number }> {
  try {
    const raw = await backend().get(lockPath(slug));
    if (raw) {
      const j = JSON.parse(raw) as { id?: string; at?: number };
      if (j.id !== id && j.at && now - j.at < RUN_LOCK_MS) return { ok: false, since: j.at };
    }
    await backend().put(lockPath(slug), JSON.stringify({ id, at: now }));
  } catch { /* store unreachable: fall back to the per-instance guard */ }
  return { ok: true };
}
export async function releaseRun(slug: string, id: string) {
  try {
    const raw = await backend().get(lockPath(slug));
    if (raw && (JSON.parse(raw) as { id?: string }).id !== id) return;
    await backend().put(lockPath(slug), JSON.stringify({ id, at: 0 }));
  } catch { /* ignore */ }
}

export async function markRunStarted(slug: string) {
  const r = await getStored(slug, { fresh: true });
  if (!r) return;
  await saveRecord({ ...r, lastRunAt: new Date().toISOString() });
}

async function saveRecord(r: StoredGuide) {
  await backend().put(guidePath(r.slug), JSON.stringify(r));
  rc.set(r.slug, { at: Date.now(), v: r });
  g.__glListCache = undefined;
}

/** Store a finished investigation. The verdict decides Draft vs Verified; curated graphs are never stored. */
export async function putStored(graph: ProviderGraph, opts: { trace?: Trace; q?: string } = {}): Promise<StoredGuide> {
  const slug = canonicalSlug(graph.slug);
  const prev = await getStored(slug, { fresh: true });
  const v = opts.trace?.verifier;
  const publish = publishVerdict(graph, v ? { checked: v.checked, quoteMatched: v.quoteMatched, unresolved: v.unresolved ?? 0, criticIssues: v.criticIssues } : undefined);
  const now = new Date().toISOString();
  const keys = [...new Set([...(prev?.keys || []), graph.name, graph.domain, opts.q || ""].map((k) => k.trim()).filter(Boolean))].slice(0, 12);
  const rec: StoredGuide = { v: 1, slug, keys, graph: { ...graph, slug }, publish, storedAt: now, lastRunAt: prev?.lastRunAt && prev.lastRunAt > now ? prev.lastRunAt : now, runs: (prev?.runs || 0) + 1, traceId: opts.trace?.id };
  await saveRecord(rec);
  if (opts.trace) await backend().put(tracePath(opts.trace.id), JSON.stringify(opts.trace)).catch(() => {});
  return rec;
}

export async function getStoredTrace(id: string): Promise<Trace | null> {
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  try { const raw = await backend().get(tracePath(id)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
