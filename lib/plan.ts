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
    if (d < 13.5) return `${Math.round(d)}d`;
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

/* ───────────────────────── v2: verdict, critical path, runway ───────────────────────── */

const GATE_BY_TIER: Record<Tier, string> = {
  instant: "None",
  self_serve: "None",
  review: "App review",
  restricted: "Security / business review",
  partner: "Partner program",
  paid: "Pay per call",
};

/** Short label for what stands between the developer and real users (board column). */
export function gateLabel(g: Guide): string {
  if (g.gate) return g.gate;
  return GATE_BY_TIER[topTier(g, g.capabilities.map((c) => c.id))];
}

/** Chain of steps that sets the finish date (longest path by worst-case end). */
export function criticalPath(steps: Step[]): string[] {
  const { items } = schedule(steps);
  if (!items.length) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  let cur = items.reduce((a, b) => (b.endMax > a.endMax ? b : a));
  if (cur.endMax < 0.08) return [];
  const path = [cur.id];
  for (let guard = 0; guard < 50; guard++) {
    const preds = cur.after.map((a) => byId.get(a)).filter(Boolean) as Scheduled[];
    if (!preds.length) break;
    cur = preds.reduce((a, b) => (b.endMax > a.endMax ? b : a));
    path.unshift(cur.id);
  }
  return path;
}

/** The single step that dominates the wait: biggest provider wait on the critical path. */
export function longPole(steps: Step[]): Step | undefined {
  const cp = new Set(criticalPath(steps));
  const onPath = steps.filter((s) => cp.has(s.id) && s.waitDays[1] > 0);
  if (!onPath.length) return undefined;
  return onPath.reduce((a, b) => (b.waitDays[1] > a.waitDays[1] ? b : a));
}

function cleanTitle(t: string) {
  return t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

/** One-line verdict, e.g. "Read email: 5w–2mo to live. Long pole: CASA security assessment." */
export function verdict(g: Guide, sel: string[]): { lead: string; pole?: string; wait: string } {
  const h = headline(g, sel);
  // Name the capabilities that set the pace (the top tier), not the easy ones riding along.
  const chosen = g.capabilities.filter((c) => sel.includes(c.id));
  const pacing = chosen.filter((c) => c.tier === h.tier);
  const labels = (pacing.length ? pacing : chosen).map((c) => c.label);
  const what = labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(" + ");
  const pole = longPole(h.steps);
  if (h.sch.daysMax < 1) {
    const paid = h.tier === "paid";
    return { lead: `${what}: live today.`, pole: paid ? "No review, but every API call is billed." : "No provider review stands in the way.", wait: h.wait };
  }
  return { lead: `${what}: ${h.wait} to live.`, pole: pole ? `Long pole: ${cleanTitle(pole.title)}.` : undefined, wait: h.wait };
}

/** Pseudo-log time scale so a 10-minute task and a 6-week review share one ruler. */
export function makeScale(maxDays: number) {
  const span = Math.max(1, maxDays);
  const k = 1.2; // knee in days
  const f = (d: number) => Math.log1p(Math.max(0, d) / k);
  const top = f(span);
  return (d: number) => Math.min(1, f(d) / top);
}

export const RULER_TICKS: { d: number; label: string }[] = [
  { d: 0, label: "Today" },
  { d: 1, label: "1d" },
  { d: 3, label: "3d" },
  { d: 7, label: "1w" },
  { d: 14, label: "2w" },
  { d: 30, label: "1mo" },
  { d: 60, label: "2mo" },
  { d: 90, label: "3mo" },
  { d: 180, label: "6mo" },
  { d: 365, label: "1y" },
];

export type Lane = "agent" | "you" | "provider";
export type Bar = {
  id: string; n: number; lane: Lane; row: number;
  ids: string[]; ns: number[]; titles: string[]; // >1 when parallel same-start work is merged into one cluster
  x0: number; x1: number; // 0..1 (solid part)
  x2?: number; // 0..1 end of uncertain tail (wait max)
  title: string; critical: boolean; kind: "work" | "wait";
};

/**
 * Turns the scheduled DAG into runway bars on three swimlanes.
 * Work happens in the owner's lane (both = agent preps + you finish), provider waiting gets its own lane.
 * Overlapping bars in one lane are packed into sub-rows.
 */
export function runway(steps: Step[]): { bars: Bar[]; rows: Record<Lane, number>; maxDays: number; scale: (d: number) => number } {
  const sch = schedule(steps);
  const maxDays = Math.max(1, sch.daysMax);
  const scale = makeScale(maxDays);
  const cp = new Set(criticalPath(steps));
  const minW = 0.018;
  const raw: Omit<Bar, "row" | "ids" | "ns" | "titles">[] = [];
  sch.items.forEach((s, i) => {
    const n = i + 1;
    const active = s.activeMinutes / 360;
    const a0 = scale(s.startMax), a1 = Math.max(scale(s.startMax + active), a0 + minW);
    const crit = cp.has(s.id);
    if (s.owner === "agent" || s.owner === "both") raw.push({ id: s.id, n, lane: "agent", x0: a0, x1: a1, title: s.title, critical: crit, kind: "work" });
    if (s.owner === "you" || s.owner === "both") raw.push({ id: s.id, n, lane: "you", x0: a0, x1: a1, title: s.title, critical: crit, kind: "work" });
    if (s.waitDays[1] > 0) {
      const w0 = scale(s.startMax + active);
      const wMin = Math.max(scale(s.startMax + active + s.waitDays[0]), w0 + minW);
      const wMax = Math.max(scale(s.startMax + active + s.waitDays[1]), wMin);
      raw.push({ id: s.id, n, lane: "provider", x0: w0, x1: wMin, x2: wMax, title: s.title, critical: crit, kind: "wait" });
    }
  });
  // Merge work that starts at the same moment in the same lane ("do 1, 2, 3 today") into one cluster bar.
  const merged: Omit<Bar, "row">[] = [];
  for (const b of raw.sort((a, b) => a.x0 - b.x0 || a.n - b.n)) {
    const prev = merged.find((m) => m.kind === "work" && b.kind === "work" && m.lane === b.lane && m.critical === b.critical && Math.abs(m.x0 - b.x0) < 0.012);
    if (prev) {
      prev.ids.push(b.id); prev.ns.push(b.n); prev.titles.push(b.title);
      prev.x1 = Math.max(prev.x1, b.x1);
    } else merged.push({ ...b, ids: [b.id], ns: [b.n], titles: [b.title] });
  }
  const rows: Record<Lane, number> = { agent: 0, you: 0, provider: 0 };
  const ends: Record<Lane, number[]> = { agent: [], you: [], provider: [] };
  const bars: Bar[] = merged
    .map((b) => {
      const e = ends[b.lane];
      // reserve room for the printed step numbers so labels never collide on narrow screens
      const right = Math.max(b.x2 ?? b.x1, b.x0 + 0.02 + 0.035 * b.ns.length);
      let row = e.findIndex((end) => end <= b.x0 + 0.002);
      if (row < 0) { row = e.length; e.push(right); } else e[row] = right;
      rows[b.lane] = Math.max(rows[b.lane], row + 1);
      return { ...b, row };
    });
  return { bars, rows, maxDays, scale };
}

/** Waits that can start today (no unfinished prerequisites that take more than a day). */
export function startToday(steps: Step[]): Step[] {
  return startTheClock(steps).filter((s) => s.startsToday);
}
