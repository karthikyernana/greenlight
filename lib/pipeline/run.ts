/* Investigation pipeline for apps outside the library. Fixed stages, not a chat loop:
   Scout → (Scope classifier ‖ Gate finder ‖ Prober) → Verifier (code quote check → LLM critic → ≤2 targeted re-check rounds) → graph.
   The rules engine turns the graph into a plan exactly as it does for hand-researched providers. */
import { z } from "zod";
import { ProviderGraph, type Fact, type FactStatus, type ReviewTier } from "../graph/schema";
import { llmJson, providers as allProviders, RunBudget, BudgetErr } from "../llm";
import { probeAuthorize, probeComposio, probeDiscovery } from "../probe";
import { docCandidates, fetchPage, host, rankPassages, webSearch, type Page, type Passage } from "../retrieval";
import { checkQuote } from "../quote";
import { slugify } from "../urlstate";
import { ScoutOut, ScopesOut, GatesOut, CriticOut, RecheckOut } from "./schemas";
import type { CriticOut as CriticOutT } from "./schemas";
import { newTraceId, saveTrace, type Trace, type ToolCall } from "./trace";

export const COMPOSIO_CB = "https://backend.composio.dev/api/v3/toolkits/auth/callback";
export const STAGES = [
  { id: "scout", label: "Scout" },
  { id: "scopes", label: "Scope classifier" },
  { id: "gates", label: "Gate finder" },
  { id: "probe", label: "Prober" },
  { id: "verify", label: "Verifier" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export type PipeEvent =
  | { type: "stage"; id: StageId; status: "running" | "done" | "warn" | "skipped"; detail?: string; ms?: number }
  | { type: "fact"; stage: StageId; id: string; claim: string; status: FactStatus; url?: string }
  | { type: "correction"; id: string; claim: string; from: FactStatus | "claimed"; to: FactStatus | "corrected"; reason: string }
  | { type: "graph"; graph: ProviderGraph }
  | { type: "trace"; trace: Trace }
  | { type: "error"; code: "no_model" | "model_down" | "invalid" | "budget"; message: string };

export type RunOpts = { need?: string; providers?: ReturnType<typeof allProviders>; budget?: number; deadlineMs?: number; composioSlug?: string; maxRecheckRounds?: number; fetchImpl?: (url: string) => Promise<Page> };

const today = () => new Date().toISOString().slice(0, 10);

function parseInput(q: string): { name: string; domain?: string } {
  const t = q.trim();
  if (/^https?:\/\//.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t)) {
    try {
      const u = new URL(t.startsWith("http") ? t : `https://${t}`);
      const h = u.host.replace(/^www\./, "");
      const base = h.split(".").slice(-2, -1)[0] || h;
      return { name: base.charAt(0).toUpperCase() + base.slice(1), domain: h };
    } catch {}
  }
  return { name: t.replace(/\s+/g, " ").slice(0, 60) };
}

const RULES = `Rules:
- Use ONLY the SOURCE PASSAGES below. Every "quote" must be copied character-for-character from one passage (one or two sentences, max 300 chars), and "url" must be that passage's URL. If no passage supports a claim, leave quote and url empty.
- Never invent scopes, timelines or programs. Unknown is fine.
- Output one JSON object, no prose, no markdown.`;

const SCOUT_SYS = `You are the Scout stage of Greenlight. Given an app name, return where its official developer documentation lives.
Return JSON: {"name": official product name, "domain": bare host of the company site (e.g. "calendly.com"), "console": URL where developers register OAuth apps or "", "docUrls": [up to 5 official URLs most likely to describe OAuth app registration, scopes/permissions, and app review/verification], "hasOAuth": boolean}.
Prefer exact documentation pages over home pages. Output JSON only.`;

const SCOPES_SYS = `You are the Scope classifier stage of Greenlight. A developer's AI agent needs end users of an app to connect their accounts via OAuth.
List 2-5 capabilities an agent typically needs from this app, with the real OAuth scopes and the review tier each needs before the PUBLIC (strangers) can grant it.
Tiers: "none" = usable as soon as the app exists, no review; "sensitive" = provider reviews/approves the app first; "restricted" = review plus a security assessment or business verification; "partner" = gated partner program, approval not guaranteed; "paid" = no review but billed per call.
Return JSON: {"capabilities":[{"id": kebab-case, "label": plain words like "Read invoices", "keywords": [words a developer would use for this need], "default": true for the 1-2 most common agent needs, "scopes":[{"name": exact scope string, "tier": tier}], "tier": worst scope tier, "why": one short sentence, "evidence": {"claim": the tier claim in one sentence, "quote": verbatim, "url": passage URL}}]}
${RULES}`;

const GATES_SYS = `You are the Gate finder stage of Greenlight. Find everything between "OAuth app registered" and "real users can connect": reviews, verifications, security assessments, business verification, partner programs, install caps, payment, admin approval, marketplace listing.
Return JSON: {"summary": one sentence verdict (<= 35 words),
 "gates":[{"id": kebab-case, "kind": one of app_review|brand_verification|security_assessment|business_verification|publisher_verification|install_cap|partner_program|payment|admin_approval|marketplace_listing, "label": short name, "plain": one plain sentence, "forTiers": which capability tiers trigger it (subset of sensitive|restricted|partner|paid), "needsBusiness": true if only registered companies can pass,
   "skip": [{"when": {"audience":"team"} or {"audience":"public","scale":"small"} etc, "reason": short, "claim":"", "quote":"", "url":""}] (only when the docs say internal/test/small-scale use avoids this gate),
   "evidence": {"claim","quote","url"}}],
 "steps":[{"id": kebab-case, "title": imperative, "detail": 1-2 sentences with exact menu paths or limits, "owner": "agent"|"you"|"both", "agent": what a coding/browser agent can prepare, "human": what only a person can do (sign in, legal docs, payment, recording), "effortMin": hands-on minutes, "waitDays": [min,max] provider-side waiting (published numbers when the passages give them), "dependsOn": [step ids], "gate": gate id or "" for steps everyone needs (registration, redirect URIs; mention the Composio bring-your-own callback ${COMPOSIO_CB} there), "evidence": {"claim","quote","url"}}] (4-7 steps). Keep every string short.}
${RULES}`;

const CRITIC_SYS = `You are the critic in Greenlight's Verifier. You get the facts an investigation produced, each with its status after a code check that the quote appears in the source. Find contradictions and weak spots: a capability tier that disagrees with a gate, waits that are implausible, a gate with no support, claims that contradict each other.
Return JSON: {"issues":[{"factId": id from the list, "problem": one sentence, "query": a short web search query that would settle it}]} (max 6, most important first; [] if nothing is wrong). JSON only.`;

const RECHECK_SYS = `You are re-checking ONE claim for Greenlight against fresh source passages.
Return JSON: {"verdict": "confirmed" | "corrected" | "unsupported", "claim": the claim as the passages support it, "quote": verbatim from a passage (max 300 chars) or "", "url": that passage's URL or "", "tier": optional corrected tier (none|sensitive|restricted|partner|paid), "waitDays": optional corrected [min,max]}
${RULES}`;

function passagesBlock(ps: Passage[]) {
  return ps.map((p, i) => `[P${i + 1}] ${p.url}\n${p.text}`).join("\n\n");
}

export async function* investigate(q: string, opts: RunOpts = {}): AsyncGenerator<PipeEvent> {
  const t0 = Date.now();
  const deadline = t0 + (opts.deadlineMs || 270_000);
  const budget = new RunBudget(opts.budget);
  const ps = opts.providers || allProviders();
  const input = parseInput(q);
  const trace: Trace = {
    id: newTraceId(), q, app: input.name, startedAt: new Date().toISOString(), ms: 0, stages: [], tools: [], llm: budget.calls,
    tokens: { prompt: 0, completion: 0, budget: budget.limit }, models: [], outcome: "failed",
    verifier: { checked: 0, quoteMatched: 0, downgraded: 0, corrected: 0, recheckRounds: 0, criticIssues: 0 },
  };
  const tool = (t: ToolCall) => trace.tools.push(t);
  const stageStart: Record<string, number> = {};
  const stage = (id: StageId, status: "running" | "done" | "warn" | "skipped", detail?: string): PipeEvent => {
    if (status === "running") stageStart[id] = Date.now();
    const ms = status === "running" ? 0 : Date.now() - (stageStart[id] || Date.now());
    const label = STAGES.find((s) => s.id === id)!.label;
    const i = trace.stages.findIndex((s) => s.id === id);
    const rec = { id, label, status, ms, detail };
    if (i < 0) trace.stages.push(rec); else trace.stages[i] = rec;
    return { type: "stage", id, status, detail, ms };
  };
  const finish = (outcome: Trace["outcome"], error?: string): PipeEvent => {
    trace.ms = Date.now() - t0;
    trace.outcome = outcome;
    trace.error = error;
    trace.tokens.prompt = budget.calls.reduce((a, c) => a + c.prompt, 0);
    trace.tokens.completion = budget.calls.reduce((a, c) => a + c.completion, 0);
    trace.models = [...new Set(budget.calls.filter((c) => c.ok).map((c) => `${c.provider}:${c.model}`))];
    saveTrace(trace);
    return { type: "trace", trace };
  };

  const corpus = new Map<string, Page>();
  const fetchP = opts.fetchImpl || ((u: string) => fetchPage(u));
  const getPage = async (url: string, st: string) => {
    if (corpus.has(url)) return corpus.get(url)!;
    const p = await fetchP(url);
    tool({ stage: st, kind: "fetch", target: url, ms: p.ms, ok: p.status === 200 && p.text.length > 200, note: p.status === 200 ? `${p.text.length} chars` : `HTTP ${p.status || "error"}` });
    corpus.set(url, p);
    if (p.url && p.url !== url) corpus.set(p.url, p);
    return p;
  };

  const facts: Fact[] = [];
  let nf = 0;
  const addFact = (claim: string, url: string, quote: string, status: FactStatus, id?: string): Fact => {
    const f: Fact = { id: id || `f${++nf}`, claim, url, title: corpus.get(url)?.title || (url ? host(url) : ""), quote, checked: today(), status };
    facts.push(f);
    return f;
  };

  /* ───────── Scout ───────── */
  yield stage("scout", "running", `Finding ${input.name}'s developer docs and Composio status`);
  const compP = probeComposio(input.name, opts.composioSlug).then((r) => { tool({ stage: "scout", kind: "probe", target: r.url || "composio", ms: 0, ok: !!r.slug, note: r.probe?.result }); return r; });
  let scout: ScoutOut = { name: input.name, domain: input.domain || "", console: "", docUrls: [], hasOAuth: true };
  // The model's pointer to official docs runs in parallel with search: HTML search engines often return only
  // navigational results to datacenter IPs, so every URL either source suggests is fetched and judged on its text.
  const scoutP = ps.length
    ? llmJson({ stage: "scout", system: SCOUT_SYS, user: `App: ${q}${input.domain ? `\nWebsite: ${input.domain}` : ""}\nToday: ${today()}`, schema: ScoutOut, budget, providers: ps, timeoutMs: 90_000 }).catch((e) => e as Error)
    : Promise.resolve(null);
  const t1 = Date.now();
  const s1 = await webSearch(`${scout.name} OAuth app scopes review verification developer documentation`);
  tool({ stage: "scout", kind: "search", target: s1.engine, ms: Date.now() - t1, ok: s1.hits.length > 0, note: s1.error || `${s1.hits.length} results` });
  const nameKey = slugify(scout.name).replace(/-/g, "");
  const THIRD = /stackoverflow|medium\.com|reddit|youtube|wikipedia|quora|dev\.to|linkedin\.com\/pulse|nango|merge\.dev|apideck|pipedream|zapier|rollout|unified\.to/i;
  const devish = (u: string) => /(^|\.)(developers?|docs|api|dev|learn|support)\./i.test(host(u)) || /\/(docs|developers?|api|oauth|reference|guides?)(\/|$)/i.test(new URL(u).pathname);
  const devHits = s1.hits.map((h) => h.url).filter((u) => !THIRD.test(u) && devish(u));
  if (!scout.domain) {
    const named = s1.hits.find((x) => host(x.url).replace(/[^a-z0-9.]/g, "").includes(nameKey));
    const counts = new Map<string, number>();
    for (const u of devHits) { const b = host(u).split(".").slice(-2).join("."); counts.set(b, (counts.get(b) || 0) + 1); }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    scout.domain = named ? host(named.url).split(".").slice(-2).join(".") : top || `${nameKey}.com`;
  }
  let bare = scout.domain.split(".").slice(-2).join(".");
  const official = (u: string) => host(u).endsWith(bare) || devHits.includes(u);
  const readAll = (us: string[]) => Promise.all(us.map((u) => getPage(u, "scout")));
  const firstUrls = [...new Set([...devHits.slice(0, 5), ...s1.hits.map((h) => h.url).filter((u) => host(u).endsWith(bare) && /dev|doc|api|oauth|auth|app/i.test(u)), ...docCandidates(scout.domain)])].slice(0, 9);
  await readAll(firstUrls);
  const goodCount = () => [...new Set(corpus.values())].filter((p) => p.status === 200 && p.text.length > 300 && /oauth|scope/i.test(p.text)).length;
  const sr = await scoutP;
  if (sr instanceof BudgetErr) { yield { type: "error", code: "budget", message: sr.message }; yield finish("failed", sr.message); return; }
  if (sr && !(sr instanceof Error)) {
    const dom = (input.domain || sr.data.domain || scout.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
    if (dom !== scout.domain) { scout.domain = dom; bare = dom.split(".").slice(-2).join("."); }
    scout = { ...sr.data, name: sr.data.name || input.name, domain: scout.domain };
    await readAll([...new Set([...sr.data.docUrls.filter((u) => /^https?:\/\//.test(u)), ...(goodCount() < 2 ? docCandidates(dom) : [])])].filter((u) => !corpus.has(u)).slice(0, 8));
  }
  const urls: string[] = [];
  const comp = await compP;
  if (comp.slug) urls.push(`https://docs.composio.dev/toolkits/${comp.slug}`);
  await readAll(urls);
  const good = [...new Set(corpus.values())].filter((p) => p.status === 200 && p.text.length > 300);
  const composioFact = comp.slug
    ? addFact(comp.managed === "available" ? "Composio runs a managed OAuth app for this toolkit" : comp.managed === "not_available" ? "Composio has no managed OAuth app for this toolkit" : `Composio lists this toolkit (${comp.schemes.join(", ") || "auth unknown"})`, comp.url || "", comp.managed === "available" ? "Composio-managed OAuth available" : comp.managed === "not_available" ? "Composio-managed OAuth not available" : "", comp.managed === "unknown" ? "uncertain" : "tested", "composio-managed")
    : null;
  if (composioFact) yield { type: "fact", stage: "scout", id: composioFact.id, claim: composioFact.claim, status: composioFact.status, url: composioFact.url };
  yield stage("scout", good.length ? "done" : "warn", `${good.length} page${good.length === 1 ? "" : "s"} read on ${[...new Set(good.map((p) => host(p.url)))].slice(0, 4).join(", ") || "no host"} · search: ${s1.engine}`);

  /* ───────── Specialists in parallel ───────── */
  const passages = rankPassages(good.filter((p) => !p.url.includes("composio.dev")), [scout.name], 14);
  const evidence = passagesBlock(passages).slice(0, 26_000);
  const ctx = `App: ${scout.name} (${scout.domain})\nToday: ${today()}\nComposio-managed OAuth: ${comp.managed}\n\nSOURCE PASSAGES:\n${evidence || "(none fetched)"}`;

  const proberRun = (async () => {
    const t = Date.now();
    const disc = await probeDiscovery(scout.domain);
    tool({ stage: "probe", kind: "probe", target: "discovery", ms: Date.now() - t, ok: !!disc.found, note: disc.probes[0]?.result });
    const az = disc.found?.authorization_endpoint ? await probeAuthorize(disc.found.authorization_endpoint) : null;
    if (az) tool({ stage: "probe", kind: "probe", target: az.url, ms: 0, ok: az.ok, note: az.result });
    return { probes: [...(comp.probe ? [comp.probe] : []), ...disc.probes, ...(az ? [az] : [])], disc };
  })();

  if (!ps.length || !passages.length) {
    const pr = await proberRun;
    yield stage("probe", "done", `${pr.probes.length - 1} public probe${pr.probes.length === 2 ? "" : "s"} · ${pr.disc.found ? "discovery document found" : "no discovery document"}`);
    yield stage("scopes", "skipped", !ps.length ? "No model configured" : "No readable docs");
    yield stage("gates", "skipped", !ps.length ? "No model configured" : "No readable docs");
    yield stage("verify", "skipped");
    yield { type: "error", code: !ps.length ? "no_model" : "model_down", message: !ps.length ? "Investigation needs a model. Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL on the deployment. The Composio check and probes above ran live." : "Couldn't read any of this app's developer docs, so there is nothing to classify. The live checks above still ran." };
    yield finish("partial", "no model or no docs");
    return;
  }

  yield stage("scopes", "running", `Classifying scopes from ${passages.length} passages`);
  yield stage("gates", "running", "Looking for reviews, verifications, caps and payment");
  yield stage("probe", "running", `Discovery and authorize probes on ${scout.domain}`);
  const scopesP = llmJson({ stage: "scopes", system: SCOPES_SYS, user: ctx, schema: ScopesOut, budget, providers: ps });
  const gatesP = llmJson({ stage: "gates", system: GATES_SYS, user: ctx, schema: GatesOut, budget, providers: ps });
  scopesP.catch(() => {}); gatesP.catch(() => {});
  const pr = await proberRun;
  yield stage("probe", pr.disc.found ? "done" : "warn", `${pr.probes.length - 1} public probe${pr.probes.length === 2 ? "" : "s"} · ${pr.disc.found ? "discovery document found" : "no discovery document"}`);
  const probeFacts = pr.probes.map((p, i) => addFact(`${p.label}: ${p.result}`, p.url, p.result, p.ok ? "tested" : "uncertain", `probe-${i + 1}`));
  for (const f of probeFacts.slice(1)) yield { type: "fact", stage: "probe", id: f.id, claim: f.claim, status: f.status, url: f.url };

  let scopes: ScopesOut, gates: GatesOut, modelUsed = "";
  try {
    const [a, b] = await Promise.all([scopesP, gatesP]);
    scopes = a.data; gates = b.data; modelUsed = `${a.provider}:${a.model}`;
  } catch (e: any) {
    const msg = String(e?.message || e);
    yield stage("scopes", "warn", msg.slice(0, 160));
    yield stage("gates", "warn", msg.slice(0, 160));
    yield { type: "error", code: e instanceof BudgetErr ? "budget" : "model_down", message: e instanceof BudgetErr ? msg : `The model didn't return a usable answer (${msg.slice(0, 160)}). Live checks above still ran.` };
    yield finish("failed", msg);
    return;
  }

  // facts from the specialists (status "claimed" until the verifier has looked)
  const capFact = new Map<string, string>();
  for (const c of scopes.capabilities) {
    const f = addFact(c.evidence.claim || `${c.label}: ${c.tier} (${c.why})`, c.evidence.url, c.evidence.quote, "sourced");
    capFact.set(c.id, f.id);
    yield { type: "fact", stage: "scopes", id: f.id, claim: f.claim, status: "sourced", url: f.url };
  }
  yield stage("scopes", "done", `${scopes.capabilities.length} capabilities · ${scopes.capabilities.flatMap((c) => c.scopes).length} scopes`);
  const gateFact = new Map<string, string>();
  const skipFacts = new Map<string, string[]>();
  for (const g of gates.gates) {
    const f = addFact(g.evidence.claim || `${g.label}: ${g.plain}`, g.evidence.url, g.evidence.quote, "sourced");
    gateFact.set(g.id, f.id);
    yield { type: "fact", stage: "gates", id: f.id, claim: f.claim, status: "sourced", url: f.url };
    skipFacts.set(g.id, g.skip.map((s) => addFact(s.claim || s.reason, s.url, s.quote, "sourced").id));
  }
  const stepFact = new Map<string, string>();
  for (const s of gates.steps) {
    if (!s.evidence.quote && !(s.waitDays[1] > 0)) continue;
    const f = addFact(s.evidence.claim || `${s.title}${s.waitDays[1] ? `: ${s.waitDays[0]}–${s.waitDays[1]} days` : ""}`, s.evidence.url, s.evidence.quote, "sourced");
    stepFact.set(s.id, f.id);
  }
  yield stage("gates", "done", `${gates.gates.length} gates · ${gates.steps.length} steps`);

  /* ───────── Verifier ───────── */
  yield stage("verify", "running", "Checking every quote against the fetched source text");
  const verifyOne = async (f: Fact): Promise<{ ok: boolean; reason: string }> => {
    if (f.status === "tested") return { ok: true, reason: "" };
    if (!f.url || !f.quote) return { ok: false, reason: "no quote or source given" };
    const page = corpus.get(f.url) || (/^https?:\/\//.test(f.url) ? await getPage(f.url, "verify") : undefined);
    if (!page || page.status !== 200) return { ok: false, reason: "source not fetchable" };
    const c = checkQuote(f.quote, page.text);
    tool({ stage: "verify", kind: "verify", target: f.id, ms: 0, ok: c.found, note: `${c.how} ${c.coverage.toFixed(2)}` });
    return c.found ? { ok: true, reason: "" } : { ok: false, reason: "quote not found in source" };
  };
  const weak = new Set<string>();
  for (const f of facts) {
    if (f.status === "tested") continue;
    trace.verifier.checked++;
    const v = await verifyOne(f);
    if (v.ok) { trace.verifier.quoteMatched++; continue; }
    const from = f.status;
    f.status = "uncertain";
    f.note = `Downgraded: ${v.reason}`;
    if (v.reason === "quote not found in source") f.quote = "";
    trace.verifier.downgraded++;
    weak.add(f.id);
    yield { type: "correction", id: f.id, claim: f.claim, from, to: "uncertain", reason: v.reason };
  }

  // one LLM critic pass for contradictions
  let criticIssues: CriticOutT["issues"] = [];
  const correctionsOut: PipeEvent[] = [];
  try {
    if (Date.now() < deadline - 40_000) {
      const list = facts.filter((f) => !f.id.startsWith("probe")).map((f) => `${f.id} [${f.status}] ${f.claim}`).join("\n");
      const struct = `Capabilities: ${scopes.capabilities.map((c) => `${c.label}=${c.tier}`).join("; ")}\nGates: ${gates.gates.map((g) => `${g.label} (${g.kind}, for ${g.forTiers.join("/")})`).join("; ")}\nWaits: ${gates.steps.filter((s) => s.waitDays[1]).map((s) => `${s.title} ${s.waitDays.join("–")}d`).join("; ")}`;
      const cr = await llmJson({ stage: "critic", system: CRITIC_SYS, user: `App: ${scout.name}\n${struct}\n\nFACTS:\n${list}`, schema: CriticOut, budget, providers: ps, timeoutMs: 45_000 });
      trace.verifier.criticIssues = cr.data.issues.length;
      for (const i of cr.data.issues) if (facts.some((f) => f.id === i.factId)) weak.add(i.factId);
      criticIssues = cr.data.issues;
    }
  } catch {}

  // targeted re-check: at most 2 rounds, at most 4 facts per round, only while time and budget allow
  const rounds = Math.min(2, opts.maxRecheckRounds ?? 2);
  for (let round = 1; round <= rounds && weak.size && Date.now() < deadline - 35_000; round++) {
    trace.verifier.recheckRounds = round;
    const batch = [...weak].slice(0, 4);
    weak.clear();
    yield stage("verify", "running", `Re-check round ${round}: ${batch.length} weak fact${batch.length > 1 ? "s" : ""}`);
    await Promise.all(batch.map(async (id) => {
      const f = facts.find((x) => x.id === id);
      if (!f) return;
      const query = criticIssues.find((i) => i.factId === id)?.query || `${scout.name} ${f.claim}`.slice(0, 120);
      const ts = Date.now();
      const s = await webSearch(query, 4);
      tool({ stage: "verify", kind: "search", target: query, ms: Date.now() - ts, ok: s.hits.length > 0, note: s.error || s.engine });
      const pool = [...new Set([f.url, ...s.hits.map((h) => h.url).filter(official).slice(0, 2)].filter((u) => u && /^https?:\/\//.test(u)))];
      const pages = await Promise.all(pool.map((u) => getPage(u, "verify")));
      const ps2 = rankPassages(pages, f.claim.split(/\W+/).filter((w) => w.length > 4).slice(0, 8), 6);
      if (!ps2.length) return;
      try {
        const r = await llmJson({ stage: "recheck", system: RECHECK_SYS, user: `App: ${scout.name}\nCLAIM: ${f.claim}\n\nSOURCE PASSAGES:\n${passagesBlock(ps2).slice(0, 9000)}`, schema: RecheckOut, budget, providers: ps, timeoutMs: 45_000 });
        const d = r.data;
        if (d.verdict === "unsupported" || !d.quote || !d.url) return;
        const page = corpus.get(d.url);
        if (!page || !checkQuote(d.quote, page.text).found) { if (round < rounds) weak.add(id); return; }
        const before = f.claim;
        f.quote = d.quote; f.url = d.url; f.title = page.title; f.status = "sourced";
        if (d.verdict === "corrected" && d.claim) {
          f.claim = d.claim;
          f.note = `Corrected on re-check (was: ${before.slice(0, 120)})`;
          trace.verifier.corrected++;
          // apply structural corrections the re-check returned
          const capId = [...capFact.entries()].find(([, v]) => v === id)?.[0];
          if (capId && d.tier) { const c = scopes.capabilities.find((x) => x.id === capId); if (c) { c.tier = d.tier; for (const sc of c.scopes) if (sc.tier !== "none") sc.tier = d.tier; } }
          const stId = [...stepFact.entries()].find(([, v]) => v === id)?.[0];
          if (stId && d.waitDays?.length === 2) { const st = gates.steps.find((x) => x.id === stId); if (st) st.waitDays = [d.waitDays[0], d.waitDays[1]]; }
        } else f.note = "Confirmed on re-check";
        correctionsOut.push({ type: "correction", id, claim: f.claim, from: "uncertain", to: d.verdict === "corrected" ? "corrected" : "sourced", reason: d.verdict === "corrected" ? `corrected: ${before.slice(0, 80)} → ${f.claim.slice(0, 80)}` : "confirmed on re-check" });
      } catch {}
    }));
    for (const c of correctionsOut.splice(0)) yield c;
  }
  const nS = facts.filter((f) => f.status === "sourced").length, nU = facts.filter((f) => f.status === "uncertain").length, nT = facts.filter((f) => f.status === "tested").length;
  yield stage("verify", nU > nS ? "warn" : "done", `${trace.verifier.quoteMatched}/${trace.verifier.checked} quotes matched · ${trace.verifier.downgraded} downgraded · ${trace.verifier.corrected} corrected · ${nT} tested`);

  /* ───────── Assemble the graph ───────── */
  const graph = assemble({ name: scout.name, domain: scout.domain, console: scout.console, comp, composioFact, scopes, gates, facts, capFact, gateFact, stepFact, skipFacts, probes: pr.probes, model: modelUsed, traceId: trace.id });
  const parsed = ProviderGraph.safeParse(graph);
  if (!parsed.success) {
    yield { type: "error", code: "invalid", message: `Graph didn't validate: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    yield finish("failed", "graph invalid");
    return;
  }
  yield { type: "graph", graph: parsed.data };
  yield finish(nU > nS ? "partial" : "ok");
}

const kebab = (s: string, i: number) => (s || `x-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `x-${i}`;

function assemble(a: {
  name: string; domain: string; console: string; comp: Awaited<ReturnType<typeof probeComposio>>; composioFact: Fact | null;
  scopes: ScopesOut; gates: GatesOut; facts: Fact[]; capFact: Map<string, string>; gateFact: Map<string, string>; stepFact: Map<string, string>; skipFacts: Map<string, string[]>;
  probes: { label: string; url: string; result: string; ok: boolean; at: string }[]; model: string; traceId: string;
}) {
  const stepIds = new Set(a.gates.steps.map((s, i) => kebab(s.id, i)));
  const gateIds = new Set(a.gates.gates.map((g, i) => kebab(g.id, i)));
  const caps = a.scopes.capabilities.map((c, i) => {
    const id = kebab(c.id, i);
    const tier = c.tier as ReviewTier;
    const gs = a.gates.gates.filter((g) => (g.forTiers as string[]).includes(tier)).map((g) => kebab(g.id, a.gates.gates.indexOf(g)));
    const fid = a.capFact.get(c.id);
    return { id, label: c.label, keywords: c.keywords.map((k) => k.toLowerCase()).slice(0, 8), scopes: c.scopes.map((s) => ({ name: s.name, tier: s.tier, facts: [] })), tier, why: c.why, default: c.default, gates: gs, steps: [], facts: fid ? [fid] : [] };
  });
  if (!caps.some((c) => c.default)) caps[0].default = true;
  const gates = a.gates.gates.map((g, i) => ({
    id: kebab(g.id, i), kind: g.kind, label: g.label, plain: g.plain, needsBusiness: g.needsBusiness,
    steps: a.gates.steps.filter((s) => kebab(s.gate, 0) === kebab(g.id, i) || s.gate === g.id).map((s) => kebab(s.id, a.gates.steps.indexOf(s))),
    skip: g.skip.map((s, k) => ({ when: s.when, reason: s.reason, facts: [a.skipFacts.get(g.id)?.[k]].filter(Boolean) as string[] })),
    facts: [a.gateFact.get(g.id)].filter(Boolean) as string[],
  }));
  const steps = a.gates.steps.map((s, i) => {
    const w = s.waitDays.map((x) => Math.max(0, Math.min(365, Number(x) || 0)));
    const wmin = w[0] || 0, wmax = Math.max(wmin, w[1] ?? wmin);
    return {
      id: kebab(s.id, i), title: s.title, detail: s.detail, owner: s.owner, agent: s.agent, human: s.human, effortMin: Math.min(2400, Math.max(1, s.effortMin)),
      wait: [wmin, wmax] as [number, number], dependsOn: s.dependsOn.map((d) => kebab(d, 0)).filter((d) => stepIds.has(d)),
      base: !s.gate || !gateIds.has(kebab(s.gate, 0)), facts: [a.stepFact.get(s.id)].filter(Boolean) as string[], skip: [],
    };
  });
  return {
    slug: slugify(a.name), name: a.name, domain: a.domain, category: "", console: a.console || undefined, appType: "", summary: a.gates.summary,
    composio: {
      managed: a.comp.managed, slug: a.comp.slug, facts: a.composioFact ? [a.composioFact.id] : [],
      note: a.comp.managed === "available" ? "Composio runs an approved OAuth app for this toolkit. Bring your own for your brand on the consent screen or custom scopes." : a.comp.managed === "not_available" ? "Composio lists this toolkit but needs your own OAuth app." : "",
    },
    capabilities: caps, gates, steps, alternatives: [], facts: a.facts,
    context: { launchToday: [], rejections: [], blockers: [], uncertain: a.facts.filter((f) => f.status === "uncertain" && !f.id.startsWith("probe")).map((f) => f.claim).slice(0, 6) },
    probes: a.probes, checks: [], origin: "generated" as const, verifiedAt: today(), model: a.model, traceId: a.traceId,
  };
}

export const _test = { assemble, parseInput };
export type { z };
