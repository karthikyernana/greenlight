/* Retrieval we own: web search (Bing HTML, DuckDuckGo HTML as fallback), direct fetch of likely developer-doc URLs,
   and passage ranking. The model only ever sees text we fetched, and the verifier checks quotes against that same text. */
import { fetchText, htmlToText } from "./probe";

export type Hit = { title: string; url: string; snippet: string; engine: string };
export type Page = { url: string; title: string; text: string; status: number; ms: number };
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

export async function fetchPage(url: string, ms = 9000): Promise<Page> {
  const t0 = Date.now();
  const r = await fetchText(url, ms, { headers: { "user-agent": BROWSER_UA } });
  if (!r) return { url, title: "", text: "", status: 0, ms: Date.now() - t0 };
  const title = decodeEntities(r.text.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1] || "").trim();
  const isJson = /json/.test(r.ctype);
  return { url: r.finalUrl || url, title: title || url, text: isJson ? r.text.slice(0, 60_000) : htmlToText(r.text).slice(0, 120_000), status: r.status, ms: Date.now() - t0 };
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
