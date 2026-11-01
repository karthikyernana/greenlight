/* v4: generate once / reuse for everyone, publishing policy, command-bar matching, shelf, model fallback order. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { canonicalSlug, sameApp } from "../lib/canonical";
import { publishVerdict, gateFactIds } from "../lib/publish";
import { _setBackend, putStored, getStored, storeStatus, recheckWaitMin, isStale, type Backend } from "../lib/store";
import { generate, type GenEvent } from "../lib/generate";
import { getGraph } from "../lib/graph/load";
import type { ProviderGraph } from "../lib/graph/schema";
import type { Trace } from "../lib/pipeline/trace";
import { commandRows } from "../lib/command";
import { libraryIndex } from "../lib/library";
import { withPin, withVisit, isPinned } from "../lib/shelf";
import { llmJson, RunBudget, providerStatus } from "../lib/llm";

function fakeBackend(kind: Backend["kind"] = "memory") {
  const m = new Map<string, string>();
  const calls = { get: 0, put: 0, list: 0 };
  const b: Backend = {
    kind,
    async get(p) { calls.get++; return m.get(p) ?? null; },
    async put(p, body) { calls.put++; m.set(p, body); },
    async list(prefix) { calls.list++; return [...m.keys()].filter((k) => k.startsWith(prefix)); },
  };
  return { b, m, calls };
}

/** A generated graph for an app that is not in the library (Xero), built from a shipped one. */
function xero(over: Partial<ProviderGraph> = {}): ProviderGraph {
  const base = structuredClone(getGraph("dropbox")!);
  return { ...base, slug: "xero", name: "Xero", domain: "developer.xero.com", origin: "generated", ...over };
}
const trace = (v: Partial<Trace["verifier"]> = {}): Trace => ({
  id: "t" + Math.random().toString(36).slice(2, 8), q: "Xero", app: "Xero", startedAt: new Date().toISOString(), ms: 1000, stages: [], tools: [], llm: [],
  tokens: { prompt: 10, completion: 5, budget: 100 }, models: ["mock:m"], outcome: "ok",
  verifier: { checked: 10, quoteMatched: 9, downgraded: 1, corrected: 0, recheckRounds: 0, criticIssues: 0, unresolved: 0, ...v },
});
async function collect(it: AsyncGenerator<GenEvent>) { const out: GenEvent[] = []; for await (const e of it) out.push(e); return out; }

let fb = fakeBackend();
beforeEach(() => { fb = fakeBackend(); _setBackend(fb.b); delete process.env.BLOB_READ_WRITE_TOKEN; });

test("canonical slug: name, domain, URL, subdomain and 'API' suffix are one key", () => {
  for (const s of ["Dropbox", "dropbox.com", "https://www.dropbox.com/developers", "Dropbox API", "developers.dropbox.com", "DROPBOX"]) assert.equal(canonicalSlug(s), "dropbox", s);
  assert.equal(canonicalSlug("api.xero.co.uk"), "xero");
  assert.equal(canonicalSlug("Google Calendar"), "google-calendar");
});

test("fuzzy same-app: one typo in a short name, two in a long one, not unrelated apps", () => {
  assert.equal(sameApp("dropbx", ["dropbox"]), 0.8);
  assert.equal(sameApp("quickbooks onlin", ["QuickBooks Online"]), 0.8);
  assert.equal(sameApp("xero.com", ["Xero", "developer.xero.com"]), 1);
  assert.ok(sameApp("zoom", ["xero"]) < 0.8);
  assert.ok(sameApp("box", ["dropbox"]) < 0.8);
});

