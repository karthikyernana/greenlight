/* Integration: every API route handler, called with real Request objects. Model and retrieval are replaced by the
   deterministic fake pipeline (GREENLIGHT_FAKE_PIPELINE=1); the store runs with Blob absent (memory) and with a
   mocked Blob backend. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { POST as generatePOST } from "../app/api/generate/route";
import { GET as guideGET } from "../app/api/guide/[slug]/route";
import { GET as statusGET } from "../app/api/status/route";
import { GET as traceGET } from "../app/api/trace/[id]/route";
import { GET as storeGET } from "../app/api/store/route";
import { _setBackend, type Backend } from "../lib/store";

process.env.GREENLIGHT_FAKE_PIPELINE = "1";
process.env.GREENLIGHT_FAKE_STEP_MS = "1";
for (const k of ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "BLOB_READ_WRITE_TOKEN"]) delete process.env[k];

function blobLike(): { b: Backend; m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, b: { kind: "blob", async get(p) { return m.get(p) ?? null; }, async put(p, x) { m.set(p, x); }, async list(pre) { return [...m.keys()].filter((k) => k.startsWith(pre)); } } };
}
let ipN = 0;
async function gen(body: unknown) {
  const res = await generatePOST(new Request("http://t/api/generate", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ipN}` }, body: JSON.stringify(body) }));
  assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  const text = await res.text();
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const types = (ev: any[]) => ev.map((e) => e.type);
const ctx = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => _setBackend(null)); // fresh memory store between tests? memory map is global; use unique app names per test

test("POST /api/generate: empty query → invalid error", async () => {
  const ev = await gen({ q: "  " });
  assert.deepEqual(types(ev), ["error"]);
  assert.equal(ev[0].code, "invalid");
});

test("POST /api/generate: library app is served with no pipeline run", async () => {
  const ev = await gen({ q: "Gmail" });
  assert.deepEqual(types(ev), ["cached", "graph"]);
  assert.equal(ev[0].source, "library");
});

test("POST /api/generate: unknown app streams lanes → graph → trace → published, then the next request is cached", async () => {
  const ev = await gen({ q: "Acmebooks" });
  const t = types(ev);
  for (const k of ["stage", "fact", "correction", "graph", "trace", "published"]) assert.ok(t.includes(k), k);
  assert.ok(t.indexOf("graph") < t.indexOf("published"));
  const pub = ev.find((e) => e.type === "published");
  assert.equal(pub.store, "memory");
  assert.equal(pub.publish.status, "draft"); // 4/5 quotes = 80% but fake gate facts are uncertain in the base graph
  const again = await gen({ q: "acmebooks.com" });
  assert.deepEqual(types(again), ["cached", "graph", "published"]);
  assert.ok(!types(again).includes("stage"), "no investigation");
});

test("POST /api/generate: pipeline failure surfaces as an error event and stores nothing", async () => {
  const ev = await gen({ q: "Brokenapp __fail" });
  assert.equal(ev.at(-1).type === "error" || ev.some((e) => e.type === "error"), true);
  assert.ok(!ev.some((e) => e.type === "published"));
  const r = await guideGET(new Request("http://t/api/guide/brokenapp-fail"), ctx({ slug: "brokenapp-fail" }));
  assert.equal(r.status, 404);
});

test("POST /api/generate: Re-check inside the cooldown returns a notice and the stored guide", async () => {
  await gen({ q: "Cooldownly" });
  const ev = await gen({ q: "Cooldownly", fresh: true });
  assert.equal(ev[0].type, "notice");
  assert.ok(types(ev).includes("graph") && !types(ev).includes("stage"));
});

test("POST /api/generate: typo of a library app redirects instead of generating", async () => {
  const ev = await gen({ q: "Hubspt" });
  assert.deepEqual(types(ev), ["redirect"]);
  assert.equal(ev[0].slug, "hubspot");
});

test("GET /api/guide: library 200, stored 200 with source=store, missing 404", async () => {
  const lib = await guideGET(new Request("http://t/api/guide/gmail?need=read&who=team"), ctx({ slug: "gmail" }));
  assert.equal(lib.status, 200);
  const j = await lib.json();
  assert.equal(j.source, "library");
  assert.equal(j.publish.status, "curated");
  assert.ok(j.plan.steps.length > 0);
  await gen({ q: "Storedapp" });
  const st = await (await guideGET(new Request("http://t/api/guide/storedapp"), ctx({ slug: "storedapp" }))).json();
  assert.equal(st.source, "store");
  const miss = await guideGET(new Request("http://t/api/guide/nope-nope"), ctx({ slug: "nope-nope" }));
  assert.equal(miss.status, 404);
});

test("GET /api/status: store memory without token, blob with a (mocked) Blob backend; never a key", async () => {
  process.env.GROQ_API_KEY = "sk-int-secret-77";
  try {
    const s = await (await statusGET()).json();
    assert.equal(s.store.mode, "memory");
    assert.equal(s.store.shared, false);
    assert.ok(Array.isArray(s.fallbackOrder) && s.fallbackOrder.length === 4);
    assert.equal(s.groq.configured, true);
    assert.ok(!JSON.stringify(s).includes("sk-int-secret-77"));
    _setBackend(blobLike().b);
    const s2 = await (await statusGET()).json();
    assert.equal(s2.store.mode, "blob");
    assert.equal(s2.store.shared, true);
  } finally { delete process.env.GROQ_API_KEY; }
});

test("Blob present (mocked): a guide written by one instance is read by a fresh one; trace too", async () => {
  const blob = blobLike();
  _setBackend(blob.b);
  const ev = await gen({ q: "Blobly" });
  const tid = ev.find((e) => e.type === "trace").trace.id;
  assert.ok(blob.m.has("guides/blobly.json") && blob.m.has(`traces/${tid}.json`));
  // new instance: cache reset, in-process trace map cleared
  (globalThis as any).__glTraces?.clear();
  _setBackend(blob.b);
  const again = await gen({ q: "Blobly" });
  assert.equal(again[0].type, "cached");
  const tr = await traceGET(new Request(`http://t/api/trace/${tid}`), ctx({ id: tid }));
  assert.equal(tr.status, 200);
  const list = await (await storeGET()).json();
  assert.ok(list.guides.some((g: any) => g.slug === "blobly"));
});

test("GET /api/trace: in-memory trace 200, unknown 404, unsafe id 404", async () => {
  const ev = await gen({ q: "Traceapp" });
  const tid = ev.find((e) => e.type === "trace").trace.id;
  assert.equal((await traceGET(new Request("http://t"), ctx({ id: tid }))).status, 200);
  assert.equal((await traceGET(new Request("http://t"), ctx({ id: "zzzzzz" }))).status, 404);
  assert.equal((await traceGET(new Request("http://t"), ctx({ id: "../etc" }))).status, 404);
});
