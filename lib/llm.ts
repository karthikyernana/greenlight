import type { z } from "zod";

/* Model providers for JSON-only calls. No tool calling, no provider-side search: retrieval is ours (lib/retrieval.ts).
   Order:
   1. LLM_BASE_URL + LLM_API_KEY + LLM_MODEL   any OpenAI-compatible chat-completions endpoint (primary; e.g. a DeepSeek model).
      LLM_MODEL may be a comma list; later models are fallbacks.
   2. GEMINI_API_KEY                            Gemini generateContent, JSON mime type.
   3. GROQ_API_KEY                              Groq (OpenAI-compatible).
   4. OPENROUTER_API_KEY                        OpenRouter free models.
   Each call: timeout, retry on 429/5xx with backoff, then the next model, then the next provider.
   Output: <think> blocks and reasoning_content are ignored, the first balanced JSON object is parsed, zod validates,
   and one repair round is sent back to the model with the validation errors. */

const env = (k: string) => (process.env[k] || "").trim();
const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpErr extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}
export class BudgetErr extends Error {}

export type Usage = { prompt: number; completion: number };
export type CallRecord = { stage: string; provider: string; model: string; ms: number; prompt: number; completion: number; ok: boolean; error?: string; repaired?: boolean };

/** Per-run budget and call log. Shared by every stage of one investigation. */
export class RunBudget {
  used = 0;
  calls: CallRecord[] = [];
  constructor(public limit = Number(env("LLM_TOKEN_BUDGET")) || 120_000) {}
  check(est: number) {
    if (this.used + est > this.limit) throw new BudgetErr(`Token budget exhausted (${this.used}/${this.limit})`);
  }
  add(r: CallRecord) {
    this.used += r.prompt + r.completion;
    this.calls.push(r);
  }
}

type Provider = {
  id: string; label: string; models: string[];
  call: (model: string, system: string, user: string, timeoutMs: number, signal?: AbortSignal) => Promise<{ text: string; usage: Usage }>;
  /** Extra models the endpoint lists (GET /models), used as hedges/fallbacks after the configured ones. */
  discover?: () => Promise<string[]>;
};