test("publishing: verified only when quotes ≥ 80%, no unresolved contradiction, every gate fact backed", () => {
  const g = xero();
  for (const f of g.facts) if (f.status === "uncertain") f.status = "sourced";
  assert.equal(publishVerdict(g, { checked: 10, quoteMatched: 8, unresolved: 0 }).status, "verified");
  const lowQuotes = publishVerdict(g, { checked: 10, quoteMatched: 7, unresolved: 0 });
  assert.equal(lowQuotes.status, "draft");
  assert.match(lowQuotes.failed[0], /7\/10 matched/);
  assert.equal(publishVerdict(g, { checked: 10, quoteMatched: 10, unresolved: 1 }).status, "draft");
  const gateFact = [...gateFactIds(g).values()].flat().find((id) => g.facts.some((f) => f.id === id))!;
  const weak = structuredClone(g);
  weak.facts.find((f) => f.id === gateFact)!.status = "uncertain";
  const v = publishVerdict(weak, { checked: 10, quoteMatched: 10, unresolved: 0 });
  assert.equal(v.status, "draft");
  assert.ok(v.checks.find((c) => c.id === "gates")!.pass === false);
  assert.equal(publishVerdict(getGraph("gmail")!).status, "curated");
});

test("generate once: the second request is served from the store with zero investigations", async () => {
  let runs = 0;
  const impl = async function* (): AsyncGenerator<any> { runs++; yield { type: "graph", graph: xero() }; yield { type: "trace", trace: trace() }; };
  const first = await collect(generate({ q: "Xero" }, { investigateImpl: impl as any }));
  assert.equal(runs, 1);
  const pub = first.find((e) => e.type === "published") as any;
  assert.ok(pub, "published event");
  assert.ok(fb.m.has("guides/xero.json"));
  const second = await collect(generate({ q: "xero.com" }, { investigateImpl: impl as any }));
  assert.equal(runs, 1, "no second investigation");
  assert.equal((second[0] as any).type, "cached");
  assert.ok(second.some((e) => e.type === "graph"));
  // a typo is matched against the store, not regenerated
  const typo = await collect(generate({ q: "Xer0" }, { investigateImpl: impl as any }));
  assert.equal(runs, 1);
  assert.ok(typo.some((e) => e.type === "cached" || e.type === "redirect"));
});

test("survives a new instance: a cold read cache still finds the stored guide (Blob mode)", async () => {
  const blob = fakeBackend("blob");
  _setBackend(blob.b);
  await putStored(xero(), { trace: trace(), q: "Xero" });
  _setBackend(blob.b); // resets the per-instance read cache, like a fresh serverless instance
  const before = blob.calls.get;
  const r = await getStored("xero");
  assert.equal(r?.graph.name, "Xero");
  assert.ok(blob.calls.get > before, "read from the backend, not memory");
  assert.equal(storeStatus().mode, "blob");
});

test("publishing verdict is stored: draft when the verifier misses the bar, listed failure reasons", async () => {
  const rec = await putStored(xero(), { trace: trace({ checked: 10, quoteMatched: 5 }) });
  assert.equal(rec.publish.status, "draft");
  assert.ok(rec.publish.failed.length >= 1);
});

test("re-check is rate-limited per app; stale guides (> 30 days) can always be re-checked", async () => {
  let runs = 0;
  const impl = async function* (): AsyncGenerator<any> { runs++; yield { type: "graph", graph: xero() }; yield { type: "trace", trace: trace() }; };
  await collect(generate({ q: "Xero" }, { investigateImpl: impl as any }));
  const again = await collect(generate({ q: "Xero", fresh: true }, { investigateImpl: impl as any }));
  assert.equal(runs, 1);
  assert.ok(again.some((e) => e.type === "notice"));
  const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
  assert.equal(isStale({ storedAt: old }), true);
  assert.equal(recheckWaitMin({ storedAt: old, lastRunAt: new Date().toISOString() }), 0);
  assert.ok(recheckWaitMin({ storedAt: new Date().toISOString(), lastRunAt: new Date().toISOString() }) > 0);
});

test("library apps are never regenerated, and near-misses redirect to them", async () => {
  let runs = 0;
  const impl = async function* (): AsyncGenerator<any> { runs++; };
  const ev = await collect(generate({ q: "gmail" }, { investigateImpl: impl as any }));
  assert.equal((ev[0] as any).source, "library");
  const near = await collect(generate({ q: "hubspt" }, { investigateImpl: impl as any }));
  assert.equal((near[0] as any).type, "redirect");
  assert.equal(runs, 0);
});

