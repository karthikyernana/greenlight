import { Guide, type Probe } from "./types";
import { fetchText, htmlToText, probeAuthorize, probeComposio, probeDevDocs, probeDiscovery } from "./probe";
import { research, structured, dedupe } from "./llm";
import { slugify } from "./urlstate";

export { slugify };

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "warn"; detail?: string }
  | { type: "patch"; patch: Partial<Guide> }
  | { type: "guide"; guide: Guide }
  | { type: "error"; code?: "no_model" | "model_down" | "invalid"; message: string };

const COMPOSIO_CB = "https://backend.composio.dev/api/v3/toolkits/auth/callback";

function parseInput(q: string): { name: string; domain?: string } {
  const t = q.trim();
  if (/^https?:\/\//.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t)) {
    try {
      const u = new URL(t.startsWith("http") ? t : `https://${t}`);
      const host = u.host.replace(/^www\./, "");
      const base = host.split(".").slice(-2, -1)[0] || host;
      return { name: base.charAt(0).toUpperCase() + base.slice(1), domain: host };
    } catch {}
  }
  return { name: t.replace(/\s+/g, " ").slice(0, 60) };
}

const SYSTEM = `You are Greenlight's research agent. You turn research notes about one SaaS provider into a JSON guide that helps a developer register an OAuth app with that provider and get it APPROVED, so their AI agent's users can connect accounts.
Be concrete, current and honest. Output ONLY a JSON object. No markdown fences.

Schema (all keys required unless marked optional):
{
 "name": string, "domain": string (bare host, e.g. "calendly.com"), "category": string,
 "summary": string (<= 45 words; lead with the verdict: how hard, what gates approval, the fastest path),
 "console": string (URL where developers register the app; optional if unknown),
 "appType": string (what the provider calls it, e.g. "OAuth app", "Public integration"),
 "capabilities": [ { "id": kebab-case, "label": plain-language thing an agent needs (e.g. "Read invoices", "Post on behalf of users"),
     "scopes": [real scope strings if known], "tier": one of "instant"|"self_serve"|"review"|"restricted"|"partner"|"paid",
     "why": one short sentence, "default": boolean (true for the 1-2 most common agent needs), "evidence": "sourced"|"uncertain", "sources": [source indexes] } ] (2-5 items),
 "steps": [ { "id": kebab-case, "title": imperative, "detail": 1-3 sentences with specifics (exact menu paths, field names, limits),
     "owner": "agent"|"you"|"both", "agent": what an AI coding/browser agent can do for this step ("" if nothing),
     "human": what only a human can do (legal docs, payment, identity, signing in, recording a video) ("" if nothing),
     "activeMinutes": number (hands-on effort), "waitDays": [min,max] (provider-side waiting; [0,0] if none),
     "after": [ids that must finish first], "requiredFor": [capability ids; [] means needed for everything],
     "link": optional URL, "cost": optional string, "evidence": "sourced"|"uncertain", "sources": [source indexes] } ] (4-8 items, in order),
 "launchToday": [2-4 bullets: fastest legitimate way to ship today (e.g. Composio-managed auth if available, test/dev mode limits, ship low-risk scopes first, start the long wait now)],
 "rejections": [2-5 common reasons apps get rejected or stuck],
 "blockers": [ { "problem": string, "fix": string } ] (2-4),
 "uncertain": [things you could not confirm from sources; be explicit],
 "sources": [ { "title": string, "url": string } ] (ONLY from the provided source list; keep their order and indexes)
}
Tier meanings: instant = works as soon as the app exists; self_serve = toggle/enable yourself, no review; review = provider reviews app before public users; restricted = review + security assessment/business verification; partner = gated partner program, approval not guaranteed; paid = no review but usage is billed.
Rules:
- Use "sourced" ONLY when a listed source supports the claim, and cite its index. Otherwise "uncertain". Never use "tested" (reserved for live probes).
- If the provider has no public OAuth (API keys only), say so in the summary, make the single capability tier reflect reality, and make steps about getting API access/partnership.
- Waiting estimates: use published numbers when available; otherwise give a conservative range and mark evidence "uncertain".
- Mention that the redirect/callback URL for Composio bring-your-own-app is ${COMPOSIO_CB} in the step where redirect URIs are configured.
- No marketing fluff. Write for a busy developer.`;

