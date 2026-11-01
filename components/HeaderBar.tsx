"use client";
import { suggestLead } from "@/lib/checkClient";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IndexEntry } from "@/lib/types";
import { parseIntent, intentHref, type IntentIndex } from "@/lib/intent";
import { hrefForIntent } from "@/lib/intentClient";
import { commandRows, type CmdRow } from "@/lib/command";
import { useStored } from "./useStored";
import { CmdRowView } from "./CommandList";
import { animate } from "./motion";
import { checkQuery, type ClientCheck } from "@/lib/checkClient";
import { Icon } from "./ui";

/** Compact command bar in the header on every page except Home (Home owns the big one). */
export default function HeaderBar({ index, intents, jev = false }: { index: IndexEntry[]; intents: IntentIndex[]; jev?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [hi, setHi] = useState(0);
  const [checking, setChecking] = useState(false);
  const [rejected, setRejected] = useState<Extract<ClientCheck, { ok: false }> | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const home = path === "/";
  const stored = useStored([], used);

  useEffect(() => {
    if (home) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [home]);

  const intent = q.trim().split(/\s+/).length >= 3 ? parseIntent(q, intents) : null;
  const rows = useMemo<{ r?: CmdRow; label?: string; href: string }[]>(() => {
    if (intent) return [{ label: `Plan ${intent.app}${intent.caps.length ? `: ${intent.caps.map((c) => intents.find((x) => x.slug === intent.slug)?.caps.find((k) => k.id === c)?.label || c).join(", ")}` : ""}`, href: intentHref(intent) }];
    return commandRows(index, stored, q, 6).map((r) => ({ r, href: r.href }));
  }, [intent, intents, index, stored, q]);
  const show = open && rows.length > 0;
  useEffect(() => { if (show) animate(list.current, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], "snappy"); }, [show]);

  /* Same markup on every route so hydration never depends on the pathname (an ISR-regenerated Home on Vercel was
     rendered with the bar while the client's usePathname() said "/", which threw React #418). Home hides it in CSS
     (body:has([data-home]) .headerbar-search) because Home owns the big command bar. */
  const go = (href: string) => { setOpen(false); setQ(""); setRejected(null); ref.current?.blur(); router.push(href); };
  /* new investigations pass the server's input gate first */
  const pick = async (i: number) => {
    const x = rows[i];
    if (!x) return;
    if (intent && i === 0) {
      if (intent.ready) { hrefForIntent(q, intent, jev).then(go); return; }
    } else if (x.r?.kind !== "investigate") { go(x.href); return; }
    if (checking) return;
    setChecking(true);
    const c = await checkQuery(q.trim());
    setChecking(false);
    if (c && !c.ok) { setRejected(c); setOpen(true); return; }
    go(c?.ok ? c.href : x.href);
  };

  return (
    <div className="relative min-w-0 max-w-[460px] flex-1">
      <div className="headerbar-search">
      <label className="flex h-9 items-center gap-2 rounded-[10px] border rule bg-surface/80 px-2.5 shadow-[var(--shadow-1)] transition-colors focus-within:border-ink-3">
        <span className="text-ink-3"><Icon name="search" size={14} /></span>
        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); setRejected(null); }}
          onFocus={() => { setOpen(true); setUsed(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            if (e.key === "Escape") { setQ(""); ref.current?.blur(); }
            if (e.key === "Enter" && rows[hi]) pick(hi);
          }}
          placeholder="Find an app"
          aria-label="Find an app or investigate a new one"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
          autoComplete="off"
          spellCheck={false}
        />
        {checking ? <span className="live-dot" aria-label="Checking" /> : <span className="kbd hidden sm:inline" aria-hidden>/</span>}
      </label>
      {open && rejected && (
        <div role="alert" data-rejected="" className="glass absolute left-0 right-0 top-11 z-40 rounded-[12px] px-3 py-2.5 text-[13.5px] sm:right-auto sm:w-[min(460px,90vw)]">
          <p>{rejected.message}</p>
          {rejected.suggestions.length > 0 && <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">{suggestLead(rejected.suggestions)} {rejected.suggestions.map((s) => <button key={s.slug} onMouseDown={(e) => { e.preventDefault(); go(s.href); }} className="badge hover:text-ink">{s.name}</button>)}</p>}
        </div>
      )}
      {show && !rejected && (
        <ul ref={list} className="glass absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-[12px] p-1 sm:right-auto sm:w-[min(460px,90vw)]" role="listbox">
          {rows.map((x, i) => (
            <li key={x.href + i} role="option" aria-selected={i === hi}>
              <button
                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[14px] transition-colors ${i === hi ? "bg-shade" : ""}`}
              >
                {x.r ? <CmdRowView r={x.r} active={i === hi} compact /> : <span className="clamp-1">{x.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
