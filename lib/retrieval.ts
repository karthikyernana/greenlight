/* Retrieval we own: web search (Bing HTML, DuckDuckGo HTML as fallback), direct fetch of likely developer-doc URLs,
   and passage ranking. The model only ever sees text we fetched, and the verifier checks quotes against that same text. */
import { fetchText, htmlToText } from "./probe";

export type Hit = { title: string; url: string; snippet: string; engine: string };
export type Retriever = "firecrawl" | "jina" | "fetch";
export type Page = { url: string; title: string; text: string; status: number; ms: number; via?: Retriever; tried?: string[] };
export type Passage = { url: string; title: string; text: string; score: number };

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "");

/** Bing result links are /ck/a?...&u=a1<base64url> redirects. */
export function decodeBingUrl(href: string): string {
  const h = decodeEntities(href);
  const m = h.match(/[?&]u=a1([^&]+)/);
  if (!m) return h;
  try { return Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); } catch { return h; }
}

export function parseBing(html: string): Hit[] {
  const out: Hit[] = [];
  for (const block of html.split('<li class="b_algo"').slice(1)) {
    const a = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const url = decodeBingUrl(a[1]);
    if (!/^https?:\/\//.test(url)) continue;
    const snip = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] || "";
    out.push({ title: decodeEntities(a[2]).trim(), url, snippet: decodeEntities(snip).replace(/\s+/g, " ").trim().slice(0, 300), engine: "bing" });
  }
  return out;
}

export function parseDdg(html: string): Hit[] {
  const out: Hit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    let url = decodeEntities(m[1]);
    const u = url.match(/uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (!/^https?:\/\//.test(url)) continue;
    out.push({ title: decodeEntities(m[2]).trim(), url, snippet: "", engine: "ddg" });
  }
  return out;
}

export async function webSearch(q: string, n = 6): Promise<{ hits: Hit[]; engine: string; error?: string }> {
  const bing = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en-US&cc=US&mkt=en-US`, 8000, { headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en" } });
  if (bing?.status === 200) {
    const hits = parseBing(bing.text);
    if (hits.length) return { hits: hits.slice(0, n), engine: "bing" };
  }
  const ddg = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, 8000, { headers: { "user-agent": BROWSER_UA } });
  if (ddg?.status === 200) {
    const hits = parseDdg(ddg.text);
    if (hits.length) return { hits: hits.slice(0, n), engine: "ddg" };
  }
  return { hits: [], engine: "none", error: `search unavailable (bing ${bing?.status ?? "err"}, ddg ${ddg?.status ?? "err"})` };
}

export async function fetchPage(url: string, ms = 9000, f?: typeof fetch): Promise<Page> {
  const t0 = Date.now();
  const r = await fetchText(url, ms, { headers: { "user-agent": BROWSER_UA } }, f || fetch);
  if (!r) return { url, title: "", text: "", status: 0, ms: Date.now() - t0, via: "fetch" };
  const title = decodeEntities(r.text.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1] || "").trim();
  const isJson = /json/.test(r.ctype);
  return { url: r.finalUrl || url, title: title || url, text: isJson ? r.text.slice(0, 60_000) : htmlToText(r.text).slice(0, 120_000), status: r.status, ms: Date.now() - t0, via: "fetch" };
}

/* ───────── Retrieval layer: Firecrawl → Jina Reader → plain fetch ─────────
   Firecrawl (FIRECRAWL_API_KEY): JS-rendered scrape to markdown, and web search. Credits are kept low: only URLs the
   Scout picked (model pointer, search hits on the official domain, re-check sources) are scraped, at most
   FIRECRAWL_MAX_PAGES (default 6) per run, with Firecrawl's own cache allowed (maxAge 2 days).
   Jina Reader (r.jina.ai, free; JINA_API_KEY optional): page → markdown. Anonymous use is blocked from some datacenter
   IPs (401) and rate-limited (429); either trips a per-run breaker and we stop calling it.
   Plain fetch: always last. Conventional-host guesses (developers.<domain> …) go plain fetch first and only fall back
   to Jina when the page looks JS-rendered or blocked, so 404 guesses cost nothing.
   Every page records which retriever produced its text (`via`); the verifier checks quotes against that same text. */

const env = (k: string) => (process.env[k] || "").trim();
export const firecrawlConfigured = () => !!env("FIRECRAWL_API_KEY");
export const jinaEnabled = () => env("RETRIEVAL_JINA") !== "0";
export function retrievalStatus() {
  return { firecrawl: firecrawlConfigured(), jina: jinaEnabled() ? (env("JINA_API_KEY") ? "key" : "anonymous") : "off", order: [...(firecrawlConfigured() ? ["firecrawl"] : []), ...(jinaEnabled() ? ["jina"] : []), "fetch"] };
}

/** Markdown → plain-ish text: drop images and link targets so quotes read like the page and passages stay small. */
export function mdToText(md: string) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]{1,3}([^*_`\n]+)[*_`]{1,3}/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

type F = typeof fetch;
async function timed(f: F, url: string, init: RequestInit, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await f(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

export async function firecrawlScrape(url: string, f: F = fetch): Promise<Page> {
  const t0 = Date.now();
  const r = await timed(f, "https://api.firecrawl.dev/v2/scrape", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env("FIRECRAWL_API_KEY")}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, maxAge: 172_800_000, timeout: 25_000 }),
  }, 30_000);
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.success || typeof d?.data?.markdown !== "string") throw new Error(`firecrawl ${r.status}${d?.error ? `: ${String(d.error).slice(0, 80)}` : ""}`);
  const m = d.data.metadata || {};
  return { url: m.url || m.sourceURL || url, title: String(m.title || url).slice(0, 160), text: mdToText(d.data.markdown).slice(0, 120_000), status: Number(m.statusCode) || 200, ms: Date.now() - t0, via: "firecrawl" };
}

export async function firecrawlSearch(q: string, n = 6, f: F = fetch): Promise<Hit[]> {
  const r = await timed(f, "https://api.firecrawl.dev/v2/search", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env("FIRECRAWL_API_KEY")}` },
    body: JSON.stringify({ query: q, limit: n }),
  }, 15_000);
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.success) throw new Error(`firecrawl search ${r.status}`);
  return (d.data?.web || []).filter((h: any) => /^https?:\/\//.test(h?.url || "")).slice(0, n).map((h: any) => ({ title: String(h.title || ""), url: h.url, snippet: String(h.description || "").slice(0, 300), engine: "firecrawl" }));
}

