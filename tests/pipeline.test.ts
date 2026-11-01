/* The whole investigation with the network and the model mocked: proves Scout → specialists → verifier → graph → engine. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { investigate, type PipeEvent } from "../lib/pipeline/run";
import { mockProvider } from "../lib/pipeline/mock";
import { plan, defaultNeed } from "../lib/engine";

const DOCS = `<html><title>Acme Developer Docs</title><body>
<p>Acme uses OAuth 2.0. Register your app in the developer console.</p>
<p>The scope contacts:read lets your app read contacts and needs no review.</p>
<p>The scope contacts:write requires app review before public users can grant it.</p>
<p>Submit your app for review in the console. The review process takes 5-10 business days.</p>
<p>Apps that access sensitive data must pass a security assessment by an approved lab, which takes 3-6 weeks.</p>
</body></html>`;

function installFetch() {
  globalThis.fetch = (async (input: any) => {
    const url = String(input?.url || input);
    if (url.includes("bing.com/search")) return new Response(`<li class="b_algo"><h2><a href="https://developers.acme.com/oauth">Acme OAuth</a></h2><p>docs</p></li>`, { status: 200 });
    if (url.includes("docs.composio.dev/toolkits/acme")) return new Response("<body>Authentication Details Composio-managed OAuth not available OAuth2</body>", { status: 200 });
    if (url.startsWith("https://developers.acme.com")) return new Response(DOCS, { status: 200, headers: { "content-type": "text/html" } });
    if (url.includes(".well-known/openid-configuration") && url.startsWith("https://acme.com")) return Response.json({ issuer: "https://acme.com", authorization_endpoint: "https://acme.com/oauth/authorize" });
    if (url.startsWith("https://acme.com/oauth/authorize")) return new Response("error=invalid_client Invalid client_id.", { status: 400 });
    return new Response("not found", { status: 404 });
  }) as any;
}

async function collect(opts: Parameters<typeof investigate>[1]) {
  const evs: PipeEvent[] = [];
  for await (const e of investigate("Acme", opts)) evs.push(e);
  return evs;
}

test("mock run: every stage reports, the graph validates and the engine plans it", async () => {
  installFetch();
  const evs = await collect({ providers: [mockProvider()], composioSlug: "acme" });
  const stages = evs.filter((e) => e.type === "stage" && e.status !== "running").map((e: any) => e.id);
  for (const s of ["scout", "scopes", "gates", "probe", "verify"]) assert.ok(stages.includes(s), `missing ${s}`);
  const g = (evs.find((e) => e.type === "graph") as any)?.graph;
  assert.ok(g, "no graph");
  assert.equal(g.composio.managed, "not_available");
  assert.ok(g.gates.some((x: any) => x.kind === "security_assessment"));
  const p = plan(g, defaultNeed(g));
  assert.ok(p.lead.length > 5);
  const tr = (evs.find((e) => e.type === "trace") as any).trace;
  assert.ok(tr.tools.some((t: any) => t.kind === "search") && tr.tools.some((t: any) => t.kind === "fetch") && tr.llm.length >= 2);
  assert.ok(tr.verifier.checked > 0 && tr.verifier.quoteMatched > 0);
});

test("verifier catches a fabricated quote and downgrades it to Uncertain", async () => {
  installFetch();
  const evs = await collect({ providers: [mockProvider({ faults: true })], composioSlug: "acme" });
  const corr = evs.filter((e) => e.type === "correction") as any[];
  assert.ok(corr.some((c) => c.reason === "quote not found in source" && c.to === "uncertain"));
  const g = (evs.find((e) => e.type === "graph") as any).graph;
  const bad = g.facts.find((f: any) => /Downgraded/.test(f.note || ""));
  assert.ok(bad && bad.status === "uncertain" && bad.quote === "");
});

test("no model configured: live checks run, then a clear no_model error", async () => {
  installFetch();
  const evs = await collect({ providers: [], composioSlug: "acme" });
  const err = evs.find((e) => e.type === "error") as any;
  assert.equal(err.code, "no_model");
  assert.ok(!evs.some((e) => e.type === "graph"));
});
