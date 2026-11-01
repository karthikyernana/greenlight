/* Input gate (lib/validate.ts): gibberish, real apps outside the library, domains, need sentences, deadline.
   All network signals are injected; a test fails if an unexpected network call is made. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkInput, gibberishReason, normalise, directoryFrom, appWordIn, _clearCheckMemo, type CheckDeps } from "../lib/validate";
import { libraryIndex, intentIndex } from "../lib/library";

const directory = directoryFrom(libraryIndex());
const intents = intentIndex();
const noNet: typeof fetch = (async (u: any) => { throw new Error(`unexpected fetch ${u}`); }) as any;
const noDns = async (h: string) => { throw Object.assign(new Error(`ENOTFOUND ${h}`), { code: "ENOTFOUND" }); };
const wikidata = (items: { label: string; description: string }[]): typeof fetch => (async (u: any) => {
  if (String(u).includes("wikidata.org")) return Response.json({ search: items });
  throw new Error(`unexpected fetch ${u}`);
}) as any;
const deps = (over: Partial<CheckDeps> = {}): CheckDeps => ({ directory, intents, stored: [], lookup: noDns, fetchImpl: wikidata([]), search: async () => [], deadlineMs: 600, ...over });

beforeEach(() => _clearCheckMemo());

test("normalise: trims, collapses whitespace, strips control characters, caps length", () => {
  assert.equal(normalise("  Free\tBooks \n "), "Free Books");
  assert.equal(normalise("a\u0000b"), "a b");
  assert.equal(normalise("x".repeat(500)).length, 160);
  assert.equal(normalise(undefined), "");
});

test("gibberish detector: keyboard mash is caught, real product names are not", () => {
  for (const g of ["asdfgh", "qwerty", "zxcvbn", "lkjhgf", "aaaaaa", "qwfpgj", "bcdfghkm", "hjhjhj", "12345678"]) assert.ok(gibberishReason(g), g);
  for (const r of ["Xero", "QuickBooks", "Dribbble", "Lyft", "Twilio", "Strava", "Typeform", "Mailchimp", "Pipedrive", "Qwilr", "Zapier", "Figma", "Shopify", "Sdk", "FreshBooks", "Wrike", "Brex", "Plaid", "Knightsbridge", "Zentrybooksmhvq"]) assert.equal(gibberishReason(r), null, r);
});

test("empty and too-short input are rejected instantly", async () => {
  const e = await checkInput("   ", deps());
  assert.equal(e.ok, false); assert.equal(!e.ok && e.code, "empty");
  const s = await checkInput("q", deps());
  assert.equal(!s.ok && s.code, "too_short");
  // …but a known one-letter alias still works
  const x = await checkInput("X", deps());
  assert.equal(x.ok, true);
});

test("gibberish: 'asdfgh' is rejected in a few ms with no network call, with nearest-name suggestions", async () => {
  const t0 = Date.now();
  const r = await checkInput("asdfgh", deps({ fetchImpl: noNet, search: async () => { throw new Error("no search"); } }));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.code, "gibberish");
  assert.match(r.message, /Couldn't find an app called "asdfgh"\. Try a product name or its website\./);
  assert.ok(r.suggestions.length > 0);
  assert.ok(Date.now() - t0 < 100);
});

test("library and Composio-directory apps open directly (no network): Gmail, Xero, QuickBooks, a typo of HubSpot", async () => {
  const d = deps({ fetchImpl: noNet, lookup: noDns, search: async () => { throw new Error("no search"); } });
  const g = await checkInput("Gmail", d);
  assert.ok(g.ok && g.via === "library" && g.href === "/guide/gmail");
  for (const name of ["Xero", "QuickBooks"]) {
    const r = await checkInput(name, d);
    assert.ok(r.ok, name);
    if (r.ok) { assert.equal(r.via, "directory"); assert.match(r.href, new RegExp(`^/guide/${name.toLowerCase()}\\?q=`)); }
  }
  const typo = await checkInput("Hubspt", d);
  assert.ok(typo.ok && typo.slug === "hubspot");
});

test("a stored guide is matched before anything else", async () => {
  const r = await checkInput("Freshbooks", deps({ stored: [{ slug: "freshbooks", name: "FreshBooks", domain: "freshbooks.com" }], fetchImpl: noNet }));
  assert.ok(r.ok && r.via === "store" && r.href === "/guide/freshbooks");
});

test("real app outside the library and directory: Wikidata describes it as software → investigate", async () => {
  const r = await checkInput("FreshBooks", deps({ fetchImpl: wikidata([{ label: "FreshBooks", description: "cloud-based accounting software service" }]) }));
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.via, "wikidata"); assert.equal(r.href, "/guide/freshbooks?q=FreshBooks"); }
});

test("a same-named entity that is not software (a film, a video game) does not count", async () => {
  const r = await checkInput("Blorpo", deps({ fetchImpl: wikidata([{ label: "Blorpo", description: "2017 video game" }, { label: "Blorpo", description: "2010 film" }]) }));
  assert.equal(r.ok, false);
});

test("real app found by search: an official developer docs page for that name", async () => {
  const r = await checkInput("Ramplify", deps({ search: async () => [
    { title: "Ramplify on Zapier", url: "https://zapier.com/apps/ramplify", snippet: "", engine: "t" },
    { title: "Ramplify API reference", url: "https://developer.ramplify.com/docs/api", snippet: "", engine: "t" },
  ] }));
  assert.ok(r.ok && r.via === "search");
});

test("developer host resolves → real; but a DNS wildcard (parked domain) proves nothing", async () => {
  const devOnly = async (h: string) => { if (h === "developer.ramplify.com") return "1.2.3.4"; throw new Error("ENOTFOUND"); };
  const r = await checkInput("Ramplify", deps({ lookup: devOnly }));
  assert.ok(r.ok && r.via === "devhost");
  _clearCheckMemo();
  const wildcard = async () => "5.6.7.8";
  const w = await checkInput("Ramplify", deps({ lookup: wildcard }));
  assert.equal(w.ok, false);
});

test("Jev (when configured) can confirm a product", async () => {
  const r = await checkInput("Ramplify", deps({ jev: async () => 0.92 }));
  assert.ok(r.ok && r.via === "jev");
  _clearCheckMemo();
  const no = await checkInput("Ramplify", deps({ jev: async () => 0.1 }));
  assert.equal(no.ok, false);
});

test("unknown name with no evidence → clear not-found message within the deadline, even if every signal hangs", async () => {
  const hang = () => new Promise<never>(() => {});
  const t0 = Date.now();
  const r = await checkInput("Blorptastic", deps({ fetchImpl: (() => hang()) as any, lookup: () => hang(), search: () => hang(), deadlineMs: 400 }));
  const ms = Date.now() - t0;
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.code, "not_found"); assert.match(r.message, /Couldn't find an app called "Blorptastic"/); }
  assert.ok(ms < 700, `${ms}ms`);
});

test("domain input: DNS + homepage → investigate; an unreachable domain → not found", async () => {
  const lookup = async (h: string) => { if (h === "ramplify.io") return "1.2.3.4"; throw new Error("ENOTFOUND"); };
  const fetchImpl = (async (u: any) => (String(u) === "https://ramplify.io/" ? new Response("<html>", { status: 200 }) : new Response("", { status: 404 }))) as any;
  const r = await checkInput("ramplify.io", deps({ lookup, fetchImpl }));
  assert.ok(r.ok && r.via === "domain");
  if (r.ok) assert.equal(r.slug, "ramplify");
  const bad = await checkInput("https://no-such-app-zz.io/developers", deps({ lookup, fetchImpl }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /Couldn't reach no-such-app-zz\.io/);
  // a domain of a directory app needs no network at all
  const x = await checkInput("xero.com", deps({ fetchImpl: noNet }));
  assert.ok(x.ok && x.slug === "xero");
});

test("natural-language need sentence still maps to the app and its capabilities", async () => {
  const r = await checkInput("agent that triages my users' Gmail and drafts replies", deps({ fetchImpl: noNet }));
  assert.ok(r.ok && r.via === "sentence");
  if (r.ok) {
    assert.equal(r.slug, "gmail");
    assert.ok(r.caps && r.caps.includes("read") && r.caps.includes("draft"), JSON.stringify(r.caps));
    assert.match(r.href, /^\/guide\/gmail\?need=/);
  }
  const team = await checkInput("an internal agent for my team that posts to Slack channels", deps({ fetchImpl: noNet }));
  assert.ok(team.ok && team.slug === "slack" && /who=team/.test(team.href));
});

test("sentence naming an app outside the library: the app is checked; a sentence with no app is rejected", async () => {
  const r = await checkInput("agent that syncs FreshBooks invoices", deps({ fetchImpl: wikidata([{ label: "FreshBooks", description: "accounting software" }]) }));
  assert.ok(r.ok && r.app === "FreshBooks");
  const none = await checkInput("an agent that books meetings", deps());
  assert.equal(none.ok, false);
  if (!none.ok) assert.match(none.message, /Couldn't tell which app/);
  assert.equal(appWordIn("Agent that reads Xero bills"), "Xero");
  assert.equal(appWordIn("my agent posts to acme.io daily"), "acme.io");
  assert.equal(appWordIn("an agent that books meetings"), null);
});
