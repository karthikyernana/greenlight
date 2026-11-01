import { getVercelOidcToken } from "@vercel/oidc";

/* Model providers, tried in this order. Paste whichever key you have; none is required for the app to run.
   1. GEMINI_API_KEY      Gemini direct. Research is grounded with Google Search. (free tier available)
   2. GROQ_API_KEY        Groq. Research uses groq/compound (built-in web search); structuring uses an open model. (free tier)
   3. OPENROUTER_API_KEY  OpenRouter free models. Research is UNGROUNDED, so the agent leans on the pages it fetches itself.
   4. AI Gateway          Vercel AI Gateway via AI_GATEWAY_API_KEY or the deployment's OIDC token (needs a card on the Vercel team).
   Each call retries 429/5xx with backoff, then falls through to the next provider. */

export type ResearchOut = { text: string; sources: { title: string; url: string }[]; model: string; grounded: boolean };

const env = (k: string) => (process.env[k] || "").trim();
const list = (k: string, d: string) => (env(k) || d).split(",").map((s) => s.trim()).filter(Boolean);

const GEMINI_MODELS = () => list("GEMINI_MODEL", "gemini-2.5-flash,gemini-flash-latest,gemini-2.0-flash");
const GROQ_RESEARCH = () => list("GROQ_RESEARCH_MODEL", "groq/compound,groq/compound-mini");
const GROQ_STRUCT = () => list("GROQ_MODEL", "openai/gpt-oss-120b,llama-3.3-70b-versatile");
const OR_MODELS = () => list("OPENROUTER_MODEL", "openai/gpt-oss-20b:free,meta-llama/llama-3.3-70b-instruct:free,deepseek/deepseek-chat-v3.1:free");
const GW_RESEARCH = () => env("GL_RESEARCH_MODEL") || "perplexity/sonar";
const GW_STRUCT = () => list("GL_STRUCT_MODELS", "google/gemini-2.5-flash,openai/gpt-5-mini");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class HttpErr extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

async function gatewayAuth(): Promise<string | null> {
  if (env("AI_GATEWAY_API_KEY")) return env("AI_GATEWAY_API_KEY");
  if (!process.env.VERCEL) return null;
  try { return await getVercelOidcToken(); } catch { return process.env.VERCEL_OIDC_TOKEN || null; }
}

export type ProviderInfo = { id: "gemini" | "groq" | "openrouter" | "gateway"; env: string; configured: boolean; grounded: boolean };

export async function providerStatus() {
  const providers: ProviderInfo[] = [
    { id: "gemini", env: "GEMINI_API_KEY", configured: !!env("GEMINI_API_KEY"), grounded: true },
    { id: "groq", env: "GROQ_API_KEY", configured: !!env("GROQ_API_KEY"), grounded: true },
    { id: "openrouter", env: "OPENROUTER_API_KEY", configured: !!env("OPENROUTER_API_KEY"), grounded: false },
    { id: "gateway", env: "AI_GATEWAY_API_KEY", configured: !!env("AI_GATEWAY_API_KEY"), grounded: true },
  ];
  const explicit = providers.some((p) => p.configured);
  return {
    providers,
    // OIDC gateway exists on every Vercel deployment but only works once the team has a card on file.
    gatewayOidc: !!process.env.VERCEL && !env("AI_GATEWAY_API_KEY"),
    any: explicit,
    hint: explicit ? null : "No model key set. Add GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY to the Vercel project and redeploy. Probes and the Composio check run without one.",
  };
}

