/* Jev (TypeSafe System One) layer with a mocked HTTP API. No real Jev calls: TYPESAFE_API_KEY here is a dummy. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { jevAsk, jevStatus, jevSupport, jevTiers, JEV_URL } from "../lib/jev";
import { refineIntent } from "../lib/intake";
import { investigate, type PipeEvent } from "../lib/pipeline/run";
import { mockProvider } from "../lib/pipeline/mock";
import type { IntentIndex } from "../lib/intent";

const withKey = async (fn: () => Promise<void>) => {
  const prev = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "test-dummy";
  try { await fn(); } finally { if (prev === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = prev; }
};

/** Fake Jev: answers every question; `pick` decides the value per question. Records the requests. */
function fakeJev(pick: (id: string, q: any, state: any) => any) {
  const calls: any[] = [];
  const f = (async (url: any, init: any) => {
    assert.equal(String(url), JEV_URL);
    assert.match(init.headers.authorization, /^Bearer /);
    const body = JSON.parse(init.body);
    calls.push(body);
    const answers: Record<string, any> = {};
    for (const [id, q] of Object.entries<any>(body.questions)) answers[id] = pick(id, q, body.state);
    return Response.json({ model: "jev-1.14.0", answers, usage: { input_tokens: 100, output_tokens: 5 } });
  }) as typeof fetch;
  return { f, calls };
}

test("jevAsk sends the documented request shape and parses typed answers", async () => {
  await withKey(async () => {
    const { f, calls } = fakeJev(() => ({ type: "noul", noul: 0.91 }));
    const r = await jevAsk("state text", { q1: { type: "noul", instructions: "Is it?" } }, { fetchImpl: f });
    assert.equal(calls[0].model, "jev-latest");
    assert.equal(calls[0].state, "state text");
    assert.equal(calls[0].questions.q1.type, "noul");
    assert.equal((r.answers.q1 as any).noul, 0.91);
  });
});

test("jevAsk: unset key, HTTP errors and malformed answers throw (never read as 'no')", async () => {
  delete process.env.TYPESAFE_API_KEY;
  await assert.rejects(jevAsk("s", { a: { type: "noul", instructions: "x" } }), /not configured/);
  assert.equal(jevStatus().configured, false);
  await withKey(async () => {
    const bad = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await assert.rejects(jevAsk("s", { a: { type: "noul", instructions: "x" } }, { fetchImpl: bad }), /Jev 500/);
    const junk = (async () => Response.json({ answers: { a: { type: "noul" } } })) as unknown as typeof fetch;
    await assert.rejects(jevAsk("s", { a: { type: "noul", instructions: "x" } }, { fetchImpl: junk }), /bad answer/);
    assert.equal(jevStatus().configured, true);
    assert.ok(!JSON.stringify(jevStatus()).includes("test-dummy"), "status must never include the key");
  });
});

test("tier choice: settled only above the confidence bar", async () => {
  await withKey(async () => {
    const { f } = fakeJev((id) => (id === "t0" ? { type: "choice", choice: "restricted", confidence: 0.93, probabilities: { restricted: 0.95 } } : { type: "choice", choice: "none", confidence: 0.2, probabilities: { none: 0.4 } }));
    const r = await jevTiers("Acme", "evidence", [{ key: "a#0", scope: "mail.read", capability: "Read mail" }, { key: "b#0", scope: "x", capability: "Y" }], { fetchImpl: f });
    assert.deepEqual(r.map((x) => [x.tier, x.settled]), [["restricted", true], ["none", false]]);
  });
});

test("support noul: thresholds map to supports / unsettled / no", async () => {
  await withKey(async () => {
    const ps = [0.93, 0.5, 0.1];
    const { f } = fakeJev((id) => ({ type: "noul", noul: ps[Number(id.slice(1))] }));
    const r = await jevSupport([0, 1, 2].map((i) => ({ id: `f${i}`, claim: "c", quote: "q" })), { fetchImpl: f });
    assert.deepEqual(r.map((x) => x.verdict), ["supports", "unsettled", "no"]);
  });
});

const IDX: IntentIndex[] = [{ slug: "gmail", name: "Gmail", aliases: [], ready: true, caps: [
  { id: "read", label: "Read email", keywords: ["read", "inbox"] }, { id: "send", label: "Send email", keywords: ["send"] }, { id: "labels", label: "Manage labels", keywords: ["label"] },
] }];

