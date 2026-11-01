/* Pre-submission audit fixes (2026-11-02): provider-source publishing check, retired store entries, model-written step
   owners, duplicate evidence rows, friendly rate limit, cross-instance run lock, gate suggestions, live date. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getGraph } from "../lib/graph/load";
import type { Fact, ProviderGraph } from "../lib/graph/schema";
import { publishVerdict, sourceCheck, withSourceCheck, isProviderUrl, brandLabel } from "../lib/publish";
import { _setBackend, putStored, getStored, listStored, claimRun, releaseRun, RETIRED, type Backend } from "../lib/store";
import { normaliseOwner, dedupeFacts } from "../lib/engine";
import { generate, ipLimited, rateLimitMessage, type GenEvent } from "../lib/generate";
import { nearest } from "../lib/validate";
import { suggestLead } from "../lib/checkClient";
import { liveDate } from "../components/Runway";

function mem(): Backend {
  const m = new Map<string, string>();
  return { kind: "memory", async get(p) { return m.get(p) ?? null; }, async put(p, b) { m.set(p, b); }, async list(pre) { return [...m.keys()].filter((k) => k.startsWith(pre)); } };
}
beforeEach(() => _setBackend(mem()));
async function collect(it: AsyncGenerator<GenEvent>) { const out: GenEvent[] = []; for await (const e of it) out.push(e); return out; }
const passCheck = async (q: string) => ({ ok: true as const, via: "search" as const, q, app: q, slug: q.toLowerCase(), href: `/guide/${q.toLowerCase()}`, ms: 0 });

/** A generated graph named `name` on `domain`, every fact Sourced, gate facts pointing at `factHost`. */
function gen(name: string, domain: string, factHost: string): ProviderGraph {
  const g = structuredClone(getGraph("dropbox")!);
  for (const f of g.facts) { f.status = "sourced"; f.url = f.url.replace(/^https?:\/\/[^/]+/, `https://${factHost}`); }
  return { ...g, slug: name.toLowerCase(), name, domain, console: `https://${domain}/developers`, origin: "generated" };
}

test("brand label and provider URL matching", () => {
  assert.equal(brandLabel("developers.pipedrive.com"), "pipedrive");
  assert.equal(brandLabel("api.xero.co.uk"), "xero");
  const pd = { domain: "pipedrive.com", console: "https://developers.pipedrive.com" };
  assert.ok(isProviderUrl(pd, "https://pipedrive.readme.io/docs/marketplace"));
  assert.ok(isProviderUrl({ domain: "dropbox.com", console: "" }, "https://docs.dropboxapi.com/x"));
  assert.ok(!isProviderUrl({ domain: "zomato.com", console: "https://developers.zomato.com/" }, "https://support.google.com/cloud/answer/13463073"));
  assert.ok(!isProviderUrl({ domain: "box.com", console: "" }, "https://boxlunch.com/a"));
});

test("publishing check 4: a guide whose gates cite only another company's docs stays Draft", () => {
  const ok = gen("Pipedrive", "pipedrive.com", "pipedrive.readme.io");
  assert.equal(publishVerdict(ok, { checked: 10, quoteMatched: 10, unresolved: 0 }).status, "verified");
  const zomato = gen("Zomato", "zomato.com", "support.google.com");
  const v = publishVerdict(zomato, { checked: 10, quoteMatched: 10, unresolved: 0 });
  assert.equal(v.status, "draft");
  assert.match(v.failed.join(" "), /cite no zomato\.com page/);
  assert.equal(sourceCheck({ ...zomato, gates: [] }).pass, true, "no gates → nothing to cite");
});

test("stored guides from before check 4 get it on read: an old Verified can drop to Draft", async () => {
  const zomato = gen("Zomato", "zomato.com", "support.google.com");
  const old = { status: "verified" as const, checks: [{ id: "quotes" as const, label: "Quotes", pass: true, detail: "" }], failed: [], at: "" };
  const after = withSourceCheck(old, zomato);
  assert.equal(after.status, "draft");
  assert.equal(withSourceCheck(after, zomato), after, "idempotent");
  assert.equal(withSourceCheck({ ...old, status: "curated" }, zomato).status, "curated");
  // through the store: the record is written as Verified (simulating a pre-check-4 blob) and read back as Draft
  const b = mem(); _setBackend(b);
  await b.put("guides/zomato.json", JSON.stringify({ v: 1, slug: "zomato", keys: ["zomato"], graph: zomato, publish: old, storedAt: new Date().toISOString(), lastRunAt: new Date().toISOString(), runs: 1 }));
  assert.equal((await getStored("zomato", { fresh: true }))!.publish.status, "draft");
});

test("retired store entries stop resolving and leave the board", async () => {
  assert.ok(RETIRED.capiclan);
  const g = gen("capiclan", "google.com", "developers.google.com");
  await putStored({ ...g, slug: "capiclan" });
  await putStored(gen("Pipedrive", "pipedrive.com", "pipedrive.readme.io"));
  assert.equal(await getStored("capiclan", { fresh: true }), null);
  const list = await listStored();
  assert.deepEqual(list.map((x) => x.slug), ["pipedrive"]);
});

