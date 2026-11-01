/* Rules engine. Pure TypeScript, no model, no I/O: need + graph → plan.
   Same input, same plan; it runs on every chip tap in the browser. Every sentence it writes carries the fact ids behind it. */
import type { Step } from "./types";
import { DEFAULT_PROFILE, TIER_RANK, type Fact, type FactStatus, type Gate, type GStep, type Need, type Profile, type ProviderGraph, type ReviewTier, type Condition } from "./graph/schema";
import { schedule, criticalPath, fmtDays, fmtEffort } from "./plan";

export type PlanStep = Step & { facts: string[]; gate?: string; synthetic?: boolean };
export type Because = { text: string; facts: string[] };
export type Suggestion = { id: string; kind: "alternative" | "drop" | "composio"; label: string; tradeoff: string; savesDays: number; saves: string; caps?: string[]; facts: string[] };
export type ToggleKey = "audience" | "scale" | "business";

export type Plan = {
  need: Need;
  tier: ReviewTier;
  days: [number, number];
  wait: string; // "5w–2mo" | "Same day"
  effort: string;
  effortMin: number;
  live: boolean; // no provider wait at all
  lead: string; // verdict sentence
  pole?: Because; // why it takes this long
  steps: PlanStep[];
  critical: string[];
  gatesHit: { gate: Gate; caps: string[]; because: Because }[];
  gatesSkipped: { gate: Gate; reason: string; warn?: string; facts: string[] }[];
  warnings: Because[];
  explain: Because[];
  suggestions: Suggestion[];
  toggles: ToggleKey[];
};

export const TIER_LABEL: Record<ReviewTier, string> = { none: "No review", sensitive: "Sensitive", restricted: "Restricted", partner: "Partner only", paid: "Paid per call" };
export const TIER_HINT: Record<ReviewTier, string> = {
  none: "Works as soon as the app exists. No provider review.",
  sensitive: "The provider reviews your app before the public can grant this.",
  restricted: "Review plus a security assessment or business checks.",
  partner: "Gated program: you apply and get vetted. Approval isn't guaranteed.",
  paid: "No review, but every API call is billed.",
};

export const BUSINESS_FACT: Fact = {
  id: "engine-business", claim: "Registering a legal business usually takes 1–4 weeks, depending on the country", url: "", title: "Greenlight estimate", quote: "", checked: "2026-11-01", status: "uncertain",
  note: "Our estimate; varies by country and entity type",
};

const matches = (c: Condition, p: Profile) => (c.audience === undefined || c.audience === p.audience) && (c.scale === undefined || c.scale === p.scale) && (c.business === undefined || c.business === p.business);

export function defaultCaps(g: ProviderGraph): string[] {
  const d = g.capabilities.filter((c) => c.default).map((c) => c.id);
  return d.length ? d : [g.capabilities[0].id];
}
export function cleanCaps(g: ProviderGraph, ids?: string[] | null): string[] {
  const v = (ids || []).filter((id, i, a) => a.indexOf(id) === i && g.capabilities.some((c) => c.id === id));
  return v.length ? v : defaultCaps(g);
}
export function defaultNeed(g: ProviderGraph): Need {
  return { caps: defaultCaps(g), profile: { ...DEFAULT_PROFILE } };
}

function evidenceOf(ids: string[], facts: Map<string, Fact>): FactStatus | undefined {
  const st = ids.map((i) => facts.get(i)?.status).filter(Boolean) as FactStatus[];
  if (!st.length) return undefined;
  if (st.includes("tested")) return "tested";
  if (st.includes("sourced")) return "sourced";
  return "uncertain";
}

function toStep(s: GStep, facts: Map<string, Fact>, gate?: string): PlanStep {
  return {
    id: s.id, title: s.title, detail: s.detail, owner: s.owner, agent: s.agent, human: s.human, activeMinutes: s.effortMin, waitDays: [...s.wait] as [number, number],
    after: [...s.dependsOn], requiredFor: [], link: s.link, cost: s.cost, evidence: (evidenceOf(s.facts, facts) || "sourced") as Step["evidence"],
    sources: [], facts: s.facts, gate,
  };
}

