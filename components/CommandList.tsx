"use client";
import type { CmdRow } from "@/lib/command";
import { StatusBadge } from "./ui";

/** One row of command results: an app to open, a stored guide (maybe a near match), or a new investigation. */
export function CmdRowView({ r, active, compact }: { r: CmdRow; active: boolean; compact?: boolean }) {
  if (r.kind === "investigate")
    return (
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2"><span className="text-signal-ink" aria-hidden>+</span><span className="clamp-1">Investigate <b className="font-semibold">“{r.q}”</b></span></span>
        <span className="label shrink-0 !text-[10px]">{compact ? "1–3 min" : "new guide · 1–3 min"}</span>
      </span>
    );
  if (r.kind === "stored")
    return (
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="clamp-1 block">{r.fuzzy ? <>Did you mean <b className="font-semibold">{r.item.name}</b>?</> : r.item.name}</span>
          {!compact && <span className="clamp-1 block text-[12px] text-ink-3">Already investigated · opens instantly, no new run</span>}
        </span>
        <StatusBadge status={r.item.status} />
      </span>
    );
  const e = r.entry;
  const ready = e.curated || e.generated || e.stored;
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="clamp-1 block">{e.name}</span>
        {!compact && <span className="clamp-1 block text-[12px] text-ink-3" title={ready ? e.gate : undefined}>{ready ? `${e.wait} · ${e.gate}` : "No guide yet · investigate live"}</span>}
      </span>
      {ready && e.status ? <StatusBadge status={e.status} /> : <span className="label shrink-0 !text-[10px]">{ready ? e.wait : "live ↗"}</span>}
    </span>
  );
}
