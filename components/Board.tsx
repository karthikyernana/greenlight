"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { hrefFor } from "@/lib/search";
import { parseIntent, type IntentIndex } from "@/lib/intent";
import { hrefForIntent } from "@/lib/intentClient";
import { commandRows, type StoredLite } from "@/lib/command";
import { useStored } from "./useStored";
import { CmdRowView } from "./CommandList";
import { useFlip, navigateWithTransition } from "./motion";
import { Icon, Seg, StatusBadge } from "./ui";
import Shelf from "./Shelf";

type Filter = "ready" | "demand" | "all";
type Sort = "wait" | "name";
const isReady = (e: IndexEntry) => !!(e.curated || e.generated || e.stored);

/** Home = command bar → Your apps → the board. Typing swaps the board for results; Enter opens, or investigates only when nothing matches. */
export default function Board({ index, drafts = [], intents, jev = false }: { index: IndexEntry[]; drafts?: IndexEntry[]; intents: IntentIndex[]; jev?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ready");
  const [sort, setSort] = useState<Sort>("wait");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const initialStored = useMemo<StoredLite[]>(() => [...index.filter((e) => e.stored), ...drafts].map((e) => ({ slug: e.slug, name: e.name, domain: e.domain, status: e.status || "draft" })), [index, drafts]);
  const fetched = useStored(initialStored, true);
  const stored = fetched.length ? fetched : initialStored;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA/.test(t.tagName)) { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => ({ ready: index.filter(isReady).length, demand: index.filter((e) => !isReady(e)).length }), [index]);
  const rows = useMemo(() => {
    const pool = filter === "ready" ? index.filter(isReady) : filter === "demand" ? index.filter((e) => !isReady(e)) : index;
    const by = (a: IndexEntry, b: IndexEntry) => (sort === "wait" ? (a.waitDays ?? 9e9) - (b.waitDays ?? 9e9) || (a.worstDays ?? 0) - (b.worstDays ?? 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    return [...pool].sort((a, b) => (filter === "all" && isReady(a) !== isReady(b) ? (isReady(a) ? -1 : 1) : by(a, b)));
  }, [index, filter, sort]);

  const intent = useMemo(() => (q.trim().split(/\s+/).length >= 3 ? parseIntent(q, intents) : null), [q, intents]);
  const results = useMemo(() => (intent ? [] : commandRows(index, stored, q, 8)), [index, stored, q, intent]);
  const typing = q.trim().length > 0;
  useEffect(() => setHi(0), [q]);
  useFlip(listRef, [filter, sort, typing]);

  const open = (href: string, el?: HTMLElement | null) => navigateWithTransition(() => router.push(href), el);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(results.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === "Escape") setQ("");
    if (e.key === "Enter") {
      if (intent) { hrefForIntent(q, intent, jev).then((h) => router.push(h)); return; }
      const r = results[hi];
      if (r) router.push(r.href);
    }
  };
  const enterHint = intent ? "plan it" : results[hi]?.kind === "investigate" ? "investigate" : "open";

  return (
    <main className="mx-auto max-w-[1180px] px-4 sm:px-6">
      <section className="pb-8 pt-8 sm:pt-14">
        <h1 className="max-w-[720px] text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">How long until your agent&apos;s users can connect?</h1>
        <p className="mt-3 max-w-[600px] text-[15px] text-ink-2">Registering an OAuth app takes minutes; approval takes days to months, and the permissions you ask for decide which. Name an app, or describe what your agent does.</p>

        <div className="relative mt-6 max-w-[760px]">
          <label className="panel flex h-14 items-center gap-3 !rounded-[14px] px-4 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-signal)_18%,transparent),var(--shadow-2)]">
            <span className="text-ink-3"><Icon name="search" size={18} /></span>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Gmail, xero.com, or what your agent does"
              aria-label="Name an app, or describe what your agent does"
              aria-controls="cmd-results"
              className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-3"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <span className="label hidden shrink-0 !normal-case sm:inline"><span className="kbd">↵</span> {typing ? enterHint : "search"}</span>
          </label>
          {intent && (
            <p className="mono mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2" aria-live="polite">
              <span className="text-ink-3">Read as</span>
              <span className="badge badge-curated">{intent.app || "?"}</span>
              {intent.caps.map((c) => <span key={c} className="badge">{intents.find((x) => x.slug === intent.slug)?.caps.find((k) => k.id === c)?.label || c}</span>)}
              {intent.profile.audience && <span className="badge">{intent.profile.audience === "team" ? "just my team" : "public users"}</span>}
              {intent.profile.scale && <span className="badge">{intent.profile.scale === "small" ? "≤ 100 users" : "100+ users"}</span>}
              {intent.profile.business === false && <span className="badge">no registered business</span>}
              <span className="text-ink-3">{intent.ready ? "· plan is instant" : "· will be investigated"}</span>
            </p>
          )}
        </div>
      </section>

      {!typing && <Shelf />}

      <section aria-label={typing ? "Results" : "All apps"}>
        {typing ? (
          <div id="cmd-results" ref={listRef} className="panel max-w-[760px] overflow-hidden p-1" role="listbox" aria-label="Results">
            {results.length === 0 && !intent && <p className="px-4 py-3 text-[14px] text-ink-3">No match.</p>}
            {intent && <p className="px-4 py-3 text-[14px] text-ink-2">Press <span className="kbd">↵</span> to plan {intent.app || "it"} for exactly this.</p>}
            {results.map((r, i) => (
              <Link key={r.href + i} href={r.href} data-flip={`r-${r.href}`} role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)}
                className={`row-link flex items-center gap-3 rounded-[10px] px-4 py-3 text-[15px]`} data-active={i === hi}>
                <CmdRowView r={r} active={i === hi} />
              </Link>
            ))}
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Apps</h2>
                <p className="mt-0.5 text-[13px] text-ink-3">Time until real users can connect, for the default permissions. Worst case after the slash.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Seg label="Show" value={filter} onChange={setFilter} options={[{ v: "ready", label: `Ready ${counts.ready}` }, { v: "demand", label: `On demand ${counts.demand}` }, { v: "all", label: "All" }]} />
                <Seg label="Sort" value={sort} onChange={setSort} options={[{ v: "wait", label: "Fastest" }, { v: "name", label: "A–Z" }]} />
              </div>
            </div>
            <div ref={listRef} className="panel overflow-hidden" role="table" aria-label="Apps">
              <div role="row" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_150px_92px_104px] gap-x-5 border-b rule bg-shade/50 px-5 py-2 md:grid">
                {["App", "What stands in the way", "Time to live", "Composio", "Guide"].map((h) => <span key={h} role="columnheader" className="label">{h}</span>)}
              </div>
              {rows.map((e) => <BoardRow key={e.slug} e={e} onOpen={open} />)}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">
              <span className="hidden md:inline"><span className="kbd">/</span> search · <span className="kbd">↑</span> <span className="kbd">↓</span> move · <span className="kbd">↵</span> open. </span>Managed = Composio already runs an approved OAuth app. Curated = hand-researched; Verified = agent-generated and passed every automatic check; Draft = agent-generated, a check failed.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function BoardRow({ e, onOpen }: { e: IndexEntry; onOpen: (href: string, el?: HTMLElement | null) => void }) {
  const ready = isReady(e);
  const href = hrefFor(e, "");
  const nameRef = useRef<HTMLSpanElement>(null);
  const hot = (e.waitDays ?? 0) >= 14;
  const composio = e.managed === "available" ? "Managed" : e.managed === "not_available" ? "Own app" : "—";
  const wait = ready ? (
    <span className="mono num whitespace-nowrap text-[13px]">
      <span className={hot ? "font-semibold text-signal-ink" : ""}>{e.wait}</span>
      {e.maxWait && e.maxWait !== e.wait && <span className="text-ink-3"> / {e.maxWait}</span>}
    </span>
  ) : <span className="mono text-[12.5px] text-ink-3">on demand</span>;
  return (
    <Link
      href={href}
      role="row"
      data-flip={e.slug}
      onClick={(ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; ev.preventDefault(); onOpen(href, nameRef.current); }}
      className="row-link grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b rule px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_150px_92px_104px] md:gap-x-5 md:px-5"
    >
      <span role="cell" className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span ref={nameRef} className={`clamp-1 text-[15px] font-medium ${ready ? "" : "text-ink-2"}`}>{e.name}</span>
          {ready && e.status && e.status !== "curated" && <StatusBadge status={e.status} className="md:hidden" />}
        </span>
        {e.category && <span className="hidden clamp-1 text-[12px] text-ink-3 md:block">{e.category}</span>}
      </span>
      {/* mobile: badge/wait on the right; desktop: own columns */}
      <span className="flex items-center justify-end gap-2 md:hidden">{wait}</span>
      <span role="cell" className="col-span-2 min-w-0 md:col-span-1">
        <span className="block clamp-1 text-[13.5px] text-ink-2 md:text-[14px]" title={ready ? e.gate : undefined}>{ready ? e.gate : "No guide yet: investigate it live (1–3 min)"}</span>
      </span>
      <span role="cell" className="hidden md:block">{wait}</span>
      <span role="cell" className={`hidden text-[13px] md:block ${e.managed === "not_available" ? "text-amber" : "text-ink-2"}`}>{composio}</span>
      <span role="cell" className="hidden md:block">{ready && e.status ? <StatusBadge status={e.status} /> : <span className="label">Live ↗</span>}</span>
    </Link>
  );
}