function compatUrl(base: string) {
  const b = base.replace(/\/+$/, "");
  return /\/chat\/completions$/.test(b) ? b : `${b}/chat/completions`;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, label: string, outer?: AbortSignal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const onOuter = () => ctl.abort();
  outer?.addEventListener("abort", onOuter);
  try {
    const r = await fetch(url, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new HttpErr(r.status, `${label} ${r.status}: ${txt.slice(0, r.status === 429 ? 600 : 200).replace(/org_[a-z0-9]{8,}/gi, "org_[redacted]")}`);
    return JSON.parse(txt);
  } catch (e: any) {
    if (e?.name === "AbortError") throw new HttpErr(408, outer?.aborted ? `${label} cancelled (another model answered first)` : `${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(t);
    outer?.removeEventListener("abort", onOuter);
  }
}

/** OpenAI-compatible chat call. Tries JSON mode first; if the endpoint rejects response_format (400), retries without it. */
function openAICompat(id: string, label: string, base: string, key: string, models: string[], extraHeaders: Record<string, string> = {}): Provider {
  const url = compatUrl(base);
  const noJsonMode = new Set<string>();
  let discovered: string[] | null = null;
  return {
    id, label, models,
    async discover() {
      if (env("LLM_AUTO_FALLBACK") === "0" || id !== "llm") return [];
      if (discovered) return discovered;
      try {
        const r = await fetch(url.replace(/\/chat\/completions$/, "/models"), { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
        const j: any = await r.json();
        discovered = (j.data || []).filter((m: any) => !m.architecture || /text->text/.test(m.architecture.modality || "text->text")).map((m: any) => String(m.id)).filter((m: string) => !models.includes(m) && !/embed|whisper|tts|image|vision/i.test(m)).slice(0, 3);
      } catch { discovered = []; }
      return discovered || [];
    },
    async call(model, system, user, timeoutMs, signal) {
      const body: any = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: Number(env("LLM_MAX_TOKENS")) || 2500 };
      const tryOnce = async (json: boolean) => postJson(url, { authorization: `Bearer ${key}`, ...extraHeaders }, json ? { ...body, response_format: { type: "json_object" } } : body, timeoutMs, `${id}:${model}`, signal);
      let j: any;
      if (noJsonMode.has(model)) j = await tryOnce(false);
      else {
        try { j = await tryOnce(true); } catch (e: any) {
          if (e?.status !== 400 && e?.status !== 422) throw e;
          noJsonMode.add(model);
          j = await tryOnce(false);
        }
      }
      const msg = j.choices?.[0]?.message || {};
      // reasoning models (DeepSeek R1 style) put chain-of-thought in reasoning_content or <think> blocks: never parsed
      const text = String(msg.content ?? "");
      return { text, usage: { prompt: j.usage?.prompt_tokens || 0, completion: j.usage?.completion_tokens || 0 } };
    },
  };
}

function gemini(key: string, models: string[]): Provider {
  return {
    id: "gemini", label: "Gemini", models,
    async call(model, system, user, timeoutMs, signal) {
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": key }, {
        systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, ...(/2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: Number(env("GEMINI_THINKING_BUDGET") || 0) } } : {}) },
      }, timeoutMs, `gemini:${model}`, signal);
      const text = (j.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("");
      return { text, usage: { prompt: j.usageMetadata?.promptTokenCount || 0, completion: j.usageMetadata?.candidatesTokenCount || 0 } };
    },
  };
}

/** Defaults when GEMINI_MODEL / GROQ_MODEL are unset. A 404 on one model moves to the next. */
export const GEMINI_DEFAULT = "gemini-2.5-flash,gemini-flash-latest";
/* Groq models listed by GET /models on 2026-11-01. Each has its own tokens-per-minute limit on the free tier,
   so the 20B and Qwen models are real fallbacks when the 120B hits its TPM cap. */
export const GROQ_DEFAULT = "openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b";
export const FALLBACK_ORDER = ["LLM_* (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL)", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"];

export function providers(): Provider[] {
  const out: Provider[] = [];
  if (env("LLM_BASE_URL") && env("LLM_API_KEY") && env("LLM_MODEL")) out.push(openAICompat("llm", "OpenAI-compatible (LLM_*)", env("LLM_BASE_URL"), env("LLM_API_KEY"), list(env("LLM_MODEL"))));
  if (env("GEMINI_API_KEY")) out.push(gemini(env("GEMINI_API_KEY"), list(env("GEMINI_MODEL") || GEMINI_DEFAULT)));
  if (env("GROQ_API_KEY")) out.push(openAICompat("groq", "Groq", "https://api.groq.com/openai/v1", env("GROQ_API_KEY"), list(env("GROQ_MODEL") || GROQ_DEFAULT)));
  if (env("OPENROUTER_API_KEY")) out.push(openAICompat("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", env("OPENROUTER_API_KEY"), list(env("OPENROUTER_MODEL") || "openai/gpt-oss-20b:free,deepseek/deepseek-chat-v3.1:free"), { "x-title": "Greenlight" }));
  return out;
}

export function providerStatus() {
  const ps = providers();
  const host = (u: string) => { try { return new URL(u).host; } catch { return ""; } };
  return {
    primary: ps[0] ? { id: ps[0].id, label: ps[0].label, model: ps[0].models[0], host: ps[0].id === "llm" ? host(env("LLM_BASE_URL")) : undefined } : null,
    configured: ps.map((p) => ({ id: p.id, label: p.label, models: p.models })),
    /** The order calls fall through when a provider fails (402/5xx/timeouts/invalid JSON); unset ones are skipped. */
    fallbackOrder: FALLBACK_ORDER,
    order: ps.map((p) => p.id),
    gemini: { configured: !!env("GEMINI_API_KEY"), models: list(env("GEMINI_MODEL") || GEMINI_DEFAULT), modelFrom: env("GEMINI_MODEL") ? "GEMINI_MODEL" : "default" },
    groq: { configured: !!env("GROQ_API_KEY"), models: list(env("GROQ_MODEL") || GROQ_DEFAULT), modelFrom: env("GROQ_MODEL") ? "GROQ_MODEL" : "default" },
    missing: {
      LLM_BASE_URL: !env("LLM_BASE_URL"), LLM_API_KEY: !env("LLM_API_KEY"), LLM_MODEL: !env("LLM_MODEL"),
    },
    retrieval: "own (web search + direct fetch); no provider grounding",
    any: ps.length > 0,
    hint: ps.length ? null : "No model configured. Set LLM_BASE_URL + LLM_API_KEY + LLM_MODEL, or GEMINI_API_KEY, or GROQ_API_KEY on the Vercel project and redeploy. Stored guides still load; probes and the Composio check run without a model.",
  };
}

export function anyKeyConfigured() {
  return providers().length > 0;
}

/** Strip reasoning, fences and trailing junk; return the first balanced JSON object. */
export function extractJson(raw: string): unknown {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{");
  if (a < 0) throw new Error("Model did not return JSON");
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(s.slice(a, i + 1));
  }
  throw new Error("Model returned truncated JSON");
}

async function withRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) {
      last = e;
      const st = e?.status || 0;
      if (st && st < 500 && st !== 429) break;
      // rate limits that name their reset ("try again in 7.4s") are waited out, up to 15s
      const m = st === 429 ? String(e?.message || "").match(/try again in ([\d.]+)\s*(ms|s)/i) : null;
      const waitMs = m ? Math.min(15_000, Number(m[1]) * (m[2].toLowerCase() === "ms" ? 1 : 1000) + 250) : 600 * 2 ** i;
      if (i < tries - 1) await sleep(waitMs);
    }
  }
  throw last;
}

export type JsonCall<T> = { stage: string; system: string; user: string; schema: z.ZodType<T>; budget: RunBudget; timeoutMs?: number; providers?: Provider[]; hedgeMs?: number };

/* Per-instance memory of how each model behaves (EWMA of time to a valid answer, failures count as slow).
   Models that keep answering fast move to the front of the hedge order; the configured order breaks ties. */
const g = globalThis as unknown as { __glModelStats?: Map<string, { ms: number; n: number }> };
const stats = (g.__glModelStats ??= new Map());
function record(model: string, ms: number, ok: boolean) {
  const v = ok ? ms : Math.max(ms, 150_000);
  const s = stats.get(model);
  stats.set(model, s ? { ms: s.ms * 0.6 + v * 0.4, n: s.n + 1 } : { ms: v, n: 1 });
}
export function orderModels(models: string[]): string[] {
  return models.map((m, i) => ({ m, i, s: stats.get(m) })).sort((a, b) => {
    if (a.s && b.s) return a.s.ms - b.s.ms;
    if (a.s && !b.s) return a.s.ms < 60_000 ? -1 : 1;
    if (!a.s && b.s) return b.s.ms < 60_000 ? 1 : -1;
    return a.i - b.i;
  }).map((x) => x.m);
}

/** One model, one validated answer: call → parse → zod → (one repair round) → data. Logged on the budget. */
async function attempt<T>(c: JsonCall<T>, p: Provider, model: string, signal: AbortSignal): Promise<{ data: T; model: string; provider: string }> {
  const t0 = Date.now();
  let repaired = false;
  let usage: Usage = { prompt: 0, completion: 0 };
  try {
    c.budget.check(Math.ceil((c.system.length + c.user.length) / 4) + 1500);
    let r = await withRetry(() => p.call(model, c.system, c.user, c.timeoutMs || 150_000, signal));
    usage = { ...r.usage };
    let issues = "";
    try {
      const v = c.schema.safeParse(extractJson(r.text));
      if (v.success) {
        c.budget.add({ stage: c.stage, provider: p.id, model, ms: Date.now() - t0, prompt: usage.prompt, completion: usage.completion, ok: true });
        record(model, Date.now() - t0, true);
        return { data: v.data, model, provider: p.id };
      }
      issues = v.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e: any) {
      issues = String(e?.message || e);
    }
    repaired = true;
    c.budget.check(Math.ceil((c.system.length + c.user.length) / 4) + 2000);
    const fix = `${c.user}\n\nYour previous answer was invalid: ${issues}.\nPrevious answer (truncated): ${r.text.slice(0, 1500)}\nReturn ONLY one corrected JSON object that matches the schema.`;
    r = await p.call(model, c.system, fix, c.timeoutMs || 150_000, signal);
    usage = { prompt: usage.prompt + r.usage.prompt, completion: usage.completion + r.usage.completion };
    const v2 = c.schema.safeParse(extractJson(r.text));
    if (v2.success) {
      c.budget.add({ stage: c.stage, provider: p.id, model, ms: Date.now() - t0, prompt: usage.prompt, completion: usage.completion, ok: true, repaired });
      record(model, Date.now() - t0, true);
      return { data: v2.data, model, provider: p.id };
    }
    throw new Error(`invalid after repair: ${v2.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  } catch (e: any) {
    if (!signal.aborted && !(e instanceof BudgetErr)) record(model, Date.now() - t0, false);
    if (!(e instanceof BudgetErr)) c.budget.add({ stage: c.stage, provider: p.id, model, ms: Date.now() - t0, prompt: usage.prompt, completion: usage.completion, ok: false, error: String(e?.message || e).slice(0, 200), repaired });
    throw e;
  }
}

/**
 * One validated JSON answer.
 * Within a provider the models are HEDGED: the first model starts; if it has not answered after `hedgeMs`
 * (LLM_HEDGE_MS, default 25s) or it fails, the next model starts too, up to 3 in flight. First valid answer wins,
 * the rest are cancelled. Providers are tried in order after that.
 */
export async function llmJson<T>(c: JsonCall<T>): Promise<{ data: T; model: string; provider: string }> {
  const ps = c.providers || providers();
  if (!ps.length) throw new HttpErr(401, "NO_MODEL_KEY");
  const errors: string[] = [];
  const hedgeMs = c.hedgeMs ?? (Number(env("LLM_HEDGE_MS")) || 25_000);
  for (const p of ps) {
    const models = orderModels([...p.models, ...((await p.discover?.()) || [])]);
    const ctl = new AbortController();
    try {
      const won = await new Promise<{ data: T; model: string; provider: string }>((resolve, reject) => {
        let next = 0, running = 0, done = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const launch = () => {
          if (done || next >= models.length) return;
          const m = models[next++];
          running++;
          clearTimeout(timer);
          if (next < models.length && running < 3) timer = setTimeout(launch, hedgeMs);
          attempt(c, p, m, ctl.signal).then(
            (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } },
            (e: any) => {
              running--;
              errors.push(`${p.id}:${m}: ${String(e?.message || e).slice(0, 160)}`);
              if (done) return;
              if (e instanceof BudgetErr || e?.status === 401 || e?.status === 403) { done = true; clearTimeout(timer); reject(e); return; }
              if (next < models.length) launch();
              else if (running === 0) { done = true; clearTimeout(timer); reject(new Error("all models failed")); }
            },
          );
        };
        launch();
      });
      ctl.abort();
      return won;
    } catch (e: any) {
      ctl.abort();
      if (e instanceof BudgetErr) throw e;
    }
  }
  throw new Error(`All models failed: ${errors.join(" | ").slice(0, 600)}`);
}
