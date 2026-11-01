/* Publishing policy (docs/PRODUCT_DECISIONS.md). No human click is needed:
   - every new agent-generated guide is live immediately on its own share link as "Draft · agent-generated";
   - it is promoted to the public board as "Verified by checks" only when ALL of these pass:
       1. ≥ 80% of the specialists' quotes were found in the fetched source text (code check, before re-checks);
       2. no unresolved contradiction (every fact the critic flagged was confirmed or corrected on re-check);
       3. every gate fact is Sourced or Tested (each gate cites ≥ 1 fact, and none of those facts is Uncertain);
   - otherwise it stays Draft and the failed checks are listed on the guide.
   "Curated" (hand-researched) is a separate badge and is never computed. */
import type { ProviderGraph } from "./graph/schema";

export type PublishStatus = "curated" | "verified" | "draft";
export type PublishCheck = { id: "quotes" | "contradictions" | "gates"; label: string; pass: boolean; detail: string };
export type PublishVerdict = { status: PublishStatus; checks: PublishCheck[]; failed: string[]; at: string };
export type VerifierStats = { checked: number; quoteMatched: number; unresolved?: number; criticIssues?: number };

export const QUOTE_THRESHOLD = 0.8;

export const STATUS_LABEL: Record<PublishStatus, string> = {
  curated: "Curated · hand-researched",
  verified: "Verified by checks",
  draft: "Draft · agent-generated",
};

/** Facts the gates stand on: cited by a gate, by a gate's skip rule, or by a step that belongs to a gate. */
export function gateFactIds(g: ProviderGraph): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const gate of g.gates) {
    const ids = new Set<string>(gate.facts);
    for (const s of gate.skip) for (const f of s.facts) ids.add(f);
    for (const sid of gate.steps) for (const f of g.steps.find((s) => s.id === sid)?.facts || []) ids.add(f);
    out.set(gate.id, [...ids]);
  }
  return out;
}

/** Quote stats from the graph alone (for guides stored before traces carried them). */
export function statsFromGraph(g: ProviderGraph): VerifierStats {
  const cited = g.facts.filter((f) => f.status !== "tested" && !f.id.startsWith("probe") && f.id !== "composio-managed");
  return { checked: cited.length, quoteMatched: cited.filter((f) => f.status === "sourced" && !!f.quote).length, unresolved: 0 };
}

export function publishVerdict(g: ProviderGraph, v?: VerifierStats, now = new Date()): PublishVerdict {
  const at = now.toISOString();
  if (g.origin === "curated") return { status: "curated", checks: [], failed: [], at };
  const s = v || statsFromGraph(g);
  const ratio = s.checked ? s.quoteMatched / s.checked : 0;
  const quotes: PublishCheck = {
    id: "quotes", label: "Quotes found in source", pass: s.checked > 0 && ratio >= QUOTE_THRESHOLD,
    detail: s.checked ? `${s.quoteMatched}/${s.checked} matched (${Math.round(ratio * 100)}%, needs ${QUOTE_THRESHOLD * 100}%)` : "no quotes were cited",
  };
  const unresolved = s.unresolved ?? 0;
  const contradictions: PublishCheck = {
    id: "contradictions", label: "No unresolved contradiction", pass: unresolved === 0,
    detail: unresolved ? `${unresolved} flagged fact${unresolved > 1 ? "s" : ""} still unresolved after re-check` : s.criticIssues ? `${s.criticIssues} flagged, all resolved` : "none flagged",
  };
  const facts = new Map(g.facts.map((f) => [f.id, f]));
  const problems: string[] = [];
  for (const [gid, ids] of gateFactIds(g)) {
    const label = g.gates.find((x) => x.id === gid)?.label || gid;
    if (!ids.length) { problems.push(`${label}: no cited fact`); continue; }
    const weak = ids.filter((id) => (facts.get(id)?.status ?? "uncertain") === "uncertain");
    if (weak.length) problems.push(`${label}: ${weak.length} uncertain fact${weak.length > 1 ? "s" : ""}`);
  }
  const gates: PublishCheck = {
    id: "gates", label: "Every gate fact Sourced or Tested", pass: problems.length === 0,
    detail: problems.length ? problems.slice(0, 3).join("; ") + (problems.length > 3 ? ` (+${problems.length - 3})` : "") : g.gates.length ? `${g.gates.length} gate${g.gates.length > 1 ? "s" : ""}, all backed` : "no gates found",
  };
  const checks = [quotes, contradictions, gates];
  const failed = checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`);
  return { status: failed.length ? "draft" : "verified", checks, failed, at };
}
