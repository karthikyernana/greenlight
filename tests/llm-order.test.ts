/* Provider order (default Gemini → Groq → LLM_* → OpenRouter, MODEL_ORDER override), provider staggering, and the
   per-run health memory that demotes a provider after a timeout / failure / lost race. fetch is mocked. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { llmJson, RunBudget, providerStatus, providers, modelOrder, DEFAULT_ORDER, providerHedgeMs, modelHedgeMs } from "../lib/llm";

const KEYS = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL", "GROQ_API_KEY", "GROQ_MODEL", "OPENROUTER_API_KEY", "MODEL_ORDER", "LLM_HEDGE_MS", "LLM_PROVIDER_HEDGE_MS", "PROVIDER_HEDGE_MS", "MODEL_HEDGE_MS", "LLM_AUTO_FALLBACK"];
const realFetch = globalThis.fetch;
const S = z.object({ ok: z.boolean() });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const geminiOk = () => Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
const compatOk = () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const who = (u: string) => (u.includes("generativelanguage") ? "gemini" : u.includes("groq.com") ? "groq" : u.includes("openrouter") ? "openrouter" : "llm");
/** fetch that honours the abort signal, like the real one */
const abortable = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); });
});

function allKeys() {
  process.env.LLM_BASE_URL = "https://gate.example/v1"; process.env.LLM_API_KEY = "k1"; process.env.LLM_MODEL = "m1,m2";
  process.env.GEMINI_API_KEY = "k2"; process.env.GROQ_API_KEY = "k3"; process.env.OPENROUTER_API_KEY = "k4";
  process.env.LLM_AUTO_FALLBACK = "0";
}
beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
afterEach(() => { globalThis.fetch = realFetch; for (const k of KEYS) delete process.env[k]; });

test("default order is Gemini → Groq → LLM_* → OpenRouter, and /api/status reports it", () => {
  allKeys();
  assert.deepEqual(DEFAULT_ORDER, ["gemini", "groq", "llm", "openrouter"]);
  assert.deepEqual(providers().map((p) => p.id), ["gemini", "groq", "llm", "openrouter"]);
  const s = providerStatus();
  assert.deepEqual(s.order, ["gemini", "groq", "llm", "openrouter"]);
  assert.equal(s.orderFrom, "default");
  assert.equal(s.primary?.id, "gemini");
  assert.equal(s.fallbackOrder.length, 4);
  assert.ok(!/"k[1-4]"/.test(JSON.stringify(s)), "never echoes a key");
});

test("MODEL_ORDER overrides; aliases work; unlisted configured providers are still tried, last; junk is ignored", () => {
  allKeys();
  process.env.MODEL_ORDER = "llm, Gemini ,groq";
  assert.deepEqual(providers().map((p) => p.id), ["llm", "gemini", "groq", "openrouter"]);
  assert.equal(providerStatus().orderFrom, "MODEL_ORDER");
  process.env.MODEL_ORDER = "openrouter,bogus,google";
  const mo = modelOrder();
  assert.deepEqual(mo.order, ["openrouter", "gemini", "groq", "llm"]);
  assert.deepEqual(mo.ignored, ["bogus"]);
  assert.deepEqual(providerStatus().orderIgnored, ["bogus"]);
  process.env.MODEL_ORDER = "nonsense";
  assert.equal(modelOrder().from, "default");
});

test("only configured providers appear, in order", () => {
  process.env.LLM_BASE_URL = "https://gate.example/v1"; process.env.LLM_API_KEY = "k1"; process.env.LLM_MODEL = "m1";
  process.env.GROQ_API_KEY = "k3";
  assert.deepEqual(providers().map((p) => p.id), ["groq", "llm"]);
});

test("the slow gateway gets shorter hedges than the others; env overrides", () => {
  assert.ok(providerHedgeMs({ id: "llm" }) < providerHedgeMs({ id: "gemini" }));
  assert.ok(modelHedgeMs({ id: "llm" }) < modelHedgeMs({ id: "gemini" }));
  process.env.LLM_PROVIDER_HEDGE_MS = "5000"; process.env.LLM_HEDGE_MS = "3000";
  assert.equal(providerHedgeMs({ id: "llm" }), 5000);
  assert.equal(modelHedgeMs({ id: "llm" }), 3000);
});

