/* Real spring physics expressed as CSS linear() easings, so the compositor plays them with no per-frame JS.
   A damped spring (mass 1) is integrated from 0 to 1; samples at 60 Hz become the linear() stops.
   Presets are tuned for an operations tool: critically-damped-ish, no visible bounce, 150–350 ms. */

export type SpringCfg = { stiffness: number; damping: number };
export type Spring = { duration: number; easing: string };

export const SPRINGS = {
  /** FLIP moves, indicators, list reorders */
  snappy: { stiffness: 520, damping: 46 },
  /** expand / collapse, sheets, route entrances */
  gentle: { stiffness: 300, damping: 34 },
  /** large surfaces (setup kit sheet) */
  sheet: { stiffness: 380, damping: 40 },
} satisfies Record<string, SpringCfg>;
export type SpringName = keyof typeof SPRINGS;

const cache = new Map<string, Spring>();

export function spring(cfg: SpringCfg, maxMs = 350): Spring {
  const key = `${cfg.stiffness}|${cfg.damping}|${maxMs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dt = 1 / 1000;
  let x = 0, v = 0, t = 0, next = 1 / 60;
  const xs = [0];
  while (t < 2) {
    const a = -cfg.stiffness * (x - 1) - cfg.damping * v;
    v += a * dt; x += v * dt; t += dt;
    if (t >= next) { xs.push(x); next += 1 / 60; }
    if (t > 0.05 && Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.05) break;
  }
  xs.push(1);
  const duration = Math.min(maxMs, Math.round(t * 1000));
  // if we clipped the duration, resample so the curve still ends at 1 within maxMs
  const n = Math.max(2, Math.round((duration / 1000) * 60));
  const stops = duration < Math.round(t * 1000) ? resample(xs, n) : xs;
  const res = { duration, easing: `linear(${stops.map((s) => +s.toFixed(4)).join(", ")})` };
  cache.set(key, res);
  return res;
}

function resample(xs: number[], n: number) {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * (xs.length - 1);
    const a = Math.floor(p), b = Math.min(xs.length - 1, a + 1);
    out.push(xs[a] + (xs[b] - xs[a]) * (p - a));
  }
  out[out.length - 1] = 1;
  return out;
}

export const springOf = (name: SpringName) => spring(SPRINGS[name]);

/** CSS custom properties for every preset (--ease-snappy, --dur-snappy …), set once on <html>. */
export function springCssVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(SPRINGS) as SpringName[]) {
    const s = springOf(k);
    out[`--ease-${k}`] = s.easing;
    out[`--dur-${k}`] = `${s.duration}ms`;
  }
  return out;
}