export function anyKeyConfigured() {
  return !!(env("GEMINI_API_KEY") || env("GROQ_API_KEY") || env("OPENROUTER_API_KEY") || env("AI_GATEWAY_API_KEY") || process.env.VERCEL);
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
      if (i < tries - 1) await sleep(700 * 2 ** i);
    }
  }
  throw last;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, label: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new HttpErr(r.status, `${label} ${r.status}: ${txt.slice(0, 240)}`);
    return JSON.parse(txt);
  } catch (e: any) {
    if (e?.name === "AbortError") throw new HttpErr(504, `${label} timed out`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** OpenAI-compatible chat (Groq, OpenRouter, AI Gateway). Walks the model list on 400/404 (model retired or unsupported option). */
async function chat(base: string, key: string, models: string[], messages: any[], extra: Record<string, unknown>, label: string, timeoutMs = 60000) {
  let lastErr: unknown;
  for (const model of models) {
    try {
      const j = await withRetry(() => postJson(base, { authorization: `Bearer ${key}`, ...(base.includes("openrouter") ? { "x-title": "Greenlight", "http-referer": "https://github.com/karthikyernana/greenlight" } : {}) }, { model, messages, ...extra }, timeoutMs, `${label}:${model}`), 2);
      return { j, model };
    } catch (e: any) {
      lastErr = e;
      if (e?.status === 401 || e?.status === 403) throw e; // bad key: no point trying other models
    }
  }
  throw lastErr;
}

let geminiOk = "";
async function gemini(body: any, timeoutMs = 60000) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new HttpErr(401, "No GEMINI_API_KEY");
  const models = GEMINI_MODELS();
  const order = geminiOk ? [geminiOk, ...models.filter((m) => m !== geminiOk)] : models;
  let lastErr: unknown;
  for (const model of order) {
    try {
      const j = await withRetry(() => postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": key }, body, timeoutMs, `gemini:${model}`), 2);
      geminiOk = model;
      return { j, model };
    } catch (e: any) {
      lastErr = e;
      if (e?.status !== 404 && e?.status !== 429 && !(e?.status >= 500)) throw e;
    }
  }
  throw lastErr;
}

const URL_RE = /https?:\/\/[^\s)\]>"'`,]+/g;

export async function research(prompt: string): Promise<ResearchOut> {
  const errors: string[] = [];

  if (env("GEMINI_API_KEY")) {
    try {
      let grounded = true;
      const { j, model } = await gemini({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }).catch(async (e: any) => {
        if (e?.status !== 400) throw e; // some keys/models reject the search tool
        grounded = false;
        return gemini({ contents: [{ role: "user", parts: [{ text: prompt + "\nInclude the full URL of every official page you rely on." }] }] });
      });
      const cand = j.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p: any) => p.text || "").join("\n");
      const chunks = cand?.groundingMetadata?.groundingChunks || [];
      const sources = chunks.map((c: any) => ({ title: c.web?.title || "source", url: c.web?.uri || "" })).filter((s: any) => s.url);
      for (const u of text.match(URL_RE) || []) sources.push({ title: safeHost(u), url: u });
      const resolved = await Promise.all(sources.slice(0, 14).map(async (s: { title: string; url: string }) => ({ title: s.title, url: await unredirect(s.url) })));
      return { text, sources: dedupe(resolved), model: `gemini:${model}${grounded ? "+google_search" : ""}`, grounded };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }

  if (env("GROQ_API_KEY")) {
    try {
      const { j, model } = await chat("https://api.groq.com/openai/v1/chat/completions", env("GROQ_API_KEY"), GROQ_RESEARCH(), [{ role: "user", content: prompt + "\nCite the full URL of every official page you rely on." }], { max_tokens: 3000 }, "groq", 90000);
      const msg = j.choices?.[0]?.message || {};
      const text: string = msg.content || "";
      const found: { title: string; url: string }[] = [];
      for (const t of msg.executed_tools || []) for (const r of t?.search_results?.results || []) if (r?.url) found.push({ title: r.title || safeHost(r.url), url: r.url });
      for (const u of text.match(URL_RE) || []) found.push({ title: safeHost(u), url: u });
      return { text, sources: dedupe(found), model: `groq:${model}`, grounded: found.length > 0 };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }

  if (env("OPENROUTER_API_KEY")) {
    try {
      const { j, model } = await chat("https://openrouter.ai/api/v1/chat/completions", env("OPENROUTER_API_KEY"), OR_MODELS(), [{ role: "user", content: prompt + "\nYou cannot browse. Say clearly what you are unsure about. List the full URLs of the official documentation pages a developer should read." }], { max_tokens: 2500, temperature: 0.2 }, "openrouter", 90000);
      const text: string = j.choices?.[0]?.message?.content || "";
      return { text, sources: dedupe((text.match(URL_RE) || []).map((u: string) => ({ title: safeHost(u), url: u }))), model: `openrouter:${model}`, grounded: false };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }

  const gw = await gatewayAuth();
  if (gw) {
    try {
      const { j, model } = await chat("https://ai-gateway.vercel.sh/v1/chat/completions", gw, [GW_RESEARCH()], [{ role: "user", content: prompt }], { max_tokens: 2500 }, "gateway");
      const msg = j.choices?.[0]?.message || {};
      const text: string = msg.content || "";
      const cites: string[] = [...(j.citations || []), ...((j.search_results || []).map((s: any) => s.url))];
      const titled = (j.search_results || []).map((s: any) => ({ title: s.title || safeHost(s.url), url: s.url }));
      const sources = [...cites, ...(text.match(URL_RE) || [])].map((u) => ({ title: safeHost(u), url: u }));
      return { text, sources: dedupe([...titled, ...sources]), model: `gateway:${model}`, grounded: true };
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }
  }

  throw new Error(errors.length ? `Research providers unavailable: ${errors.join(" | ").slice(0, 600)}` : "NO_MODEL_KEY");
}

/** Ask for a JSON object. Same provider order as research. */
export async function structured(system: string, user: string): Promise<{ json: any; model: string }> {
  const errors: string[] = [];
  const msgs = [{ role: "system", content: system }, { role: "user", content: user }];

  if (env("GEMINI_API_KEY")) {
    try {
      const { j, model } = await gemini({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
      const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
      return { json: parseJson(text), model: `gemini:${model}` };
    } catch (e: any) { errors.push(String(e?.message || e)); }
  }
  if (env("GROQ_API_KEY")) {
    try {
      const { j, model } = await chat("https://api.groq.com/openai/v1/chat/completions", env("GROQ_API_KEY"), GROQ_STRUCT(), msgs, { response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 8000 }, "groq", 90000);
      return { json: parseJson(j.choices?.[0]?.message?.content || ""), model: `groq:${model}` };
    } catch (e: any) { errors.push(String(e?.message || e)); }
  }
  if (env("OPENROUTER_API_KEY")) {
    try {
      const { j, model } = await chat("https://openrouter.ai/api/v1/chat/completions", env("OPENROUTER_API_KEY"), OR_MODELS(), msgs, { response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 8000 }, "openrouter", 120000);
      return { json: parseJson(j.choices?.[0]?.message?.content || ""), model: `openrouter:${model}` };
    } catch (e: any) { errors.push(String(e?.message || e)); }
  }
  const gw = await gatewayAuth();
  if (gw) {
    try {
      const { j, model } = await chat("https://ai-gateway.vercel.sh/v1/chat/completions", gw, GW_STRUCT(), msgs, { response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 9000 }, "gateway", 90000);
      return { json: parseJson(j.choices?.[0]?.message?.content || ""), model: `gateway:${model}` };
    } catch (e: any) { errors.push(String(e?.message || e)); }
  }
  throw new Error(`Structuring providers unavailable: ${errors.join(" | ").slice(0, 600) || "NO_MODEL_KEY"}`);
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

/** Grounding chunks come back as vertexaisearch redirect links; resolve them to the real page. */
async function unredirect(u: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com/.test(u)) return u;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(u, { redirect: "manual", signal: ctl.signal });
    return r.headers.get("location") || u;
  } catch {
    return u;
  } finally {
    clearTimeout(t);
  }
}

function safeHost(u: string) {
  try { return new URL(u).host; } catch { return u; }
}

export function dedupe(s: { title: string; url: string }[]) {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const x of s) {
    const u = x.url.replace(/[.,;:*]+$/, "");
    if (!/^https?:\/\//.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push({ title: x.title, url: u });
  }
  return out.slice(0, 20);
}
