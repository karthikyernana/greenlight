/* Live-generation pipeline with every network call mocked: no keys, no internet needed. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const MODEL_GUIDE = {
  name: "Calendly", domain: "calendly.com", category: "Scheduling", summary: "Self-serve OAuth.", console: "https://developer.calendly.com",
  appType: "OAuth app",
  capabilities: [
    { id: "read", label: "Read events", scopes: ["scheduled_events:read"], tier: "self_serve", why: "no review", default: true, evidence: "tested", sources: [0, 9] },
    { id: "x", label: "Weird", tier: "bogus" },
  ],
  steps: [
    { id: "a", title: "Create app", detail: "d", owner: "agent", activeMinutes: 10, waitDays: [0, 0], requiredFor: [], evidence: "sourced", sources: [0] },
    { id: "b", title: "Wait", detail: "d", owner: "robot", waitDays: [3], after: ["a"], requiredFor: ["nope"] },
  ],
  launchToday: ["Use Composio"], rejections: ["x"], blockers: [{ problem: "p", fix: "f" }], uncertain: ["u"],
};

let calls: string[] = [];
const realFetch = globalThis.fetch;
function install(handler: (url: string, init: any) => Response | null) {
  calls = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input);
    calls.push(url);
    const r = handler(url, init);
    if (r) return r;
    if (url.includes("docs.composio.dev/toolkits/calendly")) return new Response("<html><body>Authentication Details Composio-managed OAuth available OAuth2</body></html>", { status: 200 });
    if (url.includes("calendly.com/.well-known/oauth-authorization-server")) return Response.json({ issuer: "https://calendly.com", authorization_endpoint: "https://calendly.com/oauth/authorize", registration_endpoint: "https://calendly.com/oauth/register", code_challenge_methods_supported: ["S256"] });
    if (url.startsWith("https://developer.calendly.com")) return new Response("<title>Calendly Developer Docs</title><body>OAuth scopes review redirect API developer</body>", { status: 200 });
    return new Response("nope", { status: 404 });
  }) as any;
}

async function run() {
  const { generateGuide } = await import("../lib/agent");
  const evs: any[] = [];
  for await (const ev of generateGuide("Calendly")) evs.push(ev);
  return evs;
}

beforeEach(() => {
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL"]) delete process.env[k];
  globalThis.fetch = realFetch;
});

test("no model key: live checks still run, then a clear no_model error", async () => {
  install(() => null);
  const evs = await run();
  const err = evs.find((e) => e.type === "error");
  assert.equal(err?.code, "no_model");
  const patches = Object.assign({}, ...evs.filter((e) => e.type === "patch").map((e) => e.patch));
  assert.equal(patches.composio.managed, "available");
  assert.ok(patches.probes.some((p: any) => /dynamic client registration/.test(p.result)));
  assert.ok(!evs.some((e) => e.type === "guide"));
});

test("Gemini path: grounded research, 404 model fallback, output normalised", async () => {
  process.env.GEMINI_API_KEY = "mock";
  let n = 0;
  install((url, init) => {
    if (!url.includes("generativelanguage.googleapis.com")) return null;
    n++;
    if (url.includes("gemini-2.5-flash:") && n === 1) return new Response("gone", { status: 404 });
    const body = JSON.parse(init.body);
    if (body.tools) return Response.json({ candidates: [{ content: { parts: [{ text: "OFFICIAL_DOMAIN: calendly.com\nhttps://developer.calendly.com/getting-started" }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://developer.calendly.com/getting-started", title: "calendly" } }] } }] });
    return Response.json({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(MODEL_GUIDE) + "\n```" }] } }] });
  });
  const evs = await run();
  const g = evs.find((e) => e.type === "guide")?.guide;
  assert.ok(g, JSON.stringify(evs.filter((e) => e.type === "error")));
  assert.equal(g.origin, "generated");
  assert.equal(g.capabilities[1].tier, "review"); // bogus tier clamped
  assert.equal(g.capabilities[0].evidence, "uncertain"); // models can't claim "tested"
  assert.equal(g.steps[1].owner, "both");
  assert.deepEqual(g.steps[1].requiredFor, []);
  assert.match(g.model, /gemini/);
  assert.equal(g.composio.managed, "available");
});

test("Groq path is used when only GROQ_API_KEY is set", async () => {
  process.env.GROQ_API_KEY = "mock";
  install((url, init) => {
    if (!url.includes("api.groq.com")) return null;
    const body = JSON.parse(init.body);
    if (body.response_format) return Response.json({ choices: [{ message: { content: JSON.stringify(MODEL_GUIDE) } }] });
    return Response.json({ choices: [{ message: { content: "OFFICIAL_DOMAIN: calendly.com", executed_tools: [{ search_results: { results: [{ title: "Calendly docs", url: "https://developer.calendly.com/docs" }] } }] } }] });
  });
  const evs = await run();
  const g = evs.find((e) => e.type === "guide")?.guide;
  assert.ok(g);
  assert.match(g.model, /groq/);
  assert.ok(calls.some((c) => c.includes("api.groq.com")));
});

test("OpenRouter path works ungrounded and walks the model list", async () => {
  process.env.OPENROUTER_API_KEY = "mock";
  process.env.OPENROUTER_MODEL = "dead/model:free,live/model:free";
  install((url, init) => {
    if (!url.includes("openrouter.ai")) return null;
    const body = JSON.parse(init.body);
    if (body.model === "dead/model:free") return new Response("no such model", { status: 404 });
    if (body.response_format) return Response.json({ choices: [{ message: { content: JSON.stringify(MODEL_GUIDE) } }] });
    return Response.json({ choices: [{ message: { content: "Calendly docs: https://developer.calendly.com/docs" } }] });
  });
  const evs = await run();
  const g = evs.find((e) => e.type === "guide")?.guide;
  assert.ok(g, JSON.stringify(evs.slice(-3)));
  assert.match(g.model, /openrouter:live\/model:free/);
  const research = evs.find((e) => e.type === "step" && e.id === "research" && e.status === "done");
  assert.match(research.detail, /ungrounded/);
  delete process.env.OPENROUTER_MODEL;
});
