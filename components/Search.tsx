"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IndexEntry } from "@/lib/types";
import { AppLogo, DiffPill } from "./bits";

export default function Search({ index, compact = false }: { index: IndexEntry[]; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); box.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return index.filter((i) => i.curated).slice(0, 6);
    const scored = index
      .map((i) => {
        const n = i.name.toLowerCase();
        const s = n === t ? 100 : n.startsWith(t) ? 80 : n.includes(t) ? 50 : i.slug.includes(t.replace(/\s+/g, "-")) ? 40 : 0;
        return { i, s: s + (i.curated ? 5 : i.generated ? 3 : 0) };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 7);
    return scored.map((x) => x.i);
  }, [q, index]);

  const exact = matches.find((m) => m.name.toLowerCase() === q.trim().toLowerCase());
  const options: ({ kind: "entry"; e: IndexEntry } | { kind: "gen" })[] = [
    ...matches.map((e) => ({ kind: "entry" as const, e })),
    ...(q.trim() && !exact ? [{ kind: "gen" as const }] : []),
  ];

  const go = (o: (typeof options)[number] | undefined) => {
    if (!o) return;
    if (o.kind === "gen") router.push(`/generate?q=${encodeURIComponent(q.trim())}`);
    else if (o.e.curated || o.e.generated) router.push(`/guide/${o.e.slug}`);
    else router.push(`/generate?q=${encodeURIComponent(o.e.name)}&slug=${o.e.slug}`);
  };

  return (
    <div className="relative">
      <div className={`card flex items-center gap-3 px-4 ${compact ? "py-2.5" : "py-3.5"} shadow-[0_1px_0_rgba(0,0,0,.03),0_8px_30px_-12px_rgba(40,35,20,.18)] focus-within:border-ink-3`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          ref={box}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            if (e.key === "Enter") go(options[hi] || (q.trim() ? { kind: "gen" } : undefined));
          }}
          placeholder="Look up an app or paste its website, e.g. Gmail, Calendly, pipedrive.com"
          className="w-full bg-transparent text-[16px] outline-none placeholder:text-ink-3"
          aria-label="Search apps"
        />
        <span className="kbd hidden sm:inline">/</span>
      </div>
      {open && options.length > 0 && (
        <div className="card absolute z-20 mt-2 w-full overflow-hidden p-1.5 shadow-xl rise">
          {!q.trim() && <div className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wider text-ink-3">Ready guides</div>}
          {options.map((o, k) =>
            o.kind === "entry" ? (
              <button key={o.e.slug} onMouseDown={() => go(o)} onMouseEnter={() => setHi(k)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${hi === k ? "bg-paper" : ""}`}>
                <span className="flex items-center gap-3">
                  <AppLogo slug={o.e.composioSlug || o.e.slug} name={o.e.name} size={22} />
                  <span className="font-medium">{o.e.name}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  {o.e.difficulty ? <><DiffPill label={o.e.difficulty} /> <span className="hidden sm:inline">{o.e.wait}</span></> : <span>Generate live →</span>}
                </span>
              </button>
            ) : (
              <button key="gen" onMouseDown={() => go(o)} onMouseEnter={() => setHi(k)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${hi === k ? "bg-paper" : ""}`}>
                <span className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-ink text-[11px] text-white">✦</span>
                  <span>Investigate <b className="font-medium">“{q.trim()}”</b> with the agent</span>
                </span>
                <span className="text-xs text-ink-3">~45s · live</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