export async function jinaRead(url: string, f: F = fetch): Promise<Page> {
  const t0 = Date.now();
  const headers: Record<string, string> = { "x-return-format": "markdown", accept: "text/plain" };
  if (env("JINA_API_KEY")) headers.authorization = `Bearer ${env("JINA_API_KEY")}`;
  const r = await timed(f, `https://r.jina.ai/${url}`, { headers }, Number(env("JINA_TIMEOUT_MS")) || 8_000);
  const body = await r.text();
  if (!r.ok) { const e: any = new Error(`jina ${r.status}`); e.status = r.status; throw e; }
  const title = body.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || url;
  const src = body.match(/^URL Source:\s*(\S+)/m)?.[1] || url;
  const md = body.includes("Markdown Content:") ? body.slice(body.indexOf("Markdown Content:") + 17) : body;
  return { url: src, title: title.slice(0, 160), text: mdToText(md).slice(0, 120_000), status: 200, ms: Date.now() - t0, via: "jina" };
}

const usable = (p: Page | null | undefined) => !!p && p.status === 200 && p.text.length > 300;
const looksBlocked = (p: Page) => (p.status === 200 && p.text.length < 500) || p.status === 400 || p.status === 403 || p.status === 0;

/** Per-run fetcher with a URL cache and the credit/breaker state. `kind: "pick"` = a page the Scout chose (Firecrawl allowed). */
export function makeRetriever(opts: { fetchImpl?: F; firecrawlMax?: number } = {}) {
  const f = opts.fetchImpl || fetch;
  const cache = new Map<string, Promise<Page>>();
  const state = { firecrawlUsed: 0, firecrawlMax: opts.firecrawlMax ?? (Number(env("FIRECRAWL_MAX_PAGES")) || 6), jinaOff: !jinaEnabled(), jinaNote: "", firecrawlErrors: 0 };
  const viaJina = async (url: string, tried: string[]) => {
    if (state.jinaOff) return null;
    try { const p = await jinaRead(url, f); tried.push(`jina ${p.text.length}c`); return p; }
    catch (e: any) {
      const msg = e?.name === "AbortError" || /abort/i.test(String(e?.message)) ? "jina timeout" : String(e?.message || e);
      tried.push(msg);
      // 401/403/429 or a timeout trips the breaker for the rest of the run (measured 2026-11-01: from Vercel, anonymous
      // Jina often runs past the timeout; from the sandbox it answers 401), so the cost is paid at most once per run.
      if (e?.status === 401 || e?.status === 429 || e?.status === 403 || msg === "jina timeout") { state.jinaOff = true; state.jinaNote = msg; }
      return null;
    }
  };
  const load = async (url: string, kind: "pick" | "guess"): Promise<Page> => {
    const tried: string[] = [];
    if (kind === "pick" && firecrawlConfigured() && state.firecrawlUsed < state.firecrawlMax && state.firecrawlErrors < 3) {
      state.firecrawlUsed++;
      try { const p = await firecrawlScrape(url, f); tried.push(`firecrawl ${p.text.length}c`); if (usable(p)) return { ...p, tried }; }
      catch (e: any) { state.firecrawlErrors++; tried.push(String(e?.message || e)); }
    }
    if (kind === "pick") {
      // Jina and plain fetch race in parallel so the fallback costs no extra wall time; Jina's markdown wins when usable.
      const [j, p] = await Promise.all([viaJina(url, tried), fetchPage(url, 9000, f)]);
      if (usable(j)) return { ...j!, tried };
      return { ...p, tried: [...tried, `fetch ${p.status}`] };
    }
    const p = await fetchPage(url, 9000, f);
    tried.push(`fetch ${p.status}`);
    if (looksBlocked(p)) { const j = await viaJina(url, tried); if (usable(j)) return { ...j!, tried }; }
    return { ...p, tried };
  };
  return {
    state,
    get(url: string, kind: "pick" | "guess" = "pick") {
      if (!cache.has(url)) cache.set(url, load(url, kind));
      return cache.get(url)!;
    },
    async search(q: string, n = 6): Promise<{ hits: Hit[]; engine: string; error?: string }> {
      if (firecrawlConfigured()) {
        try { const hits = await firecrawlSearch(q, n, f); if (hits.length) return { hits, engine: "firecrawl" }; } catch {}
      }
      return webSearch(q, n);
    },
  };
}

