/* Harness. Runs the investigation pipeline BLIND on the golden set (the 10 hand-researched providers) and scores it
   against the hand-built graphs.
     npm run eval                          in-process, uses LLM_* (or other) provider from the environment
     npm run eval -- --mock                heuristic mock model, live web (no key needed)
     npm run eval -- --mock --faults       mock + one fabricated quote per app (the verifier must catch them)
     EVAL_BASE_URL=https://… npm run eval  against a deployed instance's /api/generate
   Options: --apps gmail,slack   --budget 60000   --concurrency 3   --tag firecrawl (suffix for the result file)
   Writes eval/results/<date>-<mode>.json and .md, and every trace to public/traces/<id>.json (viewable at /trace/<id>). */
import { mkdirSync, writeFileSync } from "node:fs";
import { investigate, type PipeEvent } from "../lib/pipeline/run";
import { mockProvider } from "../lib/pipeline/mock";
import { getGraph, GOLDEN } from "../lib/graph/load";
import { plan, defaultNeed } from "../lib/engine";
import { ProviderGraph, type GateKind } from "../lib/graph/schema";
import type { Trace } from "../lib/pipeline/trace";

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const BASE = process.env.EVAL_BASE_URL?.replace(/\/$/, "");
const MODE = BASE ? "remote" : flag("mock") ? (flag("faults") ? "mock-faults" : "mock") : "live";
const apps = (opt("apps") || GOLDEN.join(",")).split(",").filter(Boolean);
const budget = Number(opt("budget")) || 80_000;

const FAMILY: Record<GateKind, string> = {
  app_review: "review", brand_verification: "review", marketplace_listing: "review", publisher_verification: "verification", business_verification: "verification",
  security_assessment: "security", partner_program: "partner", install_cap: "cap", payment: "payment", admin_approval: "admin",
};
const normScope = (s: string) => s.toLowerCase().replace(/^https?:\/\/[^ ]*\/auth\//, "").replace(/[^a-z0-9]/g, "");
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
const jacc = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((x) => b.has(x)).length; return i / Math.max(1, new Set([...a, ...b]).size); };

function score(gold: ProviderGraph, pred: ProviderGraph | null) {
  if (!pred) return { tierAcc: 0, capCoverage: 0, gateRecall: 0, gateRecallLoose: 0, waitOverlap: 0, goldWait: "", predWait: "" };
  let matched = 0, correct = 0;
  for (const gc of gold.capabilities) {
    const gs = new Set(gc.scopes.map((s) => normScope(s.name)).filter(Boolean));
    let best: { c: (typeof pred.capabilities)[number]; s: number } | null = null;
    for (const pc of pred.capabilities) {
      const ps = new Set(pc.scopes.map((s) => normScope(s.name)));
      const so = [...gs].some((x) => ps.has(x)) ? 1 : 0;
      const s = so + jacc(tokens(gc.label), tokens(pc.label));
      if (s >= 0.34 && (!best || s > best.s)) best = { c: pc, s };
    }
    if (best) { matched++; if (best.c.tier === gc.tier) correct++; }
  }
  const gk = new Set(gold.gates.map((g) => g.kind)), pk = new Set(pred.gates.map((g) => g.kind));
  const gf = new Set([...gk].map((k) => FAMILY[k])), pf = new Set([...pk].map((k) => FAMILY[k]));
  const gp = plan(gold, defaultNeed(gold), { suggestions: false }), pp = plan(pred, defaultNeed(pred), { suggestions: false });
  const L = (d: number) => Math.log1p(Math.max(0, d));
  const [a0, a1] = gp.days.map(L), [b0, b1] = pp.days.map(L);
  const inter = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)), uni = Math.max(a1, b1) - Math.min(a0, b0);
  const waitOverlap = gp.days[1] < 1 && pp.days[1] < 1 ? 1 : uni <= 0 ? (Math.abs(a1 - b1) < 0.2 ? 1 : 0) : inter / uni;
  return {
    tierAcc: correct / gold.capabilities.length, capCoverage: matched / gold.capabilities.length,
    gateRecall: gk.size ? [...gk].filter((k) => pk.has(k)).length / gk.size : pk.size ? 0.5 : 1,
    gateRecallLoose: gf.size ? [...gf].filter((k) => pf.has(k)).length / gf.size : pf.size ? 0.5 : 1,
    waitOverlap, goldWait: gp.wait, predWait: pp.wait,
  };
}

