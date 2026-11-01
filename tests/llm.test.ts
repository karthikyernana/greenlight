/* OpenAI-compatible provider path with fetch mocked: JSON mode, fallback when response_format is rejected,
   reasoning_content ignored, zod repair round, model fallback, budget. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { llmJson, RunBudget, providerStatus } from "../lib/llm";

const realFetch = globalThis.fetch;
let seen: any[] = [];
function mock(responder: (body: any, n: number) => Response) {
  seen = [];
  globalThis.fetch = (async (_u: any, init?: any) => { const b = JSON.parse(init.body); seen.push(b); return responder(b, seen.length); }) as any;
}
const ok = (content: string, extra: any = {}) => Response.json({ choices: [{ message: { content, ...extra } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const S = z.object({ tier: z.enum(["none", "restricted"]), n: z.number() });

beforeEach(() => {
  globalThis.fetch = realFetch;
  process.env.LLM_BASE_URL = "https://gate.example/v1";
  process.env.LLM_API_KEY = "sk-unit-secret-9f3";
  process.env.LLM_MODEL = "deepseek-ai/DeepSeek-V4-Flash,zai-org/GLM-5.3-Flash";
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];
});

test("/api/status reports the LLM_* provider as primary", () => {
  const s = providerStatus();
  assert.equal(s.primary?.id, "llm");
  assert.equal(s.primary?.model, "deepseek-ai/DeepSeek-V4-Flash");
  assert.equal(s.primary?.host, "gate.example");
  assert.ok(!JSON.stringify(s).includes("sk-unit-secret-9f3")); // never echoes the key
});

test("JSON mode, think blocks and reasoning_content are handled", async () => {
  mock(() => ok('<think>restricted?</think>{"tier":"restricted","n":2}', { reasoning_content: "long chain of thought {\"tier\":\"none\"}" }));
  const b = new RunBudget(10_000);
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: b });
  assert.deepEqual(r.data, { tier: "restricted", n: 2 });
  assert.equal(seen[0].response_format.type, "json_object");
  assert.equal(b.used, 120);
});

test("endpoint rejects response_format → retried without it", async () => {
  mock((body) => (body.response_format ? new Response("unsupported response_format", { status: 400 }) : ok('{"tier":"none","n":1}')));
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: new RunBudget() });
  assert.equal(r.data.tier, "none");
  assert.equal(seen.length, 2);
});

test("invalid output gets exactly one repair round", async () => {
  mock((_b, n) => (n === 1 ? ok('{"tier":"secret","n":"x"}') : ok('{"tier":"none","n":3}')));
  const b = new RunBudget();
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: b });
  assert.equal(r.data.n, 3);
  assert.match(seen[1].messages[1].content, /previous answer was invalid/);
  assert.equal(b.calls[0].repaired, true);
});

test("first model keeps failing → next model in LLM_MODEL", async () => {
  mock((body) => (body.model.startsWith("deepseek") ? new Response("overloaded", { status: 503 }) : ok('{"tier":"none","n":1}')));
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: new RunBudget() });
  assert.equal(r.model, "zai-org/GLM-5.3-Flash");
});

test("budget stops a run before it overspends", async () => {
  mock(() => ok('{"tier":"none","n":1}'));
  await assert.rejects(llmJson({ stage: "t", system: "s".repeat(40_000), user: "u", schema: S, budget: new RunBudget(2000) }), /budget/i);
});

test("hedging: a slow first model is overtaken by the next one, which wins", async () => {
  globalThis.fetch = (async (u: any, init?: any) => {
    if (String(u).endsWith("/models")) return Response.json({ data: [] });
    const b = JSON.parse(init.body);
    if (b.model.startsWith("deepseek")) await new Promise((r) => setTimeout(r, 400));
    return ok(b.model.startsWith("deepseek") ? '{"tier":"restricted","n":1}' : '{"tier":"none","n":2}');
  }) as any;
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: new RunBudget(), hedgeMs: 50 });
  assert.equal(r.model, "zai-org/GLM-5.3-Flash");
});

test("endpoint's other models are discovered and used as fallbacks", async () => {
  process.env.LLM_MODEL = "only-model";
  globalThis.fetch = (async (u: any, init?: any) => {
    if (String(u).endsWith("/models")) return Response.json({ data: [{ id: "only-model" }, { id: "spare-model", architecture: { modality: "text->text" } }] });
    const b = JSON.parse(init.body);
    return b.model === "only-model" ? new Response("down", { status: 503 }) : ok('{"tier":"none","n":5}');
  }) as any;
  const r = await llmJson({ stage: "t", system: "s", user: "u", schema: S, budget: new RunBudget() });
  assert.equal(r.model, "spare-model");
});