test("model-written step owners: 'you' with real agent work becomes 'Agent + you'; empty sides are dropped", () => {
  assert.equal(normaliseOwner({ owner: "you", agent: "Prepare code for the OAuth token exchange", human: "Integrate it" }), "both");
  assert.equal(normaliseOwner({ owner: "you", agent: "N/A", human: "Sign in" }), "you");
  assert.equal(normaliseOwner({ owner: "both", agent: "Monitor approval status", human: "n/a" }), "agent");
  assert.equal(normaliseOwner({ owner: "both", agent: "", human: "Pay the fee" }), "you");
  assert.equal(normaliseOwner({ owner: "agent", agent: "Draft it", human: "Review" }), "agent");
  // stored generated guides are normalised on read; library graphs are not touched
  assert.equal(getGraph("spotify")!.steps.find((s) => s.id === "allowlist")!.owner, "you");
});

test("evidence rows: the same claim from the same page shows once, strongest status wins", () => {
  const f = (id: string, status: Fact["status"], quote = "q"): Fact => ({ id, claim: "Public apps must go through Pipedrive’s app approval process.", url: "https://pipedrive.readme.io/docs/x#a", title: "", quote, checked: "2026-11-02", status });
  const out = dedupeFacts([f("a", "uncertain"), f("b", "sourced", ""), f("c", "sourced"), { ...f("d", "sourced"), claim: "Something else" }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].status, "sourced");
  assert.equal(out[0].quote, "q", "keeps a quote when the stronger row has none");
});

test("rate limit: friendly message with minutes until the next run, and the stream says rate_limited", async () => {
  const ip = "203.0.113." + Math.floor(Math.random() * 200);
  const t0 = 1_000_000_000_000;
  for (let i = 0; i < 20; i++) assert.equal(ipLimited(ip, 20, t0 + i * 1000), 0);
  const min = ipLimited(ip, 20, t0 + 30_000);
  assert.ok(min >= 59 && min <= 60, String(min));
  assert.match(rateLimitMessage(min), /20 new investigations in the last hour.*already exist still open instantly.*in \d+ min/);
  const ip2 = "198.51.100." + Math.floor(Math.random() * 200);
  for (let i = 0; i < 20; i++) ipLimited(ip2);
  const ev = await collect(generate({ q: "Acmeflow" }, { ip: ip2, check: passCheck, investigateImpl: async function* () { throw new Error("must not run"); } as any }));
  const err = ev.find((e) => e.type === "error") as any;
  assert.equal(err.code, "rate_limited");
  assert.ok(err.retryInMin >= 1);
});

test("same new app on two server instances: the second request waits for the first run's stored guide", async () => {
  // instance A holds the lock (simulated: claimed with another run id); instance B must not start a second run
  assert.deepEqual(await claimRun("acmeflow", "run-on-instance-a"), { ok: true });
  let runs = 0;
  const impl = async function* (): AsyncGenerator<any> { runs++; yield { type: "graph", graph: gen("Acmeflow", "acmeflow.com", "acmeflow.com") }; };
  setTimeout(() => { void putStored(gen("Acmeflow", "acmeflow.com", "acmeflow.com")); }, 60);
  const ev = await collect(generate({ q: "Acmeflow" }, { check: passCheck, investigateImpl: impl as any, pollMs: 20, waitMs: 3000 }));
  assert.equal(runs, 0);
  assert.equal(ev[0].type, "waiting");
  assert.ok(ev.some((e) => e.type === "cached"));
  assert.ok(ev.some((e) => e.type === "graph"));
  // released lock (or one older than 5 min) no longer blocks
  await releaseRun("acmeflow", "run-on-instance-a");
  assert.deepEqual(await claimRun("acmeflow", "next"), { ok: true });
  assert.equal((await claimRun("other", "x", Date.now() - 400_000)).ok, true);
  assert.equal((await claimRun("other", "y")).ok, true, "a 400 s old lock is stale");
});

test("a finished run releases its lock so the next re-check isn't blocked", async () => {
  const impl = async function* (): AsyncGenerator<any> { yield { type: "graph", graph: gen("Lockapp", "lockapp.com", "lockapp.com") }; };
  await collect(generate({ q: "Lockapp" }, { check: passCheck, investigateImpl: impl as any }));
  assert.deepEqual(await claimRun("lockapp", "someone-else"), { ok: true });
});

test("gate suggestions: 'Did you mean' only for close spellings", () => {
  const dir = [{ slug: "gmail", name: "Gmail", ready: true }, { slug: "slack", name: "Slack", ready: true }, { slug: "notion", name: "Notion", ready: true }] as any;
  const near = nearest("gmial", dir);
  assert.equal(near[0].slug, "gmail");
  assert.equal(suggestLead(near), "Did you mean");
  const far = nearest("zxqv blorptastic", dir);
  assert.ok(far.length > 0);
  assert.equal(suggestLead(far), "Ready guides:");
});

test("runway live date uses the same calendar days as the headline wait", () => {
  const now = new Date("2026-11-02T10:00:00");
  assert.equal(liveDate(60, now), "1 Jan");
  assert.equal(liveDate(14, now), "16 Nov");
});
