/* Heuristic mock model. It is a provider like any other (same JSON contracts), but it reads the source passages with
   regexes instead of a model. It exists so the pipeline, verifier and harness run end-to-end with no key, and it doubles
   as a floor: a real model should beat it. With faults on, it fabricates one quote per run so the verifier has
   something to catch. */
import type { providers } from "../llm";

type Provider = ReturnType<typeof providers>[number];

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20 && s.length < 400);

function parsePassages(user: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const re = /\[P\d+\] (\S+)\n([\s\S]*?)(?=\n\n\[P\d+\] |\s*$)/g;
  let m;
  while ((m = re.exec(user))) out.push({ url: m[1], text: m[2] });
  return out;
}

const GATE_RULES: { kind: string; label: string; re: RegExp; forTiers: string[]; needsBusiness?: boolean }[] = [
  { kind: "security_assessment", label: "Security assessment", re: /security (assessment|review)|CASA|penetration test/i, forTiers: ["restricted"] },
  { kind: "business_verification", label: "Business verification", re: /business verification|verify your business|legal entity/i, forTiers: ["restricted"], needsBusiness: true },
  { kind: "publisher_verification", label: "Publisher verification", re: /publisher verification|verified publisher/i, forTiers: ["sensitive", "restricted"], needsBusiness: true },
  { kind: "partner_program", label: "Partner program", re: /partner program|apply for access|access request|vetting/i, forTiers: ["partner"] },
  { kind: "marketplace_listing", label: "Marketplace listing review", re: /(marketplace|app store|directory|gallery).{0,60}(review|listing|submit)|(review|listing|submit).{0,60}(marketplace|app store|directory)/i, forTiers: ["sensitive"] },
  { kind: "app_review", label: "App review", re: /app review|submit (your app )?for (review|verification)|review process|verification process/i, forTiers: ["sensitive", "restricted"] },
  { kind: "install_cap", label: "Install cap", re: /up to \d+ (accounts|users|installs|workspaces)|limited to \d+ (new )?users|\d+ (active )?installs/i, forTiers: ["sensitive"] },
  { kind: "payment", label: "Pay per call", re: /pay-per-use|per request|credits|\$\d/i, forTiers: ["paid"] },
];

function waitFrom(s: string): [number, number] | null {
  const m = s.match(/(\d+)\s*(?:-|–|to)?\s*(\d+)?\s*(business\s+)?(day|week|month)s?/i);
  if (!m) return null;
  const k = /week/i.test(m[4]) ? 7 : /month/i.test(m[4]) ? 30 : m[3] ? 1.4 : 1;
  const a = Number(m[1]) * k, b = Number(m[2] || m[1]) * k;
  return [Math.round(Math.min(a, b)), Math.round(Math.max(a, b))];
}

function scopesStage(user: string, faults: boolean) {
  const ps = parsePassages(user);
  const found: { name: string; url: string; quote: string; tier: string }[] = [];
  for (const p of ps)
    for (const s of sentences(p.text)) {
      const ms = s.match(/https:\/\/www\.googleapis\.com\/auth\/[a-z._]+|\b[a-z]+(?:_[a-z]+)*[:.](?:read|write|readonly|send|manage|admin)[a-z_]*\b/g) || [];
      for (const name of ms) {
        if (found.some((f) => f.name === name)) continue;
        const tier = /restricted|security assessment/i.test(s) ? "restricted" : /partner|approval/i.test(s) ? "partner" : /review|verif|sensitive/i.test(s) ? "sensitive" : /\$|credit|per request/i.test(s) ? "paid" : "none";
        found.push({ name, url: p.url, quote: s, tier });
      }
    }
  const read = found.filter((f) => /read|readonly/.test(f.name)).slice(0, 4);
  const write = found.filter((f) => !/read|readonly/.test(f.name)).slice(0, 4);
  const worst = (xs: typeof found) => (["partner", "restricted", "sensitive", "paid", "none"].find((t) => xs.some((x) => x.tier === t)) || "none");
  const cap = (id: string, label: string, xs: typeof found, def: boolean) => ({
    id, label, keywords: id === "read" ? ["read", "list", "fetch"] : ["write", "create", "send", "post"], default: def,
    scopes: xs.map((x) => ({ name: x.name, tier: x.tier })), tier: worst(xs), why: xs[0] ? `Based on: ${xs[0].quote.slice(0, 90)}` : "No scope found in the docs",
    evidence: xs[0] ? { claim: `${label} uses ${xs.map((x) => x.name).join(", ")}`, quote: xs[0].quote, url: xs[0].url } : { claim: `${label}: no scope documentation found`, quote: "", url: "" },
  });
  const caps = [cap("read", "Read data", read, true)];
  if (write.length) caps.push(cap("write", "Write data", write, false));
  if (!read.length && !write.length) caps[0] = { ...caps[0], tier: "none", why: "Docs don't list scopes" };
  if (faults && caps[0]) caps[0].evidence = { claim: caps[0].evidence.claim || "Read data needs no review", quote: "Every scope is approved instantly and no review is ever required for any application.", url: ps[0]?.url || "" };
  return { capabilities: caps };
}

