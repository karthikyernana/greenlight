/* Retrieval layer: Firecrawl → Jina Reader → plain fetch, with mocked HTTP. No real Firecrawl/Jina calls. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRetriever, mdToText, retrievalStatus } from "../lib/retrieval";
import { investigate, type PipeEvent } from "../lib/pipeline/run";
import { mockProvider } from "../lib/pipeline/mock";

const MD = `# Acme OAuth\n\nThe scope [contacts:write](https://x.y/z) requires **app review** before public users can grant it.\n\n![img](a.png)\nThe review process takes 5-10 business days.`;
const HTML = `<html><title>Acme</title><body><p>${"Static text about OAuth scopes and review. ".repeat(20)}</p></body></html>`;

const withEnv = async (vars: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { await fn(); } finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};

function web(opts: { firecrawl?: "ok" | "fail"; jina?: number | "ok" }) {
  const hits: string[] = [];
  const f = (async (input: any, init: any) => {
    const url = String(input?.url || input);
    hits.push(url);
    if (url === "https://api.firecrawl.dev/v2/scrape") {
      assert.match(init.headers.authorization, /^Bearer /);
      const b = JSON.parse(init.body);
      assert.deepEqual(b.formats, ["markdown"]);
      if (opts.firecrawl === "fail") return Response.json({ success: false, error: "Payment required" }, { status: 402 });
      return Response.json({ success: true, data: { markdown: MD.repeat(4), metadata: { title: "Acme OAuth", sourceURL: b.url, url: b.url, statusCode: 200 } } });
    }
    if (url === "https://api.firecrawl.dev/v2/search") return Response.json({ success: true, data: { web: [{ url: "https://developers.acme.com/oauth", title: "Acme OAuth", description: "docs" }] } });
    if (url.startsWith("https://r.jina.ai/")) {
      if (opts.jina === "ok") return new Response(`Title: Acme via Jina\nURL Source: ${url.slice(18)}\nMarkdown Content:\n${MD.repeat(4)}`, { status: 200 });
      return new Response('{"code":401}', { status: (opts.jina as number) || 401 });
    }
    if (url.includes("bing.com/search")) return new Response(`<li class="b_algo"><h2><a href="https://developers.acme.com/oauth">Acme OAuth</a></h2><p>docs</p></li>`, { status: 200 });
    if (url.startsWith("https://developers.acme.com")) return new Response(HTML, { status: 200, headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { f, hits };
}

test("mdToText strips link targets, images and emphasis so quotes read like the page", () => {
  const t = mdToText(MD);
  assert.ok(t.includes("The scope contacts:write requires app review before public users can grant it."));
  assert.ok(!t.includes("https://x.y/z") && !t.includes("a.png"));
});

test("firecrawl first for picked pages; per-run cache; page records via", async () => {
  await withEnv({ FIRECRAWL_API_KEY: "fc-test-dummy" }, async () => {
    const { f, hits } = web({ firecrawl: "ok" });
    const r = makeRetriever({ fetchImpl: f });
    const p = await r.get("https://developers.acme.com/oauth");
    await r.get("https://developers.acme.com/oauth");
    assert.equal(p.via, "firecrawl");
    assert.equal(hits.filter((h) => h.includes("firecrawl.dev/v2/scrape")).length, 1, "cached by URL");
    assert.equal((await r.search("acme oauth")).engine, "firecrawl");
    assert.equal(retrievalStatus().firecrawl, true);
    assert.ok(!JSON.stringify(retrievalStatus()).includes("fc-test-dummy"));
  });
});

test("firecrawl credit cap, then failure → jina → plain fetch; jina 401 trips the breaker", async () => {
  await withEnv({ FIRECRAWL_API_KEY: "fc-test-dummy" }, async () => {
    const { f, hits } = web({ firecrawl: "fail", jina: 401 });
    const r = makeRetriever({ fetchImpl: f, firecrawlMax: 1 });
    const a = await r.get("https://developers.acme.com/a");
    assert.equal(a.via, "fetch");
    assert.deepEqual(a.tried?.map((x) => x.split(" ")[0]), ["firecrawl", "jina", "fetch"]);
    const b = await r.get("https://developers.acme.com/b");
    assert.equal(b.via, "fetch");
    assert.equal(hits.filter((h) => h.includes("/v2/scrape")).length, 1, "cap of 1 respected");
    assert.equal(hits.filter((h) => h.startsWith("https://r.jina.ai/")).length, 1, "breaker: jina not called again after 401");
  });
});

test("no Firecrawl key: picked pages go to Jina; guessed hosts go plain fetch and skip Jina on 404", async () => {
  await withEnv({ FIRECRAWL_API_KEY: undefined }, async () => {
    const { f, hits } = web({ jina: "ok" });
    const r = makeRetriever({ fetchImpl: f });
    assert.equal((await r.get("https://developers.acme.com/oauth")).via, "jina");
    const g = await r.get("https://docs.acme.com", "guess");
    assert.equal(g.via, "fetch");
    assert.equal(g.status, 404);
    assert.ok(!hits.includes("https://r.jina.ai/https://docs.acme.com"));
  });
});

test("pipeline: the verifier checks quotes against the Firecrawl text and the trace names the retriever", async () => {
  await withEnv({ FIRECRAWL_API_KEY: "fc-test-dummy", TYPESAFE_API_KEY: undefined }, async () => {
    const { f } = web({ firecrawl: "ok" });
    globalThis.fetch = f;
    const evs: PipeEvent[] = [];
    for await (const e of investigate("Acme", { providers: [mockProvider()], composioSlug: "acme", maxRecheckRounds: 0 })) evs.push(e);
    const tr = (evs.find((e) => e.type === "trace") as any).trace;
    const fc = tr.tools.filter((t: any) => t.kind === "fetch" && t.via === "firecrawl");
    assert.ok(fc.length >= 1, "a source fetched via firecrawl");
    assert.ok(tr.retrieval.firecrawl && tr.retrieval.firecrawlPages >= 1);
    assert.ok(tr.verifier.quoteMatched > 0, "quotes from the markdown text matched the same text");
    const g = (evs.find((e) => e.type === "graph") as any).graph;
    assert.ok(g.facts.some((x: any) => x.quote.includes("requires app review before public users can grant it")));
  });
});
