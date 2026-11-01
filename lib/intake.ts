/* Intake with an optional Jev pass. Rules (lib/intent.ts) always run first and stay the fallback; when TYPESAFE_API_KEY
   is set and the sentence names a ready app, one Jev request asks a Noul per capability ("does this need require X?").
   Capabilities at ≥ 0.7 are selected; if none clears the bar, or Jev fails, the rules' keyword match stands. */
import { parseIntent, intentHref, type Intent, type IntentIndex } from "./intent";
import { jevConfigured, jevIntent, NOUL_YES, type Decision } from "./jev";

export async function refineIntent(q: string, index: IntentIndex[], opts: { fetchImpl?: typeof fetch } = {}): Promise<{ intent: Intent; href: string; engine: "jev" | "rules"; decisions: Decision[]; error?: string }> {
  const intent = parseIntent(q, index);
  const entry = intent.slug ? index.find((e) => e.slug === intent.slug) : undefined;
  const rules = { intent, href: intentHref(intent), engine: "rules" as const, decisions: intent.caps.map((c): Decision => ({ stage: "intake", target: c, engine: "rules", value: "selected" })) };
  if (!jevConfigured() || !intent.sentence || !entry || !entry.caps.length) return rules;
  try {
    const res = await jevIntent(q, entry.name, entry.caps, opts);
    const picked = res.filter((r) => r.p >= NOUL_YES).sort((a, b) => b.p - a.p).map((r) => r.id);
    const decisions = res.map((r): Decision => ({ stage: "intake", target: r.id, engine: "jev", value: r.p >= NOUL_YES ? "selected" : "not selected", p: r.p }));
    if (!picked.length) return { ...rules, decisions: [...decisions, ...rules.decisions.map((d) => ({ ...d, note: "Jev selected nothing; rules kept" }))] };
    const next = { ...intent, caps: picked };
    return { intent: next, href: intentHref(next), engine: "jev", decisions };
  } catch (e: any) {
    return { ...rules, error: String(e?.message || e).slice(0, 120) };
  }
}