test("intake: Jev nouls pick capabilities; falls back to rules when unset, failing, or nothing clears 0.7", async () => {
  const q = "agent that goes through my users' Gmail and answers their mail";
  delete process.env.TYPESAFE_API_KEY;
  const rules = await refineIntent(q, IDX);
  assert.equal(rules.engine, "rules");
  await withKey(async () => {
    const { f } = fakeJev((id) => ({ type: "noul", noul: id === "c0" ? 0.88 : id === "c1" ? 0.81 : 0.05 }));
    const j = await refineIntent(q, IDX, { fetchImpl: f });
    assert.equal(j.engine, "jev");
    assert.deepEqual(j.intent.caps, ["read", "send"]);
    assert.match(j.href, /need=read,send/);
    assert.ok(j.decisions.every((d) => d.engine === "jev" && typeof d.p === "number"));
    const none = fakeJev(() => ({ type: "noul", noul: 0.2 }));
    assert.equal((await refineIntent(q, IDX, { fetchImpl: none.f })).engine, "rules");
    const down = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    const fb = await refineIntent(q, IDX, { fetchImpl: down });
    assert.equal(fb.engine, "rules");
    assert.ok(fb.error);
  });
});

/* Pipeline: mocked web + mock model + mocked Jev. */
const DOCS = `<html><title>Acme Developer Docs</title><body>
<p>Acme uses OAuth 2.0. Register your app in the developer console.</p>
<p>The scope contacts:read lets your app read contacts and needs no review.</p>
<p>The scope contacts:write requires app review before public users can grant it.</p>
<p>Submit your app for review in the console. The review process takes 5-10 business days.</p>
<p>Apps that access sensitive data must pass a security assessment by an approved lab, which takes 3-6 weeks.</p>
</body></html>`;
function installWeb() {
  globalThis.fetch = (async (input: any) => {
    const url = String(input?.url || input);
    if (url.includes("bing.com/search")) return new Response(`<li class="b_algo"><h2><a href="https://developers.acme.com/oauth">Acme OAuth</a></h2><p>docs</p></li>`, { status: 200 });
    if (url.includes("docs.composio.dev/toolkits/acme")) return new Response("<body>Authentication Details Composio-managed OAuth not available OAuth2</body>", { status: 200 });
    if (url.startsWith("https://developers.acme.com")) return new Response(DOCS, { status: 200, headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  }) as any;
}
async function run(jevFetch?: typeof fetch) {
  installWeb();
  const evs: PipeEvent[] = [];
  for await (const e of investigate("Acme", { providers: [mockProvider()], composioSlug: "acme", jevFetch, maxRecheckRounds: 0 })) evs.push(e);
  return evs;
}

test("pipeline with Jev: tier adopted with its probability, unsupported quote downgraded, decisions in the trace", async () => {
  await withKey(async () => {
    const { f, calls } = fakeJev((id, q) => (q.type === "choice" ? { type: "choice", choice: "restricted", confidence: 0.9, probabilities: { restricted: 0.93 } } : { type: "noul", noul: id === "s0" ? 0.12 : 0.95 }));
    const evs = await run(f);
    assert.equal(calls.length, 2, "one tier request + one support request");
    const tr = (evs.find((e) => e.type === "trace") as any).trace;
    assert.ok(tr.decisions.some((d: any) => d.stage === "scopes" && d.engine === "jev" && d.p === 0.9));
    assert.ok(tr.decisions.some((d: any) => d.stage === "verify" && d.engine === "jev" && d.value === "does not support"));
    assert.equal(tr.verifier.jevRejected, 1);
    const corr = evs.filter((e) => e.type === "correction") as any[];
    assert.ok(corr.some((c) => /does not support claim \(Jev 0.12\)/.test(c.reason)));
    const g = (evs.find((e) => e.type === "graph") as any).graph;
    assert.ok(g.capabilities.every((c: any) => c.tier === "restricted"));
    assert.ok(g.facts.some((x: any) => /Jev 0\.9/.test(x.note || "")));
    assert.ok(tr.tools.some((t: any) => t.kind === "jev" && t.ok));
  });
});

test("pipeline: Jev failing or key absent → same result as the LLM-only path, no regressions", async () => {
  delete process.env.TYPESAFE_API_KEY;
  const base = await run();
  const baseGraph = (base.find((e) => e.type === "graph") as any).graph;
  const baseTr = (base.find((e) => e.type === "trace") as any).trace;
  assert.ok(!baseTr.tools.some((t: any) => t.kind === "jev"));
  assert.ok(baseTr.decisions.every((d: any) => d.engine === "llm"));
  await withKey(async () => {
    const down = (async () => new Response("err", { status: 503 })) as unknown as typeof fetch;
    const evs = await run(down);
    const g = (evs.find((e) => e.type === "graph") as any).graph;
    assert.deepEqual(g.capabilities.map((c: any) => c.tier), baseGraph.capabilities.map((c: any) => c.tier));
    assert.deepEqual(g.facts.map((x: any) => x.status), baseGraph.facts.map((x: any) => x.status));
    const tr = (evs.find((e) => e.type === "trace") as any).trace;
    assert.ok(tr.tools.some((t: any) => t.kind === "jev" && !t.ok));
  });
});