function gatesStage(user: string) {
  const ps = parsePassages(user);
  const gates: any[] = [];
  const steps: any[] = [
    { id: "register", title: "Register the OAuth app", detail: "Create the app in the developer console and add the Composio callback https://backend.composio.dev/api/v3/toolkits/auth/callback as a redirect URI.", owner: "both", agent: "Fill in the form and redirect URIs", human: "Sign in and create the app", effortMin: 15, waitDays: [0, 0], dependsOn: [], gate: "", evidence: { claim: "", quote: "", url: "" } },
  ];
  for (const r of GATE_RULES) {
    let hit: { url: string; s: string } | null = null;
    for (const p of ps) { for (const s of sentences(p.text)) if (r.re.test(s)) { hit = { url: p.url, s }; break; } if (hit) break; }
    if (!hit) continue;
    const id = r.kind.replace(/_/g, "-");
    gates.push({ id, kind: r.kind, label: r.label, plain: hit.s.slice(0, 120), forTiers: r.forTiers, needsBusiness: !!r.needsBusiness, skip: [], evidence: { claim: `${r.label} applies`, quote: hit.s, url: hit.url } });
    const w = waitFrom(hit.s) || [0, 0];
    steps.push({ id: `${id}-step`, title: `Complete ${r.label.toLowerCase()}`, detail: hit.s.slice(0, 200), owner: "you", agent: "Prepare the submission material", human: "Submit and answer the provider", effortMin: 60, waitDays: w, dependsOn: ["register"], gate: id, evidence: w[1] ? { claim: `${r.label}: ${w[0]}–${w[1]} days`, quote: hit.s, url: hit.url } : { claim: "", quote: "", url: "" } });
  }
  return { summary: gates.length ? `Registration is self-serve; ${gates.map((g) => g.label.toLowerCase()).join(", ")} stand before public users.` : "Self-serve: no review found in the docs.", gates, steps };
}

export function mockProvider(opts: { faults?: boolean } = {}): Provider {
  return {
    id: "mock", label: "Heuristic mock (no model)", models: ["heuristic-v1"],
    async call(_model, system, user) {
      let out: unknown;
      if (system.includes("Scout stage")) out = { name: user.match(/App: (.+)/)?.[1]?.trim() || "", domain: user.match(/Website: (.+)/)?.[1]?.trim() || "", console: "", docUrls: [], hasOAuth: true };
      else if (system.includes("Scope classifier")) out = scopesStage(user, !!opts.faults);
      else if (system.includes("Gate finder")) out = gatesStage(user);
      else if (system.includes("critic")) out = { issues: [] };
      else out = { verdict: "unsupported", claim: "", quote: "", url: "" };
      const text = JSON.stringify(out);
      return { text, usage: { prompt: Math.ceil((system.length + user.length) / 4), completion: Math.ceil(text.length / 4) } };
    },
  };
}