const shortScope = (s: string) => s.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "").replace(/^https:\/\/mail\.google\.com\/$/, "mail.google.com");

/** Core: which gates fire, which steps run, how long, and why. No suggestions (those call core again). */
function core(g: ProviderGraph, needIn: Need) {
  const need: Need = { caps: cleanCaps(g, needIn.caps), profile: { ...DEFAULT_PROFILE, ...needIn.profile } };
  const p = need.profile;
  const facts = new Map(g.facts.map((f) => [f.id, f]));
  const caps = g.capabilities.filter((c) => need.caps.includes(c.id));
  const tier = caps.reduce<ReviewTier>((t, c) => (TIER_RANK[c.tier] > TIER_RANK[t] ? c.tier : t), "none");

  const gatesHit: Plan["gatesHit"] = [];
  const gatesSkipped: Plan["gatesSkipped"] = [];
  const warnings: Because[] = [];
  const stepIds = new Set<string>();
  const stepGate = new Map<string, string>();
  let needsBusiness = false;

  for (const s of g.steps) {
    if (!s.base) continue;
    const sk = s.skip.find((x) => matches(x.when, p));
    if (!sk) stepIds.add(s.id);
  }
  for (const c of caps) for (const sid of c.steps) {
    const s = g.steps.find((x) => x.id === sid);
    if (s && !s.skip.some((x) => matches(x.when, p))) stepIds.add(sid);
  }
  for (const gate of g.gates) {
    const by = caps.filter((c) => c.gates.includes(gate.id));
    if (!by.length) continue;
    const sk = gate.skip.find((x) => matches(x.when, p));
    if (sk) {
      gatesSkipped.push({ gate, reason: sk.reason, warn: sk.warn, facts: sk.facts });
      if (sk.warn && !warnings.some((w) => w.text === sk.warn)) warnings.push({ text: sk.warn, facts: sk.facts });
      continue;
    }
    // the scope that drags this capability into the gate: worst tier
    const worst = by.flatMap((c) => c.scopes.map((s) => ({ c, s }))).sort((a, b) => TIER_RANK[b.s.tier] - TIER_RANK[a.s.tier])[0];
    // name the scope only when the graph classifies that scope itself (with a fact); otherwise name the capability
    const what = worst && worst.s.tier !== "none" && worst.s.facts.length
      ? `${shortScope(worst.s.name)} is ${TIER_LABEL[worst.s.tier].toLowerCase()}`
      : worst && worst.c.tier !== "none" ? `“${worst.c.label}” is ${TIER_LABEL[worst.c.tier].toLowerCase()}` : `“${by.map((c) => c.label).join(" + ")}” needs it`;
    gatesHit.push({ gate, caps: by.map((c) => c.id), because: { text: what, facts: [...new Set([...(worst?.s.facts || []), ...by.flatMap((c) => c.facts), ...gate.facts])] } });
    for (const sid of gate.steps) { stepIds.add(sid); if (!stepGate.has(sid)) stepGate.set(sid, gate.id); }
    if (gate.needsBusiness && !p.business) needsBusiness = true;
  }

  const steps: PlanStep[] = g.steps.filter((s) => stepIds.has(s.id)).map((s) => toStep(s, facts, stepGate.get(s.id)));
  if (needsBusiness) {
    const biz: PlanStep = {
      id: "register-business", title: "Register a legal business", detail: "One of the gates below only accepts a registered company (legal name, address and documents that match). Individuals can't pass it.",
      owner: "you", agent: "List the documents the provider will ask for and check that names and addresses match", human: "Register the company with your local registrar",
      activeMinutes: 180, waitDays: [7, 30], after: [], requiredFor: [], evidence: "uncertain", sources: [], facts: [BUSINESS_FACT.id], synthetic: true,
    };
    const bizGates = new Set(gatesHit.filter((x) => x.gate.needsBusiness).flatMap((x) => x.gate.steps));
    for (const s of steps) if (bizGates.has(s.id) && !s.after.some((a) => bizGates.has(a))) s.after.push(biz.id);
    steps.unshift(biz);
    warnings.push({ text: "This path needs a registered business. Individuals can't pass the business check.", facts: gatesHit.filter((x) => x.gate.needsBusiness).flatMap((x) => x.gate.facts) });
  }

  const sch = schedule(steps);
  const days: [number, number] = [sch.daysMin, sch.daysMax];
  const critical = criticalPath(steps);
  return { need, tier, steps, sch, days, critical, gatesHit, gatesSkipped, warnings, facts };
}