test("no token → memory mode, and /api/status says it is not shared", () => {
  _setBackend(null);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const s = storeStatus();
  assert.equal(s.mode, "memory");
  assert.equal(s.shared, false);
  assert.match(s.note, /BLOB_READ_WRITE_TOKEN/);
});

test("command bar: a stored draft is offered instead of a new investigation", () => {
  const rows = commandRows(libraryIndex(), [{ slug: "xero", name: "Xero", domain: "developer.xero.com", status: "draft" }], "xero.com");
  assert.equal(rows[0].kind, "stored");
  assert.ok(!rows.some((r) => r.kind === "investigate"));
  const unknown = commandRows(libraryIndex(), [], "zzqx unknown app");
  assert.equal(unknown.at(-1)!.kind, "investigate");
});

test("shelf: visits go to recent (deduped, newest first), pin toggles", () => {
  let sh = { pinned: [], recent: [] } as any;
  sh = withVisit(sh, { slug: "gmail", name: "Gmail" }, 1);
  sh = withVisit(sh, { slug: "slack", name: "Slack" }, 2);
  sh = withVisit(sh, { slug: "gmail", name: "Gmail" }, 3);
  assert.deepEqual(sh.recent.map((x: any) => x.slug), ["gmail", "slack"]);
  sh = withPin(sh, { slug: "slack", name: "Slack" }, true);
  assert.ok(isPinned(sh, "slack"));
  sh = withPin(sh, { slug: "slack", name: "Slack" }, false);
  assert.ok(!isPinned(sh, "slack"));
});

test("fallback order: LLM_* out of balance (402) → Gemini with its default model; status reports it", async () => {
  process.env.LLM_BASE_URL = "https://gate.example/v1";
  process.env.LLM_API_KEY = "k1";
  process.env.LLM_MODEL = "m1";
  process.env.GEMINI_API_KEY = "k2";
  delete process.env.GEMINI_MODEL;
  process.env.GROQ_API_KEY = "k3";
  const urls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: any) => {
    urls.push(String(u));
    if (String(u).includes("gate.example")) return new Response('{"error":"Insufficient balance"}', { status: 402 });
    if (String(u).includes("generativelanguage")) return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
    return new Response("no", { status: 500 });
  }) as any;
  try {
    const r = await llmJson({ stage: "t", system: "s", user: "u", schema: z.object({ ok: z.boolean() }), budget: new RunBudget(10_000), hedgeMs: 10 });
    assert.equal(r.provider, "gemini");
    assert.equal(r.model, "gemini-2.5-flash");
    assert.ok(!urls.some((u) => u.includes("groq")), "Groq not needed");
    const s = providerStatus();
    assert.deepEqual(s.order, ["llm", "gemini", "groq"]);
    assert.equal(s.gemini.modelFrom, "default");
  } finally {
    globalThis.fetch = real;
    for (const k of ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "GEMINI_API_KEY", "GROQ_API_KEY"]) delete process.env[k];
  }
});

test("fallback order: Gemini 404 on the first model walks to the next, then Groq when Gemini is down", async () => {
  process.env.GEMINI_API_KEY = "k2";
  process.env.GROQ_API_KEY = "k3";
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (u: any) => {
    seen.push(String(u));
    if (String(u).includes("generativelanguage")) return new Response("not found", { status: 404 });
    if (String(u).includes("groq")) return Response.json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    return new Response("x", { status: 500 });
  }) as any;
  try {
    const r = await llmJson({ stage: "t", system: "s", user: "u", schema: z.object({ ok: z.boolean() }), budget: new RunBudget(10_000), hedgeMs: 10 });
    assert.equal(r.provider, "groq");
    assert.ok(seen.some((u) => u.includes("gemini-2.5-flash")) && seen.some((u) => u.includes("gemini-flash-latest")));
  } finally {
    globalThis.fetch = real;
    delete process.env.GEMINI_API_KEY; delete process.env.GROQ_API_KEY;
  }
});