export async function* generateGuide(q: string, opts: { composioSlug?: string } = {}): AsyncGenerator<AgentEvent> {
  const input = parseInput(q);
  const name = input.name;
  const today = new Date().toISOString().slice(0, 10);
  const probes: Probe[] = [];
  yield { type: "patch", patch: { name, domain: input.domain || "", origin: "generated", verifiedAt: today } };

  yield { type: "step", id: "composio", label: `Composio directory: is ${name} managed?`, status: "running" };
  yield { type: "step", id: "research", label: "Researching OAuth setup, scopes and app review", status: "running" };

  const researchPrompt = `Research the OAuth 2.0 app registration and approval process for "${name}"${input.domain ? ` (website: ${input.domain})` : ""} as of today (${today}), for a developer whose AI agent needs end users to connect their ${name} accounts.
Cover, citing official documentation URLs:
1. Official website domain (write a line "OFFICIAL_DOMAIN: <host>") and the developer portal URL where OAuth apps are registered.
2. Whether ${name} offers OAuth for third-party apps at all (or only API keys / partner programs).
3. The main scopes/permissions and which ones need review, verification, partnership, or a paid plan.
4. Any app review / marketplace / verification / security assessment process, its requirements, and published or reported timelines.
5. Limits before approval (test users, install caps, dev mode), costs, and common rejection reasons or gotchas.
Be specific and current. Prefer the provider's own docs.`;

  const compP = probeComposio(name, opts.composioSlug);
  const resP = research(researchPrompt);
  resP.catch(() => {});

  let composio: Guide["composio"] = { managed: "unknown", note: "", evidence: "uncertain" };
  try {
    const c = await compP;
    if (c.probe) probes.push(c.probe);
    composio = {
      managed: c.managed, slug: c.slug, evidence: c.slug ? "tested" : "uncertain",
      note: c.managed === "available" ? "Composio provides a managed OAuth app, so you can ship without registering your own. Bring your own app for your brand on the consent screen, custom scopes, or your own rate limits."
        : c.managed === "not_available" ? "Composio lists this toolkit but you must bring your own OAuth app (client ID + secret) in a custom auth config."
        : c.slug ? `Composio lists this toolkit (auth: ${c.schemes.join(", ") || "see docs"}).` : "Not found in Composio's toolkit directory under this name.",
    };
    yield { type: "step", id: "composio", label: "Composio directory", status: c.slug ? "done" : "warn", detail: c.probe?.result };
  } catch {
    yield { type: "step", id: "composio", label: "Composio directory", status: "warn", detail: "Check failed" };
  }
  yield { type: "patch", patch: { composio, probes: [...probes] } };

  let r: Awaited<ReturnType<typeof research>> | null = null;
  let researchErr = "";
  try { r = await resP; } catch (e: any) { researchErr = String(e?.message || e); }

  if (r) yield { type: "step", id: "research", label: "Research", status: "done", detail: `${r.sources.length} sources via ${r.model}${r.grounded ? "" : " (ungrounded: verifying by reading pages)"}` };
  else {
    const noKey = /NO_MODEL_KEY|No GEMINI_API_KEY|credit card|401|403/.test(researchErr);
    yield { type: "step", id: "research", label: "Research", status: "warn", detail: noKey ? "No model key on this deployment. Continuing with live checks only." : researchErr.slice(0, 220) };
  }

  // Resolve domain
  let domain = input.domain || (r?.text.match(/OFFICIAL_DOMAIN:\s*\**\s*(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i)?.[1] ?? "");
  if (!domain) domain = `${slugify(name).replace(/-/g, "")}.com`;
  domain = domain.toLowerCase();
  yield { type: "patch", patch: { domain } };

  // Live probes
  yield { type: "step", id: "probe", label: `Live probes on ${domain}: discovery, portal, authorize`, status: "running" };
  const [disc, docs] = await Promise.all([probeDiscovery(domain), probeDevDocs(domain)]);
  probes.push(...disc.probes, docs.probe);
  let authorizeEndpoint = disc.found?.authorization_endpoint;
  if (!authorizeEndpoint && r) {
    const m = r.text.match(/https:\/\/[a-z0-9.-]*\/[a-z0-9/_.-]*(?:oauth|authorize)[a-z0-9/_.-]*/i);
    if (m && /authoriz/i.test(m[0])) authorizeEndpoint = m[0];
  }
  const az = authorizeEndpoint ? await probeAuthorize(authorizeEndpoint) : null;
  if (az) probes.push(az);
  const probeNote = [...disc.probes, docs.probe, ...(az ? [az] : [])].map((p) => p.result).filter(Boolean).join(" · ").slice(0, 300);
  yield { type: "step", id: "probe", label: "Live probes", status: disc.found || authorizeEndpoint || docs.urls.length ? "done" : "warn", detail: probeNote };
  yield { type: "patch", patch: { probes: [...probes], console: docs.urls[0] } };

  // Read the most relevant pages ourselves (also the fallback when research is ungrounded or missing)
  const bare = domain.split(".").slice(-2).join(".");
  const candidates = dedupe([...(r?.sources || []), ...docs.urls.map((u) => ({ title: safeHost(u), url: u }))])
    .filter((s) => !/vertexaisearch|google\.com\/search/.test(s.url))
    .sort((a, b) => score(b.url, bare) - score(a.url, bare))
    .slice(0, r?.grounded ? 3 : 4);
  yield { type: "step", id: "read", label: `Reading ${candidates.length || "no"} official page${candidates.length === 1 ? "" : "s"}`, status: "running", detail: candidates.map((s) => safeHost(s.url)).join(", ") };
  const pages = await Promise.all(candidates.map(async (s) => {
    const p = await fetchText(s.url, 7000);
    if (!p || p.status !== 200) return null;
    const t = htmlToText(p.text);
    const title = (p.text.match(/<title[^>]*>([^<]{3,120})<\/title>/i)?.[1] || s.title).trim();
    const idx = Math.max(0, t.search(/oauth|scope|review|verification|redirect/i) - 200);
    return { url: s.url, title, text: t.slice(idx, idx + 3500) };
  }));
  const read = pages.filter(Boolean) as { url: string; title: string; text: string }[];
  yield { type: "step", id: "read", label: "Read official pages", status: read.length ? "done" : "warn", detail: read.length ? `${read.length} page${read.length > 1 ? "s" : ""} read: ${[...new Set(read.map((p) => safeHost(p.url)))].join(", ")}` : "Pages not fetchable (JS-only or blocked)" };
  const sourceList = dedupe([...(r?.sources || []), ...read.map((p) => ({ title: p.title, url: p.url }))]).slice(0, 14);
  yield { type: "patch", patch: { sources: sourceList } };

  if (!r) {
    const noKey = /NO_MODEL_KEY|No GEMINI_API_KEY|credit card|401|403/.test(researchErr);
    yield {
      type: "error", code: noKey ? "no_model" : "model_down",
      message: noKey
        ? "Live research needs a model key, and this deployment has none yet. Everything above ran live: the Composio check, endpoint probes and the docs we could read."
        : "The research model isn't reachable right now (rate limit or outage). The live checks above still ran.",
    };
    return;
  }

  // Structure
  yield { type: "step", id: "write", label: "Structuring: scopes → tiers, critical path, agent vs you", status: "running" };
  const user = `Provider: ${name}\nDomain: ${domain}\nToday: ${today}\nComposio managed OAuth: ${composio.managed}\nResearch grounded in live web search: ${r.grounded ? "yes" : "NO - trust only claims supported by PAGE EXCERPTS; mark the rest uncertain"}\n\nSOURCES (cite by index):\n${sourceList.map((s, i) => `[${i}] ${s.title} — ${s.url}`).join("\n")}\n\nRESEARCH NOTES:\n${r.text.slice(0, 9000)}\n\nPAGE EXCERPTS (fetched live):\n${read.map((p) => `--- ${p.url}\n${p.text}`).join("\n").slice(0, 9000)}\n\nLIVE PROBES:\n${probes.map((p) => `- ${p.label}: ${p.result}`).join("\n")}`;

  let guide: Guide | null = null;
  let lastErr = "";
  let modelUsed = "";
  for (let attempt = 0; attempt < 2 && !guide; attempt++) {
    try {
      const { json, model } = await structured(SYSTEM, attempt ? `${user}\n\nYour previous output failed validation: ${lastErr}. Return valid JSON matching the schema exactly.` : user);
      modelUsed = model;
      const fixed = normalize(json, { name, domain, slug: slugify(name), composio, probes, sources: sourceList, today, model: `${r.model} → ${model}` });
      const parsed = Guide.safeParse(fixed);
      if (parsed.success) guide = parsed.data;
      else lastErr = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e: any) {
      lastErr = String(e?.message || e).slice(0, 300);
    }
  }
  if (!guide) {
    yield { type: "step", id: "write", label: "Structuring", status: "warn", detail: lastErr };
    yield { type: "error", code: "invalid", message: "The guide couldn't be assembled: the model output didn't validate twice." };
    return;
  }
  yield { type: "step", id: "write", label: "Guide written", status: "done", detail: `${guide.capabilities.length} capabilities · ${guide.steps.length} steps · ${modelUsed}` };
  yield { type: "guide", guide };
}

function score(url: string, bare: string) {
  let s = 0;
  try {
    const h = new URL(url).host;
    if (h.endsWith(bare)) s += 10;
    if (/developer|docs|api/.test(h + url)) s += 3;
    if (/oauth|auth|scope|review|verification|app/.test(url)) s += 2;
  } catch {}
  return s;
}

function safeHost(u: string) {
  try { return new URL(u).host; } catch { return u; }
}

/** Coerce model output into our schema: clamp enums, fill defaults, attach probes & composio. */
function normalize(j: any, ctx: { name: string; domain: string; slug: string; composio: Guide["composio"]; probes: Probe[]; sources: { title: string; url: string }[]; today: string; model: string }) {
  const tiers = ["instant", "self_serve", "review", "restricted", "partner", "paid"];
  const owners = ["agent", "you", "both"];
  const ev = (e: any) => (e === "sourced" ? "sourced" : "uncertain");
  const nSrc = ctx.sources.length;
  const idx = (a: any) => (Array.isArray(a) ? a.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < nSrc) : []);
  const caps = (Array.isArray(j.capabilities) ? j.capabilities : []).slice(0, 6).map((c: any, i: number) => ({
    id: String(c.id || `cap-${i}`), label: String(c.label || "Access"), scopes: Array.isArray(c.scopes) ? c.scopes.map(String).slice(0, 8) : [],
    tier: tiers.includes(c.tier) ? c.tier : "review", why: String(c.why || ""), default: !!c.default, evidence: ev(c.evidence), sources: idx(c.sources),
  }));
  if (caps.length && !caps.some((c: any) => c.default)) caps[0].default = true;
  const capIds = new Set(caps.map((c: any) => c.id));
  const steps = (Array.isArray(j.steps) ? j.steps : []).slice(0, 10).map((s: any, i: number) => {
    const w = Array.isArray(s.waitDays) ? s.waitDays.map(Number) : [0, 0];
    const wmin = Math.max(0, w[0] || 0), wmax = Math.max(wmin, w[1] ?? wmin);
    return {
      id: String(s.id || `step-${i}`), title: String(s.title || "Step"), detail: String(s.detail || ""),
      owner: owners.includes(s.owner) ? s.owner : "both", agent: String(s.agent || ""), human: String(s.human || ""),
      activeMinutes: Math.min(2400, Math.max(1, Number(s.activeMinutes) || 15)), waitDays: [wmin, Math.min(365, wmax)],
      after: Array.isArray(s.after) ? s.after.map(String) : [], requiredFor: Array.isArray(s.requiredFor) ? s.requiredFor.map(String).filter((x: string) => capIds.has(x)) : [],
      link: typeof s.link === "string" && s.link.startsWith("http") ? s.link : undefined, cost: s.cost ? String(s.cost) : undefined,
      evidence: ev(s.evidence), sources: idx(s.sources),
    };
  });
  const arr = (a: any) => (Array.isArray(a) ? a.map(String).filter(Boolean).slice(0, 6) : []);
  return {
    slug: ctx.slug, name: String(j.name || ctx.name), domain: String(j.domain || ctx.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    category: String(j.category || ""), summary: String(j.summary || ""), console: typeof j.console === "string" && j.console.startsWith("http") ? j.console : undefined,
    appType: String(j.appType || ""), composio: ctx.composio, capabilities: caps, steps,
    launchToday: arr(j.launchToday), rejections: arr(j.rejections),
    blockers: (Array.isArray(j.blockers) ? j.blockers : []).slice(0, 5).map((b: any) => ({ problem: String(b.problem || ""), fix: String(b.fix || "") })).filter((b: any) => b.problem),
    uncertain: arr(j.uncertain), probes: ctx.probes, sources: ctx.sources, verifiedAt: ctx.today, origin: "generated", model: ctx.model,
  };
}
