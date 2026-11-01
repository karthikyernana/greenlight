/* Publishing policy (docs/PRODUCT_DECISIONS.md). No human click is needed:
   - every new agent-generated guide is live immediately on its own share link as "Draft · agent-generated";
   - it is promoted to the public board as "Verified by checks" only when ALL of these pass:
       1. ≥ 80% of the specialists' quotes were found in the fetched source text (code check, before re-checks);
       2. no unresolved contradiction (every fact the critic flagged was confirmed or corrected on re-check);
       3. every gate fact is Sourced or Tested (each gate cites ≥ 1 fact, and none of those facts is Uncertain);
       4. every gate cites at least one page on the provider's own domain (so a guide built from another company's
          docs, e.g. Google's verification FAQ for an app that isn't Google, can't be promoted);
   - otherwise it stays Draft and the failed checks are listed on the guide.
   "Curated" (hand-researched) is a separate badge and is never computed. */
import type { ProviderGraph } from "./graph/schema";

export type PublishStatus = "curated" | "verified" | "draft";
export type PublishCheck = { id: "quotes" | "contradictions" | "gates" | "sources"; label: string; pass: boolean; detail: string };
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
  const checks = [quotes, contradictions, gates, sourceCheck(g)];
  const failed = checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.detail}`);
  return { status: failed.length ? "draft" : "verified", checks, failed, at };
}

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
/** "developers.pipedrive.com" → "pipedrive"; "xero.com" → "xero"; "app.co.uk" style suffixes are handled loosely. */
export function brandLabel(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const sld = parts[parts.length - 2];
  return /^(co|com|net|org|gov|ac)$/.test(sld) && parts.length >= 3 ? parts[parts.length - 3] : sld;
}
/** Is this URL the provider's own page? Same brand label as the provider's domain or console, anywhere in the host
    (pipedrive.readme.io counts for pipedrive.com, docs.dropboxapi.com for dropbox.com). */
export function isProviderUrl(g: Pick<ProviderGraph, "domain" | "console">, url: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  const brands = [hostOf(`https://${g.domain}`), hostOf(g.console || "")].map(brandLabel).filter((b) => b.length >= 2);
  // exact label (pipedrive.readme.io, developers.xero.com) or the brand plus a short suffix (dropboxapi.com, googleapis.com)
  return brands.some((b) => h.split(/[.-]/).some((l) => l === b || (b.length >= 4 && l.startsWith(b) && l.length - b.length <= 4)));
}

/** Check 4: each gate stands on at least one of the provider's own pages. */
export function sourceCheck(g: ProviderGraph): PublishCheck {
  const facts = new Map(g.facts.map((f) => [f.id, f]));
  const off: string[] = [];
  for (const [gid, ids] of gateFactIds(g)) {
    if (!ids.some((id) => { const f = facts.get(id); return !!f?.url && isProviderUrl(g, f.url); })) off.push(g.gates.find((x) => x.id === gid)?.label || gid);
  }
  return {
    id: "sources", label: "Gates cite the provider's own docs", pass: off.length === 0,
    detail: off.length ? `${off.length} of ${g.gates.length} gate${g.gates.length > 1 ? "s" : ""} cite no ${g.domain} page (${off.slice(0, 2).join("; ")}${off.length > 2 ? "…" : ""})` : g.gates.length ? `all ${g.gates.length} on ${g.domain}` : "no gates found",
  };
}

/** Guides stored before check 4 existed get it applied when read, so an older "Verified" can drop to Draft. */
export function withSourceCheck(p: PublishVerdict, g: ProviderGraph): PublishVerdict {
  if (p.status === "curated" || p.checks.some((c) => c.id === "sources")) return p;
  const c = sourceCheck(g);
  const checks = [...p.checks, c];
  const failed = c.pass ? p.failed : [...p.failed, `${c.label}: ${c.detail}`];
  return { ...p, checks, failed, status: failed.length ? "draft" : p.status };
}
