"use client";
import type { Step } from "@/lib/types";
import { runway, RULER_TICKS, type Lane } from "@/lib/plan";

const LANES: { id: Lane; label: string; sub: string }[] = [
  { id: "agent", label: "Agent", sub: "can do it" },
  { id: "you", label: "You", sub: "must do it" },
  { id: "provider", label: "Provider", sub: "you wait" },
];

const ROW_H = 22;

function liveDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + Math.ceil(days * 1.4)); // provider estimates are business days
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Horizontal runway Today → Live, built from the step DAG. Bars are numbered like the checklist. */
export default function Runway({ steps, onPick }: { steps: Step[]; onPick?: (id: string) => void }) {
  const { bars, rows, maxDays, scale } = runway(steps);
  const sameDay = maxDays <= 1.01 && steps.every((s) => s.waitDays[1] === 0);
  const HOURS = [{ d: 0, label: "Today" }, { d: 1 / 6, label: "1h" }, { d: 1 / 3, label: "2h" }, { d: 2 / 3, label: "4h" }];
  const ticks: { x: number; label: string }[] = [];
  for (const t of sameDay ? HOURS : RULER_TICKS) {
    if (t.d > maxDays * 1.02) break;
    const x = scale(t.d);
    if (ticks.length && x - ticks[ticks.length - 1].x < 0.085) continue;
    if (1 - x < 0.06 && t.d !== 0) continue; // don't crowd the LIVE line
    ticks.push({ x, label: t.label });
  }
  const liveLabel = sameDay ? "LIVE TODAY" : `LIVE ≈ ${liveDate(maxDays).toUpperCase()}`;

  return (
    <div className="select-none" aria-label="Runway from today to live">
      <div className="grid grid-cols-[64px_1fr] sm:grid-cols-[92px_1fr]">
        <div />
        <div className="flex justify-end pb-1">
          <span className="mono whitespace-nowrap text-[11px] font-semibold text-signal-ink">{liveLabel} <span aria-hidden>▼</span></span>
        </div>
        <div />
        <div className="relative h-5 border-b border-ink">
          {ticks.map((t) => (
            <span key={t.label} className="absolute bottom-0 flex flex-col items-start" style={{ left: `${t.x * 100}%` }}>
              <span className="mono num mb-0.5 text-[10.5px] text-ink-3">{t.label.toUpperCase()}</span>
              <span className="h-1.5 w-px bg-ink" />
            </span>
          ))}
          <span className="absolute bottom-0 right-0 h-full w-[2px] bg-signal" />
        </div>
      </div>
      {LANES.map((lane) => {
        const n = Math.max(1, rows[lane.id]);
        const laneBars = bars.filter((b) => b.lane === lane.id);
        return (
          <div key={lane.id} className="grid grid-cols-[64px_1fr] border-b rule sm:grid-cols-[92px_1fr]">
            <div className="flex flex-col justify-center py-1.5 pr-2">
              <span className="mono text-[11px] font-semibold uppercase tracking-[0.06em]">{lane.label}</span>
              <span className="hidden text-[11px] text-ink-3 sm:block">{lane.sub}</span>
            </div>
            <div className="relative" style={{ height: n * ROW_H + 12 }}>
              {ticks.map((t) => (
                <span key={t.label} className="absolute top-0 bottom-0 w-px bg-rule" style={{ left: `${t.x * 100}%` }} />
              ))}
              <span className="absolute top-0 bottom-0 right-0 w-[2px] bg-signal/70" />
              {!laneBars.length && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">
                  {lane.id === "provider" ? "No provider review to wait for" : lane.id === "you" ? "Nothing only you can do" : "—"}
                </span>
              )}
              {laneBars.map((b) => {
                const left = b.x0 * 100;
                const solid = Math.max(0.6, (b.x1 - b.x0) * 100);
                const tail = b.x2 !== undefined ? Math.max(0, (b.x2 - b.x1) * 100) : 0;
                const top = 6 + b.row * ROW_H;
                const tip = b.titles.map((t, i) => `${b.ns[i]}. ${t}`).join(" · ") + (b.kind === "wait" ? " (provider wait)" : "") + (b.critical ? " · critical path" : "");
                const label = b.ns.join(" ");
                return (
                  <button
                    key={`${b.ids.join("+")}-${b.lane}`}
                    type="button"
                    title={tip}
                    aria-label={tip}
                    onClick={() => onPick?.(b.id)}
                    className="group absolute flex h-[16px] items-stretch fill-in"
                    style={{ left: `${left}%`, top, width: `${solid + tail}%`, minWidth: 8 + label.length * 6.4 }}
                  >
                    {b.kind === "wait" ? (
                      <>
                        <span className={`wait-solid relative h-full ${b.critical ? "crit" : ""}`} style={{ width: `${(solid / (solid + tail || 1)) * 100}%`, minWidth: 14 }}>
                          <span className="mono absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink">{label}</span>
                        </span>
                        {tail > 0 && <span className="wait-hatch h-full flex-1" />}
                      </>
                    ) : (
                      <span
                        className={`mono flex h-full w-full items-center justify-center text-[10px] font-semibold ${
                          lane.id === "you" ? "bg-ink text-white" : "border border-ink bg-surface text-ink"
                        } ${b.critical ? "!border-signal !bg-signal !text-ink" : ""} group-hover:outline group-hover:outline-1 group-hover:outline-ink`}
                      >
                        {label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 border border-ink bg-surface" /> agent work</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 bg-ink" /> your work</span>
        <span className="flex items-center gap-1.5"><span className="wait-solid inline-block h-2.5 w-3" /><span className="wait-hatch -ml-1.5 inline-block h-2.5 w-3" /> provider wait (likely → worst)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 bg-signal" /> critical path</span>
        <span className="hidden sm:inline">Log time scale: a 10-minute task and a 6-week review share one ruler.</span>
      </div>
    </div>
  );
}