function fmtSave(d: number) {
  if (d < 1) return "a few hours";
  if (d < 13.5) return `~${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`;
  if (d < 60) return `~${Math.round(d / 7)} weeks`;
  return `~${Math.round(d / 30)} months`;
}

export function plan(g: ProviderGraph, needIn: Need = defaultNeed(g), opts: { suggestions?: boolean } = {}): Plan {
  const c = core(g, needIn);
  const { need, steps, sch, days, critical } = c;
  const capsSel = g.capabilities.filter((x) => need.caps.includes(x.id));
  const pacing = capsSel.filter((x) => x.tier === c.tier);
  const labels = (pacing.length ? pacing : capsSel).map((x) => x.label);
  const what = labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(" + ");
  const wait = fmtDays(days[0], days[1]);
  const live = days[1] < 1;

  // why: the longest wait on the critical path, traced to its gate and scope
  const onPath = steps.filter((s) => critical.includes(s.id) && s.waitDays[1] > 0);
  const poleStep = onPath.sort((a, b) => b.waitDays[1] - a.waitDays[1])[0];
  let pole: Because | undefined;
  if (poleStep) {
    const hit = c.gatesHit.find((x) => x.gate.id === poleStep.gate);
    pole = hit
      ? { text: `${wait} because ${hit.because.text} → ${hit.gate.label}.`, facts: hit.because.facts }
      : poleStep.synthetic ? { text: `${wait} because a business check needs a registered company first.`, facts: [BUSINESS_FACT.id] }
      : { text: `${wait}, set by ${poleStep.title.replace(/\s*\(.*\)$/, "")}.`, facts: poleStep.facts };
  }

  const explain: Because[] = [
    ...c.gatesHit.map((x) => {
      const gs = steps.filter((s) => x.gate.steps.includes(s.id));
      const w = gs.reduce((a, s) => [a[0] + s.waitDays[0], a[1] + s.waitDays[1]], [0, 0]);
      return { text: `${x.gate.label}${w[1] ? ` (${fmtDays(w[0], w[1])})` : ""}: needed because ${x.because.text}.`, facts: x.because.facts };
    }),
    ...c.gatesSkipped.map((x) => ({ text: `${x.gate.label} skipped: ${x.reason}.`, facts: x.facts })),
  ];

  const lead = live
    ? c.tier === "paid" ? `${what}: real users can connect today. Every API call is billed.` : `${what}: real users can connect today.`
    : `${what}: ${wait} until real users can connect.`;

  const suggestions: Suggestion[] = [];
  if (opts.suggestions !== false && days[1] >= 1) {
    if (g.composio.managed === "available")
      suggestions.push({ id: "composio", kind: "composio", label: "Ship today on Composio's approved app", tradeoff: "Users see Composio on the consent screen. Run your own app's review in parallel.", savesDays: days[1], saves: fmtSave(days[1]), facts: g.composio.facts });
    for (const a of g.alternatives) {
      if (!a.replace.every((r) => need.caps.includes(r))) continue;
      const caps = [...new Set([...need.caps.filter((x) => !a.replace.includes(x)), ...a.with])];
      const alt = core(g, { caps, profile: need.profile });
      const save = days[1] - alt.days[1];
      if (save >= 3) suggestions.push({ id: a.id, kind: "alternative", label: a.label, tradeoff: a.tradeoff, savesDays: save, saves: fmtSave(save), caps, facts: a.facts });
    }
    const applicable = g.alternatives.filter((a) => a.replace.every((r) => need.caps.includes(r)));
    if (applicable.length > 1) {
      let caps = [...need.caps];
      for (const a of applicable) caps = [...new Set([...caps.filter((x) => !a.replace.includes(x)), ...a.with])];
      const alt = core(g, { caps, profile: need.profile });
      const save = days[1] - alt.days[1];
      if (save >= 3 && !suggestions.some((s) => s.kind !== "composio" && s.savesDays >= save))
        suggestions.push({ id: applicable.map((a) => a.id).join("+"), kind: "alternative", label: applicable.map((a, i) => (i ? a.label.charAt(0).toLowerCase() + a.label.slice(1) : a.label)).join(", and "), tradeoff: applicable.map((a) => a.tradeoff).join(" "), savesDays: save, saves: fmtSave(save), caps, facts: applicable.flatMap((a) => a.facts) });
    }
    if (need.caps.length > 1)
      for (const cap of capsSel) {
        const caps = need.caps.filter((x) => x !== cap.id);
        if (!g.capabilities.some((x) => caps.includes(x.id) && x.tier !== "none")) continue; // dropping it would leave nothing worth shipping
        const alt = core(g, { caps, profile: need.profile });
        const save = days[1] - alt.days[1];
        if (save >= 7 && !suggestions.some((s) => s.caps && s.caps.join() === caps.join()))
          suggestions.push({ id: `drop-${cap.id}`, kind: "drop", label: `Launch without “${cap.label}” first`, tradeoff: "Add it later; requesting a new scope can trigger another review.", savesDays: save, saves: fmtSave(save), caps, facts: cap.facts });
      }
    suggestions.sort((a, b) => (a.kind === "composio" ? -1 : b.kind === "composio" ? 1 : b.savesDays - a.savesDays));
  }

  return {
    need, tier: c.tier, days, wait, effort: fmtEffort(sch.activeMinutes), effortMin: sch.activeMinutes, live, lead, pole,
    steps, critical, gatesHit: c.gatesHit, gatesSkipped: c.gatesSkipped, warnings: c.warnings, explain, suggestions,
    toggles: opts.suggestions === false ? [] : relevantToggles(g, need, days),
  };
}

