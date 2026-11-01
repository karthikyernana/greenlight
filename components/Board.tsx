"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { IndexEntry } from "@/lib/types";
import { exact, hrefFor, match } from "@/lib/search";
import { parseIntent, intentHref, type IntentIndex } from "@/lib/intent";

type Sort = "wait" | "name";

/** Landing = one command bar + the departure board. Typing filters live; Enter opens or investigates. */
export default function Board({ index, intents }: { index: IndexEntry[]; intents: IntentIndex[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("wait");
  const [dir, setDir] = useState<1 | -1>(1);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(t.tagName)) { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sorted = useMemo(() => {
    const ready = index.filter((e) => e.curated || e.generated);
    const rest = index.filter((e) => !(e.curated || e.generated));
    const by = (a: IndexEntry, b: IndexEntry) =>
      sort === "wait" ? dir * ((a.waitDays ?? 0) - (b.waitDays ?? 0) || (a.worstDays ?? 0) - (b.worstDays ?? 0)) : dir * a.name.localeCompare(b.name);
    return [...ready.sort(by), ...rest.sort((a, b) => a.name.localeCompare(b.name))];
  }, [index, sort, dir]);

  const intent = useMemo(() => (q.trim().split(/\s+/).length >= 3 ? parseIntent(q, intents) : null), [q, intents]);
  const rows = useMemo(() => (intent ? (intent.slug ? sorted.filter((e) => e.slug === intent.slug) : []) : q.trim() ? match(sorted, q) : sorted), [sorted, q, intent]);
  const hit = exact(index, q);
  const live = intent ? "" : q.trim() && !hit ? q.trim() : "";
  const total = rows.length + (live ? 1 : 0);
  const readyCount = index.filter((e) => e.curated || e.generated).length;

  useEffect(() => setHi(0), [q]);
  // If nothing matches, Enter means "investigate it".
  const target = (i: number) => (live && (i === rows.length || rows.length === 0) ? hrefFor(null, q) : rows[i] ? hrefFor(rows[i], q) : null);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(total - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === "Escape") setQ("");
    if (e.key === "Enter") {
      if (intent) { router.push(intentHref(intent)); return; }
      const href = target(rows.length ? hi : 0);
      if (href) router.push(href);
    }
  };

  const head = (key: Sort, label: string, cls = "") => (
    <button
      onClick={() => (sort === key ? setDir((d) => (d === 1 ? -1 : 1)) : (setSort(key), setDir(1)))}
      className={`label flex items-center gap-1 hover:text-ink ${sort === key ? "!text-ink" : ""} ${cls}`}
      aria-label={`Sort by ${label}`}
    >
      {label} <span aria-hidden>{sort === key ? (dir === 1 ? "↑" : "↓") : ""}</span>
    </button>
  );

  return (
    <main className="mx-auto max-w-[1240px] px-4 sm:px-6">
      <section className="pt-10 pb-6 sm:pt-14">
        <h1 className="max-w-[760px] text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[44px]">
          How long until your agent&apos;s users can connect?
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] text-ink-2">
          Registering an OAuth app takes minutes. Approval takes days to months, and the permissions you ask for decide which. Name an app, or say what your agent does.
        </p>
        <label className="mt-7 flex h-14 items-center gap-3 border border-ink bg-surface px-4 focus-within:shadow-[0_0_0_3px_var(--color-signal)]">
          <span className="mono text-[18px] text-signal-ink" aria-hidden>→</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Gmail, or “triages my users’ Gmail and drafts replies”"
            aria-label="Name an app, or describe what your agent does"
            className="min-w-0 flex-1 bg-transparent text-[18px] outline-none placeholder:text-ink-3"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="label hidden !normal-case sm:inline">
            <span className="kbd">↵</span> {intent ? "plan it" : live && !rows.length ? "investigate" : "open"}
          </span>
        </label>
        {intent && (
          <p className="mono mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-2 fill-in" aria-live="polite">
            <span className="text-ink-3">Read as</span>
            <span className="border border-ink px-1.5">{intent.app || "?"}</span>
            {intent.caps.map((c) => <span key={c} className="border rule px-1.5">{intents.find((x) => x.slug === intent.slug)?.caps.find((k) => k.id === c)?.label || c}</span>)}
            {intent.profile.audience && <span className="border rule px-1.5">{intent.profile.audience === "team" ? "just my team" : "public users"}</span>}
            {intent.profile.scale && <span className="border rule px-1.5">{intent.profile.scale === "small" ? "up to 100 users" : "100+ users"}</span>}
            {intent.profile.business === false && <span className="border rule px-1.5">no registered business</span>}
            <span className="text-ink-3">{intent.ready ? "· plan is instant" : "· will be investigated"}</span>
          </p>
        )}
      </section>

      <section aria-label="Departure board">
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <span className="label !text-ink">Departures · <span className="num">{readyCount}</span> guides ready · <span className="num">{index.length - readyCount}</span> on demand</span>
          <span className="label hidden sm:inline">Time to live: default needs / worst case · curated = hand-researched · generated = agent, not human-reviewed</span>
        </div>
        <div role="table" className="w-full">
          <div role="row" className="grid grid-cols-[1fr_auto] gap-x-4 border-b rule py-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_150px_96px_88px]">
            <div role="columnheader">{head("name", "App")}</div>
            <div role="columnheader" className="label hidden sm:block">Gate</div>
            <div role="columnheader">{head("wait", "Time to live", "justify-end sm:justify-start")}</div>
            <div role="columnheader" className="label hidden sm:block">Composio</div>
            <div role="columnheader" className="label hidden sm:block">Guide</div>
          </div>
          {rows.map((e, i) => {
            const ready = e.curated || e.generated;
            return (
              <Row
                key={e.slug}
                active={i === hi}
                dim={!ready}
                href={hrefFor(e, q)}
                onHover={() => setHi(i)}
                cells={[
                  <span key="a" className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    {e.category && <span className="label hidden truncate !text-[10px] lg:inline">{e.category}</span>}
                    <span className="mono truncate text-[11px] text-ink-3 sm:hidden">
                      {ready ? e.gate : "investigate live"}{e.managed === "available" ? " · MANAGED" : e.managed === "not_available" ? " · BYO APP" : ""}
                    </span>
                  </span>,
                  <span key="b" className="truncate text-ink-2">{ready ? e.gate : "—"}</span>,
                  <span key="c" className="mono num whitespace-nowrap text-[13px]">
                    {ready ? (
                      <>
                        <span className={(e.waitDays ?? 0) >= 14 ? "text-signal-ink font-semibold" : ""}>{e.wait?.toUpperCase()}</span>
                        {e.maxWait && e.maxWait !== e.wait && <span className="text-ink-3"> / {e.maxWait.toUpperCase()}</span>}
                      </>
                    ) : (
                      <span className="text-ink-3">ON DEMAND</span>
                    )}
                  </span>,
                  <span key="d" className="mono text-[12px]">{e.managed === "available" ? "MANAGED" : e.managed === "not_available" ? <span className="text-amber">BYO APP</span> : "—"}</span>,
                  <span key="e" className="mono text-[12px] text-ink-3">{e.curated ? "CURATED" : e.generated ? "GENERATED" : "LIVE ↗"}</span>,
                ]}
              />
            );
          })}
          {live && (
            <Row
              active={hi === rows.length || rows.length === 0}
              href={hrefFor(null, q)}
              onHover={() => setHi(rows.length)}
              cells={[
                <span key="a" className="flex min-w-0 items-center gap-2"><span className="text-signal-ink" aria-hidden>+</span><span className="truncate">Investigate <b className="font-semibold">“{live}”</b></span></span>,
                <span key="b" className="text-ink-3">Agents read its docs, test its endpoints, check every quote</span>,
                <span key="c" className="mono text-ink-3">1–3 min</span>,
                <span key="d" className="mono text-ink-3">—</span>,
                <span key="e" className="mono text-signal-ink">RUN ↗</span>,
              ]}
            />
          )}
        </div>
        <p className="label mt-4 !normal-case !tracking-normal">
          <span className="kbd">/</span> search · <span className="kbd">↑</span><span className="kbd">↓</span> move · <span className="kbd">↵</span> open. Managed: Composio already runs an approved OAuth app for it. Composio directory read 2026-10-30. Guides checked 2026-11-01.
        </p>
      </section>
    </main>
  );
}

function Row({ cells, href, active, dim, onHover }: { cells: React.ReactNode[]; href: string; active: boolean; dim?: boolean; onHover: () => void }) {
  return (
    <Link
      href={href}
      role="row"
      onMouseEnter={onHover}
      className={`grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-l-2 rule py-2.5 pl-2 pr-1 text-[14px] transition-colors sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_150px_96px_88px] ${
        active ? "!border-l-signal bg-surface" : "border-l-transparent hover:bg-surface"
      } ${dim ? "text-ink-2" : ""}`}
    >
      <span role="cell" className="min-w-0">{cells[0]}</span>
      <span role="cell" className="hidden min-w-0 sm:block">{cells[1]}</span>
      <span role="cell" className="text-right sm:text-left">{cells[2]}</span>
      <span role="cell" className="hidden sm:block">{cells[3]}</span>
      <span role="cell" className="hidden sm:block">{cells[4]}</span>
    </Link>
  );
}
