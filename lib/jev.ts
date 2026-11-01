/* Optional typed-decision layer: TypeSafe's Jev ("System One" model). Plain fetch, no SDK dependency.
   API (docs.typesafe.ai, OpenAPI at api.typesafe.ai/openapi.json, read 2026-11-01):
     POST https://api.typesafe.ai/v1/systemone   Authorization: Bearer $TYPESAFE_API_KEY
     { model, state, questions: { <id>: { type: "noul"|"choice"|"score", instructions, criteria? } } }
     → { model, answers: { <id>: { type:"noul", noul } | { type:"choice", choice, confidence, probabilities } }, usage }
   Jev never writes text. We use it only for decisions our code consumes (a tier, a yes/no, a capability set), and
   every caller falls back to the existing LLM / rules path when the key is unset, the call fails, or the answer is unsettled. */

const env = (k: string) => (process.env[k] || "").trim();
export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export type NoulQ = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQ = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type JevQuestion = NoulQ | ChoiceQ;
export type NoulA = { type: "noul"; noul: number };
export type ChoiceA = { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
export type JevAnswer = NoulA | ChoiceA;
export type JevResult = { model: string; answers: Record<string, JevAnswer>; ms: number; usage?: { input_tokens: number; output_tokens: number } };

/** Thresholds from TypeSafe's guidance (0.7 yes / 0.3 no; the band between is "not settled"). */
export const NOUL_YES = 0.7;
export const NOUL_NO = 0.3;
export const CHOICE_MIN_CONF = 0.6;

export const jevConfigured = () => !!env("TYPESAFE_API_KEY") && env("JEV_DISABLE") !== "1";
export const jevModel = () => env("TYPESAFE_MODEL") || "jev-latest";
export function jevStatus() {
  return { configured: jevConfigured(), model: jevConfigured() ? jevModel() : null, uses: ["scope tier (choice)", "quote supports claim (noul)", "need → capabilities (noul)"] };
}

/** A decision record for traces: which engine decided, and how sure it was. */
export type Decision = { stage: string; target: string; engine: "jev" | "llm" | "rules" | "code"; value: string; p?: number; note?: string };
export const label = (d: Decision) => (d.engine === "jev" ? `Jev ${d.p?.toFixed(2)}` : d.engine === "llm" ? "LLM" : d.engine === "code" ? "code" : "rules");

/** One request, any number of questions. Throws on any failure: a failed call is an error, never a "no". */
export async function jevAsk(state: unknown, questions: Record<string, JevQuestion>, opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<JevResult> {
  if (!jevConfigured()) throw new Error("Jev not configured");
  if (!Object.keys(questions).length) return { model: jevModel(), answers: {}, ms: 0 };
  const f = opts.fetchImpl || fetch;
  const ctl = new AbortController();
  const t0 = Date.now();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? Number(env("JEV_TIMEOUT_MS") || 6000));
  try {
    const r = await f(JEV_URL, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env("TYPESAFE_API_KEY")}` },
      body: JSON.stringify({ model: jevModel(), state, questions }),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Jev ${r.status}: ${txt.slice(0, 160)}`);
    const d = JSON.parse(txt);
    if (!d || typeof d.answers !== "object") throw new Error("Jev: no answers");
    for (const id of Object.keys(questions)) {
      const a = d.answers[id];
      if (!a || (a.type === "noul" && typeof a.noul !== "number") || (a.type === "choice" && typeof a.choice !== "string")) throw new Error(`Jev: bad answer for ${id}`);
    }
    return { model: String(d.model || jevModel()), answers: d.answers, ms: Date.now() - t0, usage: d.usage };
  } catch (e: any) {
    throw new Error(e?.name === "AbortError" ? "Jev timed out" : String(e?.message || e));
  } finally {
    clearTimeout(timer);
  }
}

/* ───────── question wording lives here, in one place ───────── */

export const TIER_OPTIONS: Record<string, string> = {
  none: "Any app can request this permission as soon as it is registered; the provider does no review before the public can grant it",
  sensitive: "The provider reviews or approves the app (app review, verification) before the public can grant this permission",
  restricted: "Beyond app review, the provider requires a security assessment, audit, or business verification before the public can grant it",
  partner: "Only apps accepted into a gated partner or elevated-access program can use it; approval is not guaranteed",
  paid: "No review, but the provider bills per API call or requires a paid plan to use it",
};

/** (a) Scope classifier: one Choice per scope, all in one request. Returns tier + confidence per scope key. */
export async function jevTiers(app: string, evidence: string, items: { key: string; scope: string; capability: string }[], opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const qs: Record<string, JevQuestion> = {};
  items.forEach((it, i) => {
    qs[`t${i}`] = { type: "choice", instructions: `What does ${app} require before the general public can grant the OAuth permission "${it.scope}" (used to: ${it.capability}) to a third-party app, according to \`evidence\`?`, criteria: TIER_OPTIONS };
  });
  const r = await jevAsk({ app, evidence: evidence.slice(0, 12_000) }, qs, opts);
  return items.map((it, i) => {
    const a = r.answers[`t${i}`] as ChoiceA;
    return { key: it.key, tier: a.choice, confidence: a.confidence, settled: a.confidence >= CHOICE_MIN_CONF && a.choice in TIER_OPTIONS };
  });
}

/** (b) Verifier: does this verbatim quote support this claim? One Noul per fact, one request. */
export async function jevSupport(items: { id: string; claim: string; quote: string }[], opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const qs: Record<string, JevQuestion> = {};
  const state: Record<string, { claim: string; quote: string }> = {};
  items.forEach((it, i) => {
    state[`fact_${i}`] = { claim: it.claim, quote: it.quote };
    qs[`s${i}`] = { type: "noul", instructions: `Does \`fact_${i}.quote\` support \`fact_${i}.claim\`?`, criteria: { true: "The quote states the claim or directly implies it", false: "The quote is about something else, is too general to back the claim, or says the opposite" } };
  });
  const r = await jevAsk(state, qs, opts);
  return items.map((it, i) => {
    const p = (r.answers[`s${i}`] as NoulA).noul;
    return { id: it.id, p, verdict: p >= NOUL_YES ? ("supports" as const) : p < NOUL_NO ? ("no" as const) : ("unsettled" as const) };
  });
}

/** (c) Intake: which capabilities does this need sentence ask for? One Noul per capability. */
export async function jevIntent(need: string, app: string, caps: { id: string; label?: string; keywords: string[] }[], opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const qs: Record<string, JevQuestion> = {};
  caps.forEach((c, i) => {
    qs[`c${i}`] = { type: "noul", instructions: `Does the developer's agent, as described in \`need\`, need to ${(c.label || c.id).toLowerCase()} in ${app}?`, criteria: { true: `The need says or clearly implies the agent will ${(c.label || c.id).toLowerCase()} (related words: ${c.keywords.slice(0, 5).join(", ")})`, false: "The need does not mention or imply this" } };
  });
  const r = await jevAsk({ need, app }, qs, { timeoutMs: 2500, ...opts });
  return caps.map((c, i) => ({ id: c.id, p: (r.answers[`c${i}`] as NoulA).noul }));
}
