"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IndexEntry } from "@/lib/types";
import { exact, hrefFor, match } from "@/lib/search";

/** Compact command bar in the header on guide pages. On the home page the board owns the command bar. */
export default function HeaderBar({ index }: { index: IndexEntry[] }) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const home = path === "/";

  useEffect(() => {
    if (home) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [home]);

  const results = useMemo(() => (q.trim() ? match(index, q).slice(0, 6) : []), [index, q]);
  const hit = exact(index, q);
  const rows: { label: string; sub: string; href: string }[] = [
    ...results.map((e) => ({ label: e.name, sub: e.curated || e.generated ? `${e.wait} · ${e.gate || ""}` : "investigate live", href: hrefFor(e, q) })),
    ...(q.trim() && !hit ? [{ label: `Investigate “${q.trim()}” live`, sub: "agent", href: hrefFor(null, q) }] : []),
  ];

  if (home) return <div className="flex-1" />;

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    ref.current?.blur();
    router.push(href);
  };

  return (
    <div className="relative min-w-0 flex-1 max-w-[440px]">
      <label className="flex h-9 items-center gap-2 border rule bg-surface px-2.5 focus-within:border-ink">
        <span className="mono text-[13px] text-ink-3" aria-hidden>→</span>
        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            if (e.key === "Escape") { setQ(""); ref.current?.blur(); }
            if (e.key === "Enter" && rows[hi]) go(rows[hi].href);
          }}
          placeholder="Any app or URL"
          aria-label="Find an app or investigate a new one"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
        />
        <span className="kbd hidden sm:inline" aria-hidden>/</span>
      </label>
      {open && rows.length > 0 && (
        <ul className="absolute left-0 right-0 top-10 z-40 border rule bg-surface shadow-[0_8px_24px_-12px_rgba(0,0,0,.25)]" role="listbox">
          {rows.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === hi}>
              <button
                onMouseDown={(e) => { e.preventDefault(); go(r.href); }}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between gap-3 border-l-2 px-3 py-2 text-left text-[14px] ${i === hi ? "border-signal bg-shade" : "border-transparent"}`}
              >
                <span className="truncate">{r.label}</span>
                <span className="label shrink-0 !text-[10px]">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
