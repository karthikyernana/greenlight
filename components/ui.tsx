"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Collapse, animate } from "./motion";

export type Status = "curated" | "verified" | "draft";
const STATUS: Record<Status, { short: string; long: string; title: string }> = {
  curated: { short: "Curated", long: "Curated · hand-researched", title: "Researched by hand and re-checked against provider docs." },
  verified: { short: "Verified", long: "Verified by checks", title: "Agent-generated. Passed every automatic check: ≥80% of quotes found in source, no unresolved contradiction, every gate fact sourced or tested." },
  draft: { short: "Draft", long: "Draft · agent-generated", title: "Agent-generated and not yet verified: at least one automatic check failed. Read the failed checks before relying on it." },
};

export function StatusBadge({ status, long, className = "" }: { status: Status; long?: boolean; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={`badge badge-${status} ${className}`} title={s.title}>
      <span className="badge-dot" aria-hidden />
      {long ? s.long : s.short}
    </span>
  );
}

export function Tick() {
  return (
    <span className="tick" aria-hidden>
      <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.2 4.2 3.1 6 6.8 2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** Segmented control with a thumb that springs between options. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  const measure = useCallback(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(value)}"]`);
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  useLayoutEffect(measure, [measure]);
  useEffect(() => { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure]);
  return (
    <div ref={ref} className="seg" role="radiogroup" aria-label={label}>
      {thumb && <span className="seg-thumb" style={{ left: thumb.left, width: thumb.width }} aria-hidden />}
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" data-v={o.v} aria-checked={value === o.v} onClick={() => onChange(o.v)} className={value === o.v ? "seg-on" : ""}>{o.label}</button>
      ))}
    </div>
  );
}

/** A section that opens with a spring. Header shows a title and one line of meta. */
export function Disclosure({ id, title, meta, hot, children, defaultOpen = false, open: openProp, onOpenChange }: { id: string; title: string; meta?: React.ReactNode; hot?: boolean; children: React.ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const set = (o: boolean) => { setOwn(o); onOpenChange?.(o); };
  return (
    <section id={id} className="border-b rule last:border-b-0">
      <h2>
        <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => set(!open)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-shade/60 sm:px-5">
          <span className="flex shrink-0 items-center gap-2.5 text-[15px] font-medium">
            <span className="disclose-chev text-[10px] text-ink-3" aria-hidden>▶</span>
            <span>{title}</span>
          </span>
          {meta && <span className={`mono num clamp-1 text-right text-[12px] ${hot ? "text-signal-ink" : "text-ink-3"}`}>{meta}</span>}
        </button>
      </h2>
      <Collapse open={open} id={`${id}-body`}>
        <div className="px-4 pb-5 pl-[38px] sm:px-5 sm:pl-[42px]">{children}</div>
      </Collapse>
    </section>
  );
}

/** Glass toast that springs in from below. */
export function useToast() {
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2200);
  }, []);
  const node = msg ? <Toast key={msg} msg={msg} /> : null;
  return { flash, node };
}
function Toast({ msg }: { msg: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { animate(ref.current, [{ opacity: 0, transform: "translate(-50%, 10px) scale(.98)" }, { opacity: 1, transform: "translate(-50%, 0)" }], "snappy"); }, []);
  return <div ref={ref} role="status" className="toast mono bottom-[84px] lg:bottom-6">{msg}</div>;
}

export function Icon({ name, size = 16 }: { name: "pin" | "pinned" | "link" | "kit" | "refresh" | "arrow" | "search" | "close" | "trace"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "pin": return <svg {...p}><path d="M6 2.5h4l-.6 4 2.1 2H4.5l2.1-2z" /><path d="M8 8.5V13.5" /></svg>;
    case "pinned": return <svg {...p}><path d="M6 2.5h4l-.6 4 2.1 2H4.5l2.1-2z" fill="currentColor" /><path d="M8 8.5V13.5" /></svg>;
    case "link": return <svg {...p}><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6" /></svg>;
    case "kit": return <svg {...p}><rect x="2.5" y="4.5" width="11" height="8.5" rx="1.5" /><path d="M6 4.5V3.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7v1.3M2.5 8h11" /></svg>;
    case "refresh": return <svg {...p}><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.5v3h-3" /></svg>;
    case "arrow": return <svg {...p}><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
    case "search": return <svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>;
    case "close": return <svg {...p}><path d="m4 4 8 8M12 4l-8 8" /></svg>;
    case "trace": return <svg {...p}><path d="M2.5 12.5h11M4 10V7M7 10V4M10 10V6M13 10V8" /></svg>;
  }
}
