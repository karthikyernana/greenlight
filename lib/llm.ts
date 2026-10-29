import { getVercelOidcToken } from "@vercel/oidc";

/* Provider strategy (no keys required on Vercel):
   1. GEMINI_API_KEY set  → Gemini direct, research grounded with Google Search.
   2. otherwise           → Vercel AI Gateway authenticated with the deployment's OIDC token
                            (or AI_GATEWAY_API_KEY): perplexity/sonar for web research, Gemini Flash for structuring.
   Every call retries on 429/5xx with backoff and falls through to the next provider. */

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const RESEARCH_MODEL = process.env.GL_RESEARCH_MODEL || "perplexity/sonar";
const STRUCT_MODELS = (process.env.GL_STRUCT_MODELS || "google/gemini-3-flash,openai/gpt-5-mini,google/gemini-2.5-flash").split(",");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export type ResearchOut = { text: string; sources: { title: string; url: string }[]; model: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gatewayAuth(): Promise<string | null> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  try {
    return await getVercelOidcToken();
  } catch {
    return process.env.VERCEL_OIDC_TOKEN || null;
  }
}

export async function providerStatus() {
  const gem = !!process.env.GEMINI_API_KEY;
  const gw = !!(await gatewayAuth());
  return { gemini: gem, gateway: gw, any: gem || gw };
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const status = e?.status || 0;
      if (status && status < 500 && status !== 429) break;
      await sleep(800 * 2 ** i);
    }
  }
  throw last;
}

class HttpErr extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

async function gatewayChat(model: string, messages: any[], extra: Record<string, unknown> = {}, timeoutMs = 60000) {
  const token = await gatewayAuth();
  if (!token) throw new HttpErr(401, "No AI Gateway credentials");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      signal: ctl.signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, ...extra }),
    });
    const body = await r.text();
    if (!r.ok) throw new HttpErr(r.status, `gateway ${model} ${r.status}: ${body.slice(0, 300)}`);
    return JSON.parse(body);
  } finally {
    clearTimeout(t);
  }
}

async function geminiCall(body: any, timeoutMs = 60000) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpErr(401, "No GEMINI_API_KEY");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST", signal: ctl.signal,
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new HttpErr(r.status, `gemini ${r.status}: ${txt.slice(0, 300)}`);
    return JSON.parse(txt);
  } finally {
    clearTimeout(t);
  }
}

const URL_RE = /https?:\/\/[^\s)\]>"'`,]+/g;

export async function research(prompt: string): Promise<ResearchOut> {
  const errors: string[] = [];
  if (process.env.GEMINI_API_KEY) {
    try {
      const j = await withRetry(() => geminiCall({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }));
      const cand = j.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p: any) => p.text || "").join("\n");
      const chunks = cand?.groundingMetadata?.groundingChunks || [];
      const sources = chunks.map((c: any) => ({ title: c.web?.title || "source", url: c.web?.uri || "" })).filter((s: any) => s.url);
      for (const u of text.match(URL_RE) || []) sources.push({ title: new URL(u).host, url: u });
      return { text, sources: dedupe(sources), model: `gemini:${GEMINI_MODEL}+google_search` };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }
  try {
    const j = await withRetry(() => gatewayChat(RESEARCH_MODEL, [{ role: "user", content: prompt }], { max_tokens: 2500 }));
    const msg = j.choices?.[0]?.message || {};
    const text: string = msg.content || "";
    const cites: string[] = [...(j.citations || []), ...((j.search_results || []).map((s: any) => s.url))];
    const ann = (msg.annotations || []).map((a: any) => a.url_citation?.url || a.url).filter(Boolean);
    const sources = [...cites, ...ann, ...(text.match(URL_RE) || [])].map((u) => ({ title: safeHost(u), url: u }));
    const titled = (j.search_results || []).map((s: any) => ({ title: s.title || safeHost(s.url), url: s.url }));
    return { text, sources: dedupe([...titled, ...sources]), model: `gateway:${RESEARCH_MODEL}` };
  } catch (e: any) {
    errors.push(String(e?.message || e));
  }
  throw new Error(`Research providers unavailable: ${errors.join(" | ")}`);
}

/** Ask for a JSON object; returns parsed JSON. Tries Gemini direct, then gateway models in order. */
export async function structured(system: string, user: string): Promise<{ json: any; model: string }> {
  const errors: string[] = [];
  if (process.env.GEMINI_API_KEY) {
    try {
      const j = await withRetry(() => geminiCall({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }), 2);
      const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
      return { json: parseJson(text), model: `gemini:${GEMINI_MODEL}` };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }
  for (const m of STRUCT_MODELS) {
    try {
      const j = await withRetry(() => gatewayChat(m, [{ role: "system", content: system }, { role: "user", content: user }], { response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 9000 }, 90000), 2);
      const text = j.choices?.[0]?.message?.content || "";
      return { json: parseJson(text), model: `gateway:${m}` };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }
  throw new Error(`Structuring providers unavailable: ${errors.join(" | ").slice(0, 600)}`);
}

export function parseJson(text: string) {
  const s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("Model did not return JSON");
  }
}

function safeHost(u: string) {
  try { return new URL(u).host; } catch { return u; }
}

function dedupe(s: { title: string; url: string }[]) {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const x of s) {
    const u = x.url.replace(/[.,;]+$/, "");
    if (!/^https?:\/\//.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push({ title: x.title, url: u });
  }
  return out.slice(0, 20);
}