/** Conventional developer-portal URLs for a domain. */
export function docCandidates(domain: string): string[] {
  const bare = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  return [`https://developers.${bare}`, `https://developer.${bare}`, `https://docs.${bare}`, `https://${bare}/developers`, `https://${bare}/docs`];
}

const TERMS = ["oauth", "scope", "permission", "review", "verification", "verify", "approval", "approve", "marketplace", "listing", "partner", "security assessment", "business", "install", "redirect", "client id", "consent", "rate limit", "pricing", "days", "weeks"];

/** Split pages into ~700-char passages and keep the ones that talk about OAuth approval. */
export function rankPassages(pages: Page[], extra: string[] = [], max = 14, size = 700): Passage[] {
  const terms = [...TERMS, ...extra.map((e) => e.toLowerCase())];
  const out: Passage[] = [];
  for (const p of pages) {
    if (p.status !== 200 || p.text.length < 200) continue;
    for (let i = 0; i < p.text.length && i < 100_000; i += size - 100) {
      const text = p.text.slice(i, i + size);
      const low = text.toLowerCase();
      let score = 0;
      for (const t of terms) if (low.includes(t)) score += t.length > 8 ? 2 : 1;
      if (/\d+\s*(business )?(days|weeks)/i.test(text)) score += 2;
      if (score >= 3) out.push({ url: p.url, title: p.title, text, score });
    }
  }
  // keep diversity: at most 4 passages per page
  const per = new Map<string, number>();
  return out.sort((a, b) => b.score - a.score).filter((x) => { const n = per.get(x.url) || 0; per.set(x.url, n + 1); return n < 4; }).slice(0, max);
}

export function host(u: string) {
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; }
}
