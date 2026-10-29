import type { Guide, Step, Tier } from "./types";

export const TIER_ORDER: Tier[] = ["instant", "self_serve", "review", "restricted", "partner"];

export const TIER_META: Record<Tier, { label: string; tone: string; blurb: string }> = {
  instant: { label: "Instant", tone: "go", blurb: "Works as soon as the app exists" },
  self_serve: { label: "Self-serve", tone: "go", blurb: "Toggle it on yourself, no review" },
  review: { label: "Review", tone: "wait", blurb: "Provider reviews your app before strangers can use it" },
  restricted: { label: "Restricted", tone: "hard", blurb: "Review plus a security assessment or business checks" },
  partner: { label: "Partner-only", tone: "stop", blurb: "Gated program: apply and get vetted, approval not guaranteed" },
  paid: { label: "Paid API", tone: "wait", blurb: "Works without review, but every call costs money" },
};

export type Difficulty = { key: "easy" | "moderate" | "hard" | "gated"; label: string };

export function defaultSelection(g: Guide): string[] {
  const d = g.capabilities.filter((c) => c.default).map((c) => c.id);
  return d.length ? d : [g.capabilities[0].id];
}

export function activeSteps(g: Guide, sel: string[]): Step[] {
  return g.steps.filter((s) => !s.requiredFor.length || s.requiredFor.some((r) => sel.includes(r)));
}

export function topTier(g: Guide, sel: string[]): Tier {
  let best: Tier = "instant";
  let paid = false;
  for (const c of g.capabilities) {
    if (!sel.includes(c.id)) continue;
    if (c.tier === "paid") { paid = true; continue; }
    if (TIER_ORDER.indexOf(c.tier) > TIER_ORDER.indexOf(best)) best = c.tier;
  }
  if (paid && TIER_ORDER.indexOf(best) <= 1) return "paid";
  return best;
}

export function difficulty(t: Tier): Difficulty {
  switch (t) {
    case "instant":
    case "self_serve":
      return { key: "easy", label: "Easy" };
    case "review":
    case "paid":
      return { key: "moderate", label: "Moderate" };
    case "restricted":
      return { key: "hard", label: "Hard" };
    case "partner":
      return { key: "gated", label: "Gated" };
  }
}

export type Scheduled = Step & { startMin: number; startMax: number; endMin: number; endMax: number };

/** Longest-path schedule over the step DAG. Waiting runs in parallel unless `after` says otherwise. */
export function schedule(steps: Step[]): { items: Scheduled[]; daysMin: number; daysMax: number; activeMinutes: number } {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const memo = new Map<string, Scheduled>();
  const visit = (s: Step, depth = 0): Scheduled => {
    const m = memo.get(s.id);
    if (m) return m;
    let startMin = 0, startMax = 0;
    if (depth < 50)
      for (const a of s.after) {
        const p = byId.get(a);
        if (!p) continue;
        const ps = visit(p, depth + 1);
        startMin = Math.max(startMin, ps.endMin);
        startMax = Math.max(startMax, ps.endMax);
      }
    const activeDays = s.activeMinutes / (60 * 6); // ~6 focused hours per working day
    const r: Scheduled = {
      ...s,
      startMin, startMax,
      endMin: startMin + s.waitDays[0] + activeDays,
      endMax: startMax + s.waitDays[1] + activeDays,
    };
    memo.set(s.id, r);
    return r;
  };
  const items = steps.map((s) => visit(s));
  return {
    items,
    daysMin: Math.max(0, ...items.map((i) => i.endMin)),
    daysMax: Math.max(0, ...items.map((i) => i.endMax)),
    activeMinutes: steps.reduce((a, s) => a + s.activeMinutes, 0),
  };
}

/** Steps with provider-side waiting, plus the prerequisites that must happen before the clock can start. */
export function startTheClock(steps: Step[]): (Step & { startsToday: boolean; startMax: number })[] {
  const sch = schedule(steps).items;
  return sch
    .filter((s) => s.waitDays[1] >= 1)
    .map((s) => ({ ...s, startsToday: s.startMax < 1 }))
    .sort((a, b) => a.startMax - b.startMax || b.waitDays[1] - a.waitDays[1]);
}

export function fmtDays(min: number, max: number): string {
  const f = (d: number) => {
    if (d < 0.08) return "minutes";
    if (d < 1) return `${Math.max(1, Math.round(d * 6))}h`;
    if (d < 14) return `${Math.round(d)}d`;
    if (d < 60) return `${Math.round(d / 7)}w`;
    return `${Math.round(d / 30)}mo`;
  };
  if (max < 0.08) return "Same day";
  if (max < 1) return "Same day";
  const a = f(min), b = f(max);
  if (min < 1 && max <= 1.01) return "≤1 day";
  if (a === b) return `~${b}`;
  if (min < 1) return `≤${b}`;
  return `${a}–${b}`;
}

export function fmtEffort(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h < 10 ? `${Math.round(h * 2) / 2}h` : `${Math.round(h)}h`;
}

export function headline(g: Guide, sel = defaultSelection(g)) {
  const steps = activeSteps(g, sel);
  const sch = schedule(steps);
  const tier = topTier(g, sel);
  return { tier, difficulty: difficulty(tier), wait: fmtDays(sch.daysMin, sch.daysMax), effort: fmtEffort(sch.activeMinutes), sch, steps };
}

/** Worst case across all capabilities — used for library cards ("up to …"). */
export function worstCase(g: Guide) {
  return headline(g, g.capabilities.map((c) => c.id));
}