/** A personalisation chip is shown only if flipping it changes this provider's answer. */
export function relevantToggles(g: ProviderGraph, need: Need, days?: [number, number]): ToggleKey[] {
  const base = core(g, need);
  const sig = (x: ReturnType<typeof core>) => `${x.days.join()}|${x.steps.map((s) => s.id).join()}|${x.warnings.length}`;
  const b = sig(base);
  const flips: [ToggleKey, Partial<Profile>][] = [
    ["audience", { audience: need.profile.audience === "team" ? "public" : "team" }],
    ["scale", { scale: need.profile.scale === "small" ? "large" : "small" }],
    ["business", { business: !need.profile.business }],
  ];
  void days;
  return flips.filter(([, ch]) => sig(core(g, { caps: need.caps, profile: { ...need.profile, ...ch } })) !== b).map(([k]) => k);
}

/** Facts referenced anywhere in a plan, for the evidence panel. */
export function planFacts(g: ProviderGraph, p: Plan): Fact[] {
  const ids = new Set<string>([
    ...p.steps.flatMap((s) => s.facts), ...p.gatesHit.flatMap((x) => x.because.facts), ...p.gatesSkipped.flatMap((x) => x.facts),
    ...p.suggestions.flatMap((s) => s.facts), ...(p.pole?.facts || []), ...p.warnings.flatMap((w) => w.facts),
    ...g.composio.facts, ...g.facts.filter((f) => f.id.startsWith("probe-")).map((f) => f.id),
    ...g.capabilities.filter((c) => p.need.caps.includes(c.id)).flatMap((c) => c.facts),
  ]);
  const all = [...g.facts, BUSINESS_FACT];
  return all.filter((f) => ids.has(f.id));
}