test("default order: a call goes to Gemini first and never touches the gateway when Gemini answers", async () => {
  allKeys();
  const seen: string[] = [];
  globalThis.fetch = (async (u: any) => { seen.push(who(String(u))); return String(u).includes("generativelanguage") ? geminiOk() : compatOk(); }) as any;
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: new RunBudget(10_000) });
  assert.equal(r.provider, "gemini");
  assert.deepEqual([...new Set(seen)], ["gemini"]);
});

test("staggering: a slow first provider is overtaken by the next one after the provider hedge", async () => {
  process.env.MODEL_ORDER = "llm,gemini";
  process.env.LLM_BASE_URL = "https://gate.example/v1"; process.env.LLM_API_KEY = "k1"; process.env.LLM_MODEL = "m1"; process.env.LLM_AUTO_FALLBACK = "0";
  process.env.GEMINI_API_KEY = "k2";
  globalThis.fetch = (async (u: any, init?: any) => {
    if (who(String(u)) === "llm") { await abortable(2000, init?.signal); return compatOk(); }
    return geminiOk();
  }) as any;
  const b = new RunBudget(10_000);
  const t0 = Date.now();
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: b, providerHedgeMs: 60, hedgeMs: 1000 });
  assert.equal(r.provider, "gemini");
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0}ms`);
  assert.equal(b.healthOf("llm").slow, 1, "the gateway lost the race");
});

test("health memory: a provider that timed out is demoted for the rest of the run (next call skips straight past it)", async () => {
  process.env.MODEL_ORDER = "llm,gemini";
  process.env.LLM_BASE_URL = "https://gate.example/v1"; process.env.LLM_API_KEY = "k1"; process.env.LLM_MODEL = "m1"; process.env.LLM_AUTO_FALLBACK = "0";
  process.env.GEMINI_API_KEY = "k2";
  const seen: string[] = [];
  globalThis.fetch = (async (u: any, init?: any) => {
    seen.push(who(String(u)));
    if (who(String(u)) === "llm") { await abortable(5000, init?.signal); return compatOk(); }
    return geminiOk();
  }) as any;
  const b = new RunBudget(10_000);
  // call 1: the gateway times out (tiny per-call timeout), Gemini answers
  const r1 = await llmJson({ stage: "a", system: "s", user: "u", schema: S, budget: b, timeoutMs: 40, providerHedgeMs: 10_000, hedgeMs: 10_000 });
  assert.equal(r1.provider, "gemini");
  assert.ok(b.healthOf("llm").timeouts >= 1);
  assert.ok(b.demoted("llm"));
  // call 2 in the same run: Gemini is tried first now
  seen.length = 0;
  const r2 = await llmJson({ stage: "b", system: "s", user: "u", schema: S, budget: b, timeoutMs: 40, providerHedgeMs: 10_000, hedgeMs: 10_000 });
  assert.equal(r2.provider, "gemini");
  assert.equal(seen[0], "gemini");
  assert.ok(!seen.includes("llm"));
  // a fresh run starts with the configured order again
  assert.deepEqual(new RunBudget().order(providers()).map((p) => p.id), ["llm", "gemini"]);
});

test("health memory: an outright failure (402) demotes too; all providers failing gives one clear error", async () => {
  allKeys();
  globalThis.fetch = (async () => new Response('{"error":"Insufficient balance"}', { status: 402 })) as any;
  const b = new RunBudget(10_000);
  await assert.rejects(llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: b, hedgeMs: 5, providerHedgeMs: 5 }), /All models failed/);
  for (const id of ["gemini", "groq", "llm", "openrouter"]) assert.ok(b.demoted(id), id);
});

test("a cancellation (another provider won) is not counted as a timeout", async () => {
  process.env.MODEL_ORDER = "llm,gemini";
  process.env.LLM_BASE_URL = "https://gate.example/v1"; process.env.LLM_API_KEY = "k1"; process.env.LLM_MODEL = "m1"; process.env.LLM_AUTO_FALLBACK = "0";
  process.env.GEMINI_API_KEY = "k2";
  globalThis.fetch = (async (u: any, init?: any) => {
    if (who(String(u)) === "llm") { await abortable(3000, init?.signal); return compatOk(); }
    await sleep(5);
    return geminiOk();
  }) as any;
  const b = new RunBudget(10_000);
  await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: b, providerHedgeMs: 20 });
  await sleep(20);
  assert.equal(b.healthOf("llm").timeouts, 0);
});