async function runLocal(name: string) {
  const evs: PipeEvent[] = [];
  const providers = flag("mock") ? [mockProvider({ faults: flag("faults") })] : undefined;
  for await (const e of investigate(name, { providers, budget, composioSlug: undefined })) evs.push(e);
  return evs;
}
async function runRemote(name: string, slug: string) {
  const r = await fetch(`${BASE}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: name, slug: `eval-${slug}-${Date.now().toString(36)}`, fresh: true }) });
  const txt = await r.text();
  return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l)) as PipeEvent[];
}

const NAMES: Record<string, string> = { gmail: "Gmail", outlook: "Microsoft Outlook", twitter: "X (Twitter) API", instagram: "Instagram", linkedin: "LinkedIn" };

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync("eval/results", { recursive: true });
  mkdirSync("public/traces", { recursive: true });
  const rows: any[] = [];
  const conc = Math.max(1, Number(opt("concurrency")) || 1);
  const queue = [...apps];
  const one = async (slug: string) => {
    const gold = getGraph(slug)!;
    const name = NAMES[slug] || gold.name.replace(/\s*\(.*\)$/, "");
    const t0 = Date.now();
    let evs: PipeEvent[] = [];
    try { evs = BASE ? await runRemote(name, slug) : await runLocal(name); } catch (e: any) { evs = [{ type: "error", code: "model_down", message: String(e?.message || e) }]; }
    const g = (evs.find((e) => e.type === "graph") as any)?.graph;
    const pred = g ? ProviderGraph.parse(g) : null;
    const trace = (evs.find((e) => e.type === "trace") as any)?.trace as Trace | undefined;
    const err = (evs.find((e) => e.type === "error") as any)?.message;
    if (trace) writeFileSync(`public/traces/${trace.id}.json`, JSON.stringify(trace));
    const corrections = evs.filter((e) => e.type === "correction").length;
    const faultCaught = evs.some((e) => e.type === "correction" && (e as any).reason === "quote not found in source");
    const s = score(gold, pred);
    const v = trace?.verifier;
    rows.push({
      slug, name, ok: !!pred, error: err?.slice(0, 160), ...s,
      citationValidity: v && v.checked ? v.quoteMatched / v.checked : null, factsChecked: v?.checked ?? 0, downgraded: v?.downgraded ?? 0, corrected: v?.corrected ?? 0, corrections, faultCaught,
      retrievers: Object.fromEntries(Object.entries((trace?.tools || []).filter((t) => t.kind === "fetch" && t.ok).reduce((m: Record<string, number>, t) => { const k = t.via || "fetch"; m[k] = (m[k] || 0) + 1; return m; }, {}))),
      jevDecisions: (trace?.decisions || []).filter((d) => d.engine === "jev").length,
      latencyMs: trace?.ms ?? Date.now() - t0, tokens: trace ? trace.tokens.prompt + trace.tokens.completion : 0, models: trace?.models || [], traceId: trace?.id,
    });
    const r = rows.find((x) => x.slug === slug)!;
    console.log(`${slug.padEnd(11)} ok=${r.ok} tier=${r.tierAcc.toFixed(2)} gates=${r.gateRecall.toFixed(2)}/${r.gateRecallLoose.toFixed(2)} wait=${r.waitOverlap.toFixed(2)} (${r.goldWait} vs ${r.predWait}) cite=${r.citationValidity?.toFixed(2) ?? "-"} ${Math.round(r.latencyMs / 1000)}s ${r.tokens}tok ${r.error || ""}`);
  };
  await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await one(queue.shift()!); }));
  rows.sort((a, b) => apps.indexOf(a.slug) - apps.indexOf(b.slug));
  const avg = (k: string) => { const xs = rows.map((r) => r[k]).filter((x) => typeof x === "number"); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const summary = {
    mode: MODE, date, base: BASE || "in-process", apps: rows.length, completed: rows.filter((r) => r.ok).length,
    scopeTierAccuracy: avg("tierAcc"), capabilityCoverage: avg("capCoverage"), gateRecall: avg("gateRecall"), gateRecallLoose: avg("gateRecallLoose"),
    waitRangeOverlap: avg("waitOverlap"), citationValidity: avg("citationValidity"), downgraded: rows.reduce((a, r) => a + r.downgraded, 0), corrected: rows.reduce((a, r) => a + r.corrected, 0),
    faultsCaught: flag("faults") ? `${rows.filter((r) => r.faultCaught).length}/${rows.filter((r) => r.ok || r.tokens > 1000).length}` : undefined,
    medianLatencyMs: rows.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)], totalTokens: rows.reduce((a, r) => a + r.tokens, 0),
  };
  const out = { summary, rows };
  const file = `eval/results/${date}-${MODE}${opt("tag") ? `-${opt("tag")}` : ""}`;
  writeFileSync(`${file}.json`, JSON.stringify(out, null, 1));
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
  const md = [
    `# Eval ${date} (${MODE})`, "",
    `Pipeline run blind on ${rows.length} golden providers${BASE ? ` against ${BASE}` : ""}. Golden = hand-researched graphs in data/graph.`, "",
    `| Metric | Score |`, `|---|---|`,
    `| Completed | ${summary.completed}/${summary.apps} |`,
    `| Scope-tier accuracy | ${pct(summary.scopeTierAccuracy)} |`,
    `| Capability coverage | ${pct(summary.capabilityCoverage)} |`,
    `| Gate recall (exact kind / family) | ${pct(summary.gateRecall)} / ${pct(summary.gateRecallLoose)} |`,
    `| Wait-range overlap (log-scale IoU) | ${pct(summary.waitRangeOverlap)} |`,
    `| Citation validity (quotes found in source, before re-check) | ${pct(summary.citationValidity)} |`,
    `| Facts downgraded / corrected by verifier | ${summary.downgraded} / ${summary.corrected} |`,
    ...(summary.faultsCaught ? [`| Injected fake quotes caught | ${summary.faultsCaught} |`] : []),
    `| Median latency | ${Math.round(summary.medianLatencyMs / 1000)}s |`,
    `| Tokens (total) | ${summary.totalTokens} |`, "",
    `| App | Tier acc | Gates | Wait (gold vs run) | Citations | Latency | Tokens | Trace |`, `|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.name} | ${pct(r.tierAcc)} | ${pct(r.gateRecall)} | ${r.goldWait} vs ${r.predWait || "–"} | ${pct(r.citationValidity)} | ${Math.round(r.latencyMs / 1000)}s | ${r.tokens} | ${r.traceId ? `/trace/${r.traceId}` : r.error || "–"} |`),
  ].join("\n");
  writeFileSync(`${file}.md`, md + "\n");
  console.log(`\n${md}\n\nWrote ${file}.json and .md`);
}
main();
