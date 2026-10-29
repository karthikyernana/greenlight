"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { compressToEncodedURIComponent } from "lz-string";
import type { Guide, Step } from "@/lib/types";
import { activeSteps, defaultSelection, fmtDays, fmtEffort, schedule, startTheClock, TIER_META, topTier, difficulty } from "@/lib/plan";
import { toAgentPrompt, toEmailDraft, toMarkdown } from "@/lib/export";
import { AppLogo, ComposioBadge, DiffPill, EvidenceBadge, Md, OwnerBadge, TierPill } from "./bits";

export default function GuideView({ guide: g, initialNeed }: { guide: Guide; initialNeed?: string[] }) {
  const valid = (ids?: string[]) => (ids || []).filter((id) => g.capabilities.some((c) => c.id === id));
  const [sel, setSel] = useState<string[]>(() => (valid(initialNeed).length ? valid(initialNeed) : defaultSelection(g)));
  const [done, setDone] = useState<string[]>([]);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(`gl:progress:${g.slug}`) || "[]")); } catch {}
  }, [g.slug]);
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("need", sel.join(","));
    window.history.replaceState(null, "", u.toString());
  }, [sel]);

  const steps = useMemo(() => activeSteps(g, sel), [g, sel]);
  const sch = useMemo(() => schedule(steps), [steps]);
  const tier = topTier(g, sel);
  const diff = difficulty(tier);
  const clock = startTheClock(steps);
  const doneCount = steps.filter((s) => done.includes(s.id)).length;

  const toggleCap = (id: string) => setSel((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : [...s, id]));
  const toggleDone = (id: string) => {
    setDone((d) => {
      const n = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
      localStorage.setItem(`gl:progress:${g.slug}`, JSON.stringify(n));
      return n;
    });
  };
  const shareUrl = () => {
    const u = new URL(`/guide/${g.slug}`, window.location.origin);
    u.searchParams.set("need", sel.join(","));
    if (g.origin === "generated") u.hash = `g=${compressToEncodedURIComponent(JSON.stringify(g))}`;
    return u.toString();
  };
  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  return (
    <main className="mx-auto max-w-6xl px-5 pb-28">
      <div className="mb-6 flex items-center gap-2 text-sm text-ink-3">
        <Link href="/" className="hover:text-ink">Library</Link><span>/</span><span className="text-ink-2">{g.name}</span>
      </div>

      {/* Header */}
      <section className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <AppLogo slug={g.composio.slug || g.slug} name={g.name} size={44} />
            <h1 className="display text-[40px] leading-none sm:text-[52px]">{g.name}</h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            {g.origin === "curated"
              ? <span className="pill tone-go">Hand-researched · verified {g.verifiedAt}</span>
              : <span className="pill tone-info">✦ Agent-generated {g.verifiedAt} · not yet human-reviewed</span>}
            {g.appType && <span>{g.appType}</span>}
            {g.console && <a href={g.console} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-2 hover:text-ink">Developer console ↗</a>}
          </div>
          <p className="mt-5 max-w-3xl text-[18px] leading-relaxed text-ink">{g.summary}</p>
        </div>

        {/* Verdict */}
        <div className="card self-start p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-ink-3">For what you selected</span>
            <DiffPill label={diff.label} />
          </div>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-3">Time to full approval</div>
          <div className="display text-[44px] leading-none">{fmtDays(sch.daysMin, sch.daysMax)}</div>
          <div className="mt-1 text-sm text-ink-2">{TIER_META[tier].blurb}.</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-4 text-sm">
            <div><div className="text-[11px] uppercase tracking-wider text-ink-3">Hands-on effort</div><div className="font-medium">{fmtEffort(sch.activeMinutes)}</div></div>
            <div><div className="text-[11px] uppercase tracking-wider text-ink-3">Agent can do</div><div className="font-medium">{steps.filter((s) => s.owner !== "you").length} of {steps.length} steps</div></div>
          </div>
          <div className="mt-4 border-t hairline pt-4">
            <ComposioBadge managed={g.composio.managed} />
            <p className="mt-2 text-[13px] leading-snug text-ink-2">{g.composio.note}</p>
          </div>
        </div>
      </section>

      {/* Capability chips */}
      <section className="mt-10">
        <h2 className="text-sm font-medium text-ink-2">What does your agent need to do? <span className="text-ink-3">The wait and steps recalculate as you pick.</span></h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {g.capabilities.map((c) => {
            const on = sel.includes(c.id);
            return (
              <button key={c.id} onClick={() => toggleCap(c.id)} title={`${c.why}${c.scopes.length ? `\nScopes: ${c.scopes.join(" ")}` : ""}`}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left text-sm transition ${on ? "border-ink bg-ink text-white" : "hairline bg-card text-ink-2 hover:border-ink-3"}`}>
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${on ? "border-white bg-white text-ink" : "border-line-2"}`}>{on ? "✓" : ""}</span>
                <span className="font-medium">{c.label}</span>
                <TierPill tier={c.tier} />
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
          {g.capabilities.filter((c) => sel.includes(c.id)).map((c) => (
            <span key={c.id}><b className="font-medium text-ink-2">{c.label}:</b> {c.why}{c.scopes.length ? <> · <code className="font-mono">{c.scopes.slice(0, 3).join(" ")}{c.scopes.length > 3 ? " …" : ""}</code></> : null}</span>
          ))}
        </div>
      </section>

      {/* Two plans */}
      <section className="mt-8 grid gap-3 md:grid-cols-2">
        <div className="card border-l-4 !border-l-go p-5">
          <div className="flex items-center gap-2"><span className="pill tone-go">Plan A</span><h3 className="font-semibold">Launch today</h3></div>
          <ul className="mt-3 space-y-2 text-[15px] leading-snug">
            {g.launchToday.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-go" /><Md text={x} /></li>)}
          </ul>
        </div>
        <div className="card border-l-4 !border-l-wait p-5">
          <div className="flex items-center gap-2"><span className="pill tone-wait">Plan B</span><h3 className="font-semibold">Full approval: start the clock today</h3></div>
          {clock.length ? (
            <ul className="mt-3 space-y-2 text-[15px] leading-snug">
              {clock.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3">
                  <span className="flex gap-2">
                    <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${s.startsToday ? "bg-wait" : "bg-line-2"}`} />
                    <span>{s.title} <span className={`ml-1 text-[11px] font-medium uppercase tracking-wide ${s.startsToday ? "text-go" : "text-ink-3"}`}>{s.startsToday ? "start today" : `then, ~day ${Math.round(s.startMax)}`}</span></span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-wait">{fmtDays(s.waitDays[0], s.waitDays[1])}</span>
                </li>
              ))}
              <li className="pt-1 text-[13px] text-ink-3">Every wait above runs on the provider's clock. Start the first ones now and build while you wait.</li>
            </ul>
          ) : <p className="mt-3 text-[15px] text-ink-2">Nothing to wait on for what you selected. Everything here is hands-on work you control.</p>}
        </div>
      </section>

      {/* Timeline */}
      <Timeline items={sch.items} max={Math.max(sch.daysMax, 1)} />

      {/* Steps */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="display text-3xl">Steps</h2>
          <span className="text-sm text-ink-3">{doneCount}/{steps.length} done · progress saved on this device</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-go transition-all" style={{ width: `${(doneCount / Math.max(1, steps.length)) * 100}%` }} /></div>
        <ol className="mt-4 space-y-2.5">
          {steps.map((s, i) => <StepRow key={s.id} s={s} i={i} done={done.includes(s.id)} onToggle={() => toggleDone(s.id)} sources={g.sources} />)}
        </ol>
      </section>

      {/* Rejections & blockers */}
      <section className="mt-10 grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold">Common rejection reasons</h3>
          <ul className="mt-3 space-y-2 text-[15px] leading-snug">
            {g.rejections.map((x, i) => <li key={i} className="flex gap-2"><span className="text-stop">✕</span><Md text={x} /></li>)}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold">If you're blocked</h3>
          <div className="mt-2 divide-y divide-line">
            {g.blockers.map((b, i) => (
              <details key={i} className="py-2.5" open={i === 0}>
                <summary className="flex items-start justify-between gap-3 text-[15px] font-medium"><span>{b.problem}</span><span className="text-ink-3">+</span></summary>
                <p className="mt-1.5 text-[14px] leading-snug text-ink-2"><Md text={b.fix} /></p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Evidence */}
      <section className="mt-10">
        <h2 className="display text-3xl">What we know, and how we know it</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="card p-5">
            <div className="flex items-center gap-2"><EvidenceBadge e="tested" /><span className="text-sm text-ink-3">live public probes</span></div>
            <ul className="mt-3 space-y-3 text-[13.5px]">
              {g.probes.map((p, i) => (
                <li key={i}>
                  <div className="flex items-center gap-1.5 font-medium"><span className={p.ok ? "text-go" : "text-wait"}>{p.ok ? "●" : "○"}</span>{p.label}</div>
                  <div className="text-ink-2">{p.result}</div>
                  <a href={p.url} target="_blank" rel="noreferrer" className="break-all font-mono text-[11px] text-ink-3 hover:text-ink">{p.url}</a> <span className="text-[11px] text-ink-3">· {p.at}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">Unauthenticated checks only: discovery documents, fake-client authorize calls, Composio's public directory. We never created apps or signed in.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-2"><EvidenceBadge e="uncertain" /><span className="text-sm text-ink-3">couldn't confirm</span></div>
            <ul className="mt-3 space-y-2 text-[14px] leading-snug text-ink-2">
              {(g.uncertain.length ? g.uncertain : ["Nothing flagged."]).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-2"><EvidenceBadge e="sourced" /><span className="text-sm text-ink-3">{g.sources.length} sources</span></div>
            <ol className="mt-3 space-y-1.5 text-[13.5px]">
              {g.sources.map((s, i) => (
                <li key={i} id={`src-${i}`} className="flex gap-2"><span className="w-5 shrink-0 font-mono text-ink-3">{i + 1}</span><a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.title}</a></li>
              ))}
            </ol>
          </div>
        </div>
        {g.model && <p className="mt-3 text-xs text-ink-3">Generated with {g.model}. Agent-written guides can be wrong. Check anything marked Uncertain against the sources.</p>}
      </section>

      {/* Action bar */}
      <div className="fixed inset-x-0 bottom-4 z-30 px-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-1.5 rounded-2xl border hairline bg-ink/95 p-1.5 text-[13px] text-white shadow-2xl backdrop-blur">
          <button onClick={() => copy(shareUrl(), "Share link copied")} className="rounded-xl px-3 py-2 hover:bg-white/10">🔗 Copy link</button>
          <button onClick={() => copy(toMarkdown(g, sel, shareUrl()), "Markdown copied")} className="rounded-xl px-3 py-2 hover:bg-white/10">Copy as Markdown</button>
          <button onClick={() => copy(toAgentPrompt(g, sel), "Agent prompt copied: paste into Claude Code / Cursor")} className="rounded-xl bg-go px-3 py-2 font-medium hover:brightness-110">⚙ Hand off to a coding agent</button>
          <button onClick={() => copy(toEmailDraft(g), "Email draft copied")} className="rounded-xl px-3 py-2 hover:bg-white/10">✉ Draft email to {g.name.split(" ")[0]}</button>
        </div>
        {toast && <div className="mx-auto mt-2 w-fit rounded-full bg-go px-4 py-1.5 text-[13px] text-white rise">{toast}</div>}
      </div>
    </main>
  );
}

function StepRow({ s, i, done, onToggle, sources }: { s: Step; i: number; done: boolean; onToggle: () => void; sources: Guide["sources"] }) {
  return (
    <li className={`card p-4 transition sm:p-5 ${done ? "opacity-60" : ""}`}>
      <div className="flex gap-4">
        <button onClick={onToggle} aria-label={done ? "Mark not done" : "Mark done"}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs transition ${done ? "border-go bg-go text-white" : "border-line-2 hover:border-ink-3"}`}>
          {done ? "✓" : <span className="font-mono text-ink-3">{i + 1}</span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`text-[16px] font-semibold ${done ? "line-through" : ""}`}>{s.title}</h3>
            <OwnerBadge o={s.owner} />
            {s.waitDays[1] > 0 && <span className="pill tone-wait">⏳ {fmtDays(s.waitDays[0], s.waitDays[1])} wait</span>}
            {s.cost && <span className="pill tone-info">$ {s.cost}</span>}
          </div>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2"><Md text={s.detail} /></p>
          {(s.agent || s.human) && (
            <div className="mt-3 grid gap-2 text-[13.5px] sm:grid-cols-2">
              {s.agent && <div className="rounded-lg bg-go-bg/60 px-3 py-2"><span className="font-medium text-go">Agent: </span>{s.agent}</div>}
              {s.human && <div className="rounded-lg bg-paper px-3 py-2"><span className="font-medium">You: </span>{s.human}</div>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            <EvidenceBadge e={s.evidence} small />
            <span>~{fmtEffort(s.activeMinutes)} hands-on</span>
            {s.sources.map((k) => sources[k] && <a key={k} href={sources[k].url} target="_blank" rel="noreferrer" className="hover:text-ink">[{k + 1}] {sources[k].title.slice(0, 48)}</a>)}
            {s.link && <a href={s.link} target="_blank" rel="noreferrer" className="font-medium text-ink-2 hover:text-ink">Open ↗</a>}
          </div>
        </div>
      </div>
    </li>
  );
}

function Timeline({ items, max }: { items: (Step & { startMax: number; endMax: number })[]; max: number }) {
  const pct = (d: number) => `${Math.min(100, (d / max) * 100)}%`;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  return (
    <section className="card mt-8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Critical path <span className="font-normal text-ink-3">(worst case, parallel where possible)</span></h3>
        <div className="flex items-center gap-4 text-xs text-ink-3">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-ink" /> your effort</span>
          <span className="flex items-center gap-1.5"><span className="stripes inline-block h-2.5 w-4 rounded-sm" /> waiting on provider</span>
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        {items.map((s) => {
          const activeDays = s.activeMinutes / 360;
          return (
            <div key={s.id} className="grid grid-cols-[minmax(110px,34%)_1fr] items-center gap-3 text-[13px]">
              <div className="truncate text-ink-2" title={s.title}>{s.title}</div>
              <div className="relative h-4 rounded bg-paper">
                <div className="absolute top-0 flex h-4" style={{ left: pct(s.startMax), width: `calc(${pct(s.endMax - s.startMax)} + 3px)` }}>
                  <div className="h-4 min-w-[3px] rounded-l bg-ink" style={{ width: `${Math.max(3, (activeDays / Math.max(0.0001, s.endMax - s.startMax)) * 100)}%` }} />
                  {s.waitDays[1] > 0 && <div className="stripes h-4 flex-1 rounded-r" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(110px,34%)_1fr] gap-3 text-[11px] text-ink-3">
        <div />
        <div className="flex justify-between font-mono">{ticks.map((t, i) => <span key={i}>{t < 1 ? (i === 0 ? "day 0" : `${Math.round(t * 6)}h`) : `${Math.round(t)}d`}</span>)}</div>
      </div>
    </section>
  );
}
