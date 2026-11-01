/* Input gate: a cheap check (well under 2 s) before anything is investigated, so typing "asdfgh" never spends model
   tokens or minutes. Runs on the server (lib/generate.ts, /api/check) and the command bars call /api/check first.

   1. normalise (trim, collapse spaces, strip control chars, cap length)
   2. reject empty / too short / keyboard-mash gibberish (pure code, instant)
   3. library or shared store match → open that (no investigation)
   4. a sentence ("agent that reads my users' Gmail…") → the app it names (rules intake); its caps still map
   5. otherwise resolve to a real product, any ONE of these, all in parallel with a hard deadline:
      - domain input: DNS resolves AND the homepage answers
      - in the 100-app Composio directory
      - Wikidata knows an entity with that name described as software / an app / a platform / a company
      - a developer host for <name>.com resolves (developer., developers., docs., api.) and the domain is not a
        DNS wildcard (a random label must NOT resolve, which rules out parked domains)
      - a fast search (Firecrawl when FIRECRAWL_API_KEY is set, else the existing web search) finds an official
        developer / API docs page for that name
      - Jev, when TYPESAFE_API_KEY is set: "is this a software product with a public API or OAuth?" (noul ≥ 0.7)
   If nothing confirms it in time, the reply is a clear "Couldn't find an app called …" with the nearest names. */
import dnsPromises from "node:dns/promises";
import { canonicalSlug, editDistance, hostLabel, looksLikeDomain, sameApp } from "./canonical";
import { parseIntent, type IntentIndex } from "./intent";
import { firecrawlConfigured, firecrawlSearch, webSearch, type Hit } from "./retrieval";
import { jevAsk, jevConfigured, NOUL_YES } from "./jev";

export type Suggestion = { slug: string; name: string; href: string; near?: boolean };

export type CheckOk = {
  ok: true;
  /** what confirmed it */
  via: "library" | "store" | "directory" | "sentence" | "domain" | "wikidata" | "devhost" | "search" | "jev";
  q: string;
  /** the app name the investigation should use */
  app: string;
  slug: string;
  /** where to go: a guide that exists, or the investigation URL */
  href: string;
  evidence?: string;
  caps?: string[];
  ms: number;
};
export type CheckFail = { ok: false; code: "empty" | "too_short" | "gibberish" | "not_found"; q: string; message: string; suggestions: Suggestion[]; ms: number };
export type CheckResult = CheckOk | CheckFail;

export type DirEntry = { slug: string; name: string; domain?: string; composioSlug?: string; ready: boolean };
export type StoredKey = { slug: string; name: string; domain?: string; keys?: string[] };

export type CheckDeps = {
  directory: DirEntry[];
  intents?: IntentIndex[];
  stored?: StoredKey[];
  /** resolve a host to an address, or throw */
  lookup?: (host: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  search?: (q: string) => Promise<Hit[]>;
  jev?: (name: string) => Promise<number>;
  /** overall deadline for the network checks (default 1600 ms) */
  deadlineMs?: number;
  now?: () => number;
};

/* ───────── 1–2: pure code ───────── */

export function normalise(raw: unknown): string {
  return String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
const ROWS_ALL = [...ROWS, ...ROWS.map((r) => [...r].reverse().join(""))];
const VOWELS = /[aeiouy]/;

/** Keyboard mash and other strings no product is called. Conservative: real names (Xero, Dribbble, Lyft, Twilio) pass. */
export function gibberishReason(token: string): string | null {
  const w = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (w.length < 4) return null;
  if (/^\d+$/.test(w)) return "only digits";
  for (const r of ROWS_ALL) for (let i = 0; i + 4 <= r.length; i++) if (w.includes(r.slice(i, i + 4))) return "keyboard run";
  if (/(.)\1{3,}/.test(w)) return "repeated character";
  const letters = w.replace(/\d/g, "");
  if (letters.length >= 5 && !VOWELS.test(letters)) return "no vowels";
  if (/[bcdfghjklmnpqrstvwxz]{7,}/.test(letters)) return "consonant run";
  // alternating mash like "hjhjhj", "fjfjfj"
  if (/^(..)\1{2,}$/.test(w)) return "repeated pattern";
  return null;
}

/* ───────── suggestions ───────── */

export function nearest(q: string, dir: DirEntry[], n = 3): Suggestion[] {
  const c = canonicalSlug(q).replace(/-/g, "");
  const scored = dir.map((e) => {
    const keys = [e.slug, e.name, e.composioSlug || ""].map((k) => canonicalSlug(k).replace(/-/g, "")).filter(Boolean);
    let d = 99; // editDistance(…, 4) returns 5 for "further than 4", which must never count as near
    for (const k of keys) {
      d = Math.min(d, editDistance(c, k, 4));
      if (c.length >= 3 && (k.startsWith(c) || c.startsWith(k))) d = Math.min(d, 1.5);
    }
    return { e, d: d + (e.ready ? -0.25 : 0) };
  }).filter((x) => x.d <= Math.min(4, Math.max(2, Math.ceil(c.length / 3)))).sort((a, b) => a.d - b.d);
  const popular = ["gmail", "slack", "notion", "hubspot", "github"].map((s) => dir.find((e) => e.slug === s && e.ready)).filter(Boolean) as DirEntry[];
  const pick = (scored.length ? scored.map((x) => x.e) : popular.length ? popular : dir.filter((e) => e.ready)).slice(0, n);
  return pick.map((e) => ({ slug: e.slug, name: e.name, href: `/guide/${e.slug}`, near: scored.length > 0 }));
}

/* ───────── 5: network signals ───────── */

const SOFTWARE = /\b(software|app|apps|application|platform|service|website|web site|company|saas|api|online|cloud|social (network|media)|messaging|e-?commerce|payment|payments|crm|erp|accounting|marketplace|search engine|web browser|tool|suite|email|webmail|video|streaming|scheduling|fintech|bank|banking|startup|technology|operating system|database|chat|collaboration|productivity|developer)\b/i;

const NOT_SOFTWARE = /\b(film|movie|video game|novel|book|song|album|single|band|given name|surname|family name|village|town|city|river|mountain|disambiguation|genus|species|episode|painting|television series|tv series|character)\b/i;

export async function wikidataSoftware(name: string, f: typeof fetch, signal?: AbortSignal): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5&type=item&origin=*`;
  const r = await f(url, { headers: { "user-agent": "Greenlight/4 (OAuth readiness prototype; https://oauth-greenlight-v2.vercel.app)" }, signal });
  if (!r.ok) return null;
  const j: any = await r.json();
  for (const x of j.search || []) {
    const label = String(x.label || "");
    const desc = String(x.description || "");
    const sameName = sameApp(name, [label]) >= 0.8 || label.toLowerCase().startsWith(name.toLowerCase() + " ");
    if (sameName && SOFTWARE.test(desc) && !NOT_SOFTWARE.test(desc)) return `${label}: ${desc}`;
  }
  return null;
}

const THIRD_PARTY = /stackoverflow|medium\.com|reddit|youtube|wikipedia|quora|dev\.to|linkedin|github\.com|nango|merge\.dev|apideck|pipedream|zapier|rollout|unified\.to|rapidapi|postman/i;
export function officialDocsHit(name: string, hits: Hit[]): Hit | null {
  const key = canonicalSlug(name).replace(/-/g, "");
  if (key.length < 2) return null;
  for (const h of hits) {
    let u: URL;
    try { u = new URL(h.url); } catch { continue; }
    if (THIRD_PARTY.test(u.host)) continue;
    const devish = /(^|\.)(developers?|docs|api|dev)\./i.test(u.host) || /\/(docs|developers?|api|oauth|reference)(\/|$)/i.test(u.pathname);
    const named = u.host.replace(/[^a-z0-9.]/gi, "").toLowerCase().includes(key) || (h.title || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(key);
    if (devish && named) return h;
  }
  return null;
}

/** Race a promise against a deadline; resolves to null on timeout or error. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((res) => {
    const t = setTimeout(() => res(null), Math.max(0, ms));
    p.then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(null); });
  });
}

const defaultLookup = async (h: string) => (await dnsPromises.lookup(h)).address;

async function resolves(lookup: (h: string) => Promise<string>, host: string, ms: number) {
  return !!(await within(lookup(host).then((a) => !!a), ms));
}

/** Does this domain answer? DNS, then the homepage (any status below 500 counts: a login wall is still a product). */
async function domainAlive(host: string, d: Required<Pick<CheckDeps, "lookup" | "fetchImpl">>, ms: number): Promise<string | null> {
  const t0 = Date.now();
  if (!(await resolves(d.lookup, host, Math.min(ms, 900)))) return null;
  const left = ms - (Date.now() - t0);
  const ctl = new AbortController();
  const r = await within(d.fetchImpl(`https://${host}/`, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 Greenlight/4" } }), left);
  ctl.abort();
  return r && r.status < 500 ? `${host} resolves and answers HTTP ${r.status}` : null;
}

/** Developer host for <name>.com resolves and the domain is not a DNS wildcard (parked domains often are). */
async function devHost(name: string, lookup: (h: string) => Promise<string>, ms: number): Promise<string | null> {
  const label = canonicalSlug(name).replace(/-/g, "");
  if (label.length < 3) return null;
  const base = `${label}.com`;
  const hosts = ["developer", "developers", "docs", "api"].map((p) => `${p}.${base}`);
  const [wild, ...hits] = await Promise.all([resolves(lookup, `zq${Math.random().toString(36).slice(2, 9)}x.${base}`, ms), ...hosts.map((h) => resolves(lookup, h, ms))]);
  if (wild) return null;
  const i = hits.findIndex(Boolean);
  return i >= 0 ? `${hosts[i]} resolves` : null;
}

const LEAD = new Set(["a", "an", "the", "agent", "my", "our", "i", "we", "build", "building", "make", "create", "help", "an", "ai", "bot", "app", "need", "want", "when", "if", "for", "please", "can", "how", "what"]);
/** The product a sentence names when no known app matched: a domain, else a Capitalised word that is not a lead word. */
export function appWordIn(sentence: string): string | null {
  const words = sentence.split(/\s+/).map((w) => w.replace(/^[^\w]+|[^\w.]+$/g, "").replace(/['’]s$/, ""));
  const dom = words.find((w) => looksLikeDomain(w));
  if (dom) return dom;
  const cap = words.find((w) => /^[A-Z][A-Za-z0-9]+/.test(w) && !LEAD.has(w.toLowerCase()));
  return cap || null;
}

/* ───────── the gate ───────── */

const isSentence = (s: string) => s.split(/\s+/).length >= 3;
const memo = new Map<string, { at: number; r: CheckResult }>();
const MEMO_MS = 10 * 60_000;

export async function checkInput(raw: unknown, deps: CheckDeps): Promise<CheckResult> {
  const now = deps.now || Date.now;
  const t0 = now();
  const q = normalise(raw);
  const ms = () => now() - t0;
  const fail = (code: CheckFail["code"], message: string, suggest = true): CheckFail => ({ ok: false, code, q, message, suggestions: suggest ? nearest(q, deps.directory) : [], ms: ms() });

  if (!q) return fail("empty", "Type an app name or its website, for example Gmail or xero.com.", false);
  // 3. library / directory / store: exact or near-exact names never need the network
  const dirHit = deps.directory.map((e) => ({ e, s: sameApp(q, [e.slug, e.name, e.domain || "", e.composioSlug || ""]) })).filter((x) => x.s >= 0.8).sort((a, b) => b.s - a.s)[0];
  if (dirHit && !isSentence(q)) {
    const e = dirHit.e;
    return { ok: true, via: e.ready ? "library" : "directory", q, app: e.name, slug: e.slug, href: e.ready ? `/guide/${e.slug}` : `/guide/${e.slug}?q=${encodeURIComponent(e.name)}${e.composioSlug ? `&cs=${encodeURIComponent(e.composioSlug)}` : ""}`, evidence: e.ready ? "in the library" : "in the Composio directory", ms: ms() };
  }
  const stHit = (deps.stored || []).map((s) => ({ s, score: sameApp(q, [s.slug, s.name, s.domain || "", ...(s.keys || [])]) })).filter((x) => x.score >= 0.8).sort((a, b) => b.score - a.score)[0];
  if (stHit && !isSentence(q)) return { ok: true, via: "store", q, app: stHit.s.name, slug: stHit.s.slug, href: `/guide/${stHit.s.slug}`, evidence: "already investigated", ms: ms() };
  const alias = !isSentence(q) && (deps.intents || []).find((e) => [e.name, e.slug, ...e.aliases].some((a) => a.toLowerCase() === q.toLowerCase()));
  if (alias) { const e = deps.directory.find((x) => x.slug === alias.slug); if (e) return { ok: true, via: e.ready ? "library" : "directory", q, app: e.name, slug: e.slug, href: e.ready ? `/guide/${e.slug}` : `/guide/${e.slug}?q=${encodeURIComponent(e.name)}`, evidence: "known alias", ms: ms() }; }
  // exact short aliases ("X") were matched above; anything else this short can't be looked up
  if (q.replace(/[^a-z0-9]/gi, "").length < 2) return fail("too_short", `"${q}" is too short to look up. Try a product name or its website.`);

  // 4. a sentence: rules intake finds the app; an app in the library or directory is enough
  let name = q;
  if (isSentence(q) && !looksLikeDomain(q)) {
    const intent = deps.intents ? parseIntent(q, deps.intents) : null;
    if (intent?.slug) {
      const e = deps.directory.find((x) => x.slug === intent.slug);
      const qs = new URLSearchParams();
      if (intent.caps.length) qs.set("need", intent.caps.join(","));
      if (intent.profile.audience === "team") qs.set("who", "team");
      if (intent.profile.scale === "small") qs.set("scale", "small");
      if (intent.profile.business === false) qs.set("biz", "no");
      if (!intent.ready) { qs.set("q", intent.app); if (intent.composioSlug) qs.set("cs", intent.composioSlug); }
      const s = qs.toString().replace(/%2C/g, ",");
      return { ok: true, via: "sentence", q, app: e?.name || intent.app, slug: intent.slug, href: `/guide/${intent.slug}${s ? `?${s}` : ""}`, caps: intent.caps, evidence: `reads as ${intent.app}${intent.caps.length ? ` (${intent.caps.join(", ")})` : ""}`, ms: ms() };
    }
    // no known app in the sentence: the app is a domain or a capitalised name in it (never a plain verb or noun)
    name = appWordIn(q) || "";
    if (!name) return fail("not_found", "Couldn't tell which app that is about. Name the app, for example \"Gmail: read and draft replies\".");
  }

  // 2b. gibberish (single tokens and each word of a short phrase)
  const words = name.split(/\s+/).filter(Boolean);
  if (!looksLikeDomain(name)) {
    const bad = words.map(gibberishReason).filter(Boolean);
    if (bad.length && bad.length >= Math.ceil(words.length / 2)) return fail("gibberish", `Couldn't find an app called "${name}". Try a product name or its website.`);
  }

  const key = canonicalSlug(name);
  const m = memo.get(key);
  if (m && now() - m.at < MEMO_MS) return { ...m.r, q, ms: ms() } as CheckResult;

  const lookup = deps.lookup || defaultLookup;
  const f = deps.fetchImpl || fetch;
  const deadline = deps.deadlineMs ?? 1600;
  const left = () => deadline - ms();
  const okAs = (via: CheckOk["via"], evidence: string, app = name): CheckOk => ({ ok: true, via, q, app, slug: key, href: `/guide/${key}?q=${encodeURIComponent(app)}`, evidence, ms: ms() });

  // domain / URL input: DNS + homepage is the whole test
  if (looksLikeDomain(name)) {
    const host = name.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
    const alive = await domainAlive(host, { lookup, fetchImpl: f }, left());
    const r: CheckResult = alive
      ? { ...okAs("domain", alive, name), slug: canonicalSlug(name), href: `/guide/${canonicalSlug(name)}?q=${encodeURIComponent(name)}` }
      : fail("not_found", `Couldn't reach ${host}. Check the spelling, or type the product's name instead.`);
    memo.set(key, { at: now(), r });
    return r;
  }

  // name: first positive signal wins
  const ctl = new AbortController();
  const signals: Promise<CheckOk | null>[] = [
    wikidataSoftware(name, f, ctl.signal).then((x) => (x ? okAs("wikidata", x) : null)),
    devHost(name, lookup, Math.min(1000, left())).then((x) => (x ? okAs("devhost", x) : null)),
    (deps.search ? deps.search(`${name} API developer documentation`) : firecrawlConfigured() ? firecrawlSearch(`${name} API developer documentation`, 5, f) : webSearch(`${name} API developer documentation`, 6).then((r) => r.hits))
      .then((hits) => { const h = officialDocsHit(name, hits); return h ? okAs("search", `official docs: ${h.url}`) : null; }),
  ];
  if (deps.jev || jevConfigured()) {
    const ask = deps.jev || (async (n: string) => {
      const r = await jevAsk({ name: n }, { real: { type: "noul", instructions: "Is `name` a software product or online service that offers a public API or lets third-party apps connect via OAuth?", criteria: { true: "A real software product, SaaS, platform or online service with a developer API or OAuth", false: "Not a product name: gibberish, a typo, a generic word, or something with no API" } } }, { timeoutMs: Math.max(300, left()) });
      return (r.answers.real as { noul: number }).noul;
    });
    signals.push(ask(name).then((p) => (p >= NOUL_YES ? okAs("jev", `Jev ${p.toFixed(2)}`) : null)));
  }
  const first = await new Promise<CheckOk | null>((res) => {
    let pending = signals.length;
    const t = setTimeout(() => res(null), Math.max(0, left()));
    for (const s of signals) s.then((v) => { if (v) { clearTimeout(t); res(v); } else if (--pending === 0) { clearTimeout(t); res(null); } }, () => { if (--pending === 0) { clearTimeout(t); res(null); } });
  });
  ctl.abort();
  const r: CheckResult = first ? { ...first, ms: ms() } : fail("not_found", `Couldn't find an app called "${name}". Try a product name or its website.`);
  // only cache positives for long; a miss may be a transient network problem
  if (r.ok) memo.set(key, { at: now(), r });
  return r;
}

export function _clearCheckMemo() { memo.clear(); }

/** For server routes: the library + Composio directory as the gate's directory. */
export function directoryFrom(index: { slug: string; name: string; domain?: string; composioSlug?: string; curated?: boolean; generated?: boolean; stored?: boolean }[]): DirEntry[] {
  return index.map((e) => ({ slug: e.slug, name: e.name, domain: e.domain, composioSlug: e.composioSlug, ready: !!(e.curated || e.generated || e.stored) }));
}

export { hostLabel };
