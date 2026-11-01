"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Guide, Step, Evidence } from "@/lib/types";
import { activeSteps, criticalPath, defaultSelection, headline, startToday, TIER_META, verdict, fmtEffort } from "@/lib/plan";
import { cleanSelection, guideHref } from "@/lib/urlstate";
import { COMPOSIO_CALLBACK } from "@/lib/kit";
import Runway from "./Runway";
import SetupKit, { copyText } from "./SetupKit";

export type LiveRow = { id: string; label: string; status: "pending" | "running" | "done" | "warn"; detail?: string; ms?: number };
export type Live = { rows: LiveRow[]; state: "running" | "done" | "error"; error?: { code?: string; message: string }; elapsed: number; onRetry?: () => void };
export type PartialGuide = Partial<Guide> & { slug: string; name: string };

const isFull = (g: PartialGuide): g is Guide => !!(g.capabilities?.length && g.steps?.length && g.summary !== undefined);

export default function GuideView({ guide, initialNeed, live }: { guide: PartialGuide; initialNeed?: string[]; live?: Live }) {
  const full = isFull(guide);
  const [sel, setSel] = useState<string[]>(() => (full ? cleanSelection(guide, initialNeed) : []));
  const [done, setDone] = useState<string[]>([]);
  const [kit, setKit] = useState(false);
  const [toast, setToast] = useState("");

  // when a live guide completes, adopt its defaults
  useEffect(() => {
    if (full && !sel.length) setSel(cleanSelection(guide, initialNeed));
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(`gl:progress:${guide.slug}`) || "[]")); } catch {}
  }, [guide.slug]);

  useEffect(() => {
    if (!full || !sel.length || live?.state === "running") return;
    const href = guideHref(guide, sel, { embed: guide.origin === "generated" });
    window.history.replaceState(null, "", href);
  }, [sel, full, guide, live?.state]);

  const shareUrl = () => (full ? window.location.origin + guideHref(guide, sel, { embed: guide.origin === "generated" }) : window.location.href);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };
  const toggleCap = (id: string) => setSel((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : [...s, id]));
  const toggleDone = (id: string) =>
    setDone((d) => {
      const n = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
      localStorage.setItem(`gl:progress:${guide.slug}`, JSON.stringify(n));
      return n;
    });
  const pick = useCallback((id: string) => {
    const el = document.getElementById(`step-${id}`) as HTMLDetailsElement | null;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const steps = useMemo(() => (full && sel.length ? activeSteps(guide, sel) : []), [full, guide, sel]);
  const h = full && sel.length ? headline(guide, sel) : null;
  const v = full && sel.length ? verdict(guide, sel) : null;
  const crit = useMemo(() => new Set(criticalPath(steps)), [steps]);
  const today = useMemo(() => startToday(steps), [steps]);
  const agentCan = steps.filter((s) => s.owner !== "you").length;
  const generated = guide.origin === "generated";
  const stopped = !full && live?.state === "error";
  const dcr = (guide.probes || []).some((p) => /dynamic client registration/i.test(p.result));

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-28 sm:px-6 lg:pb-16">
      {/* meta + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b rule py-3">
        <p className="label flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{guide.category || "Guide"}</span>
          <span aria-hidden>·</span>
          {generated ? <span className="text-signal-ink">Agent-generated · not human-reviewed</span> : <span className="!text-ink">Hand-researched</span>}
          {guide.verifiedAt && <><span aria-hidden>·</span><span className="num">{generated ? "Generated" : "Verified"} {guide.verifiedAt}</span></>}
          {guide.checks && guide.checks.length > 0 && <><span aria-hidden>·</span><span className="num">Spot-checked {guide.checks[0].at}</span></>}
        </p>
        <Actions disabled={!full} onCopy={async () => { await copyText(shareUrl()); flash("Link copied: it keeps your selection"); }} onKit={() => setKit(true)} className="hidden lg:flex" />
      </div>

      {/* name + verdict */}
      <section className="pt-6 pb-5">
        <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[52px]">{guide.name}</h1>
        {v ? (
          <p className="mt-3 max-w-[920px] text-[19px] leading-snug tracking-[-0.01em] sm:text-[23px]" aria-live="polite">
            <span className="font-semibold">{v.lead}</span>{" "}
            {v.pole && <span className="text-signal-ink">{v.pole}</span>}
          </p>
        ) : stopped ? (
          <p className="mt-3 max-w-[920px] text-[19px] leading-snug sm:text-[23px]"><span className="font-semibold">No runway yet:</span> <span className="text-ink-2">the research step didn&apos;t run. What the agent could check live is below.</span></p>
        ) : (
          <div className="mt-4 space-y-2" aria-hidden><div className="skel h-6 w-[min(640px,90%)]" /><div className="skel h-6 w-[min(380px,60%)]" /></div>
        )}
      </section>

      {live && <AgentLog live={live} />}

      <FastLane g={guide} />
      {dcr && (
        <p className="-mt-2 mb-5 flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink-2 fill-in">
          <span className="mono border border-ink px-1.5 py-0.5 text-[10.5px] uppercase text-ink">Agent lane</span>
          Its OAuth server advertises dynamic client registration (RFC 7591), so an agent may be able to register a client by API instead of a console. Probed, not exercised.
        </p>
      )}

      {/* the three numbers */}
      <section className="grid grid-cols-2 border-y border-ink sm:grid-cols-4" aria-label="Headline numbers">
        <Num cls="pr-3" label="Difficulty" stopped={stopped} value={h?.difficulty.label} sub={h ? TIER_META[h.tier].label : undefined} />
        <Num cls="border-l pl-4" label="Hands-on effort" stopped={stopped} value={h?.effort} mono sub={h ? `${steps.length} steps` : undefined} />
        <Num cls="border-t sm:border-t-0 sm:border-l sm:pl-4" label="Wait for approval" stopped={stopped} value={h?.wait} mono hot={!!h && h.sch.daysMax >= 14} sub={h ? (h.sch.daysMax >= 1 ? "provider-side, worst case" : "no review queue") : undefined} />
        <Num cls="border-l border-t pl-4 sm:border-t-0" label="Agent can do" stopped={stopped} value={h ? `${agentCan}/${steps.length}` : undefined} mono sub={h ? "steps, fully or partly" : undefined} />
      </section>

      {/* needs → runway */}
      <section className="pt-5" aria-label="What your agent needs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="label">What your agent needs <span className="normal-case tracking-normal">— the scopes decide the wait</span></p>
          {full && <button onClick={() => setSel(defaultSelection(guide))} className="label hover:text-ink">Reset</button>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {full
            ? guide.capabilities.map((c) => {
                const on = sel.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCap(c.id)}
                    aria-pressed={on}
                    title={`${TIER_META[c.tier].label}: ${c.why}${c.scopes.length ? `\nScopes: ${c.scopes.join(", ")}` : ""}`}
                    className={`flex items-center gap-2 border px-2.5 py-1.5 text-left text-[13.5px] transition-colors ${on ? "border-ink bg-surface text-ink" : "rule text-ink-3 hover:border-ink-2 hover:text-ink-2"}`}
                  >
                    <span className={`inline-block h-2.5 w-2.5 border ${on ? "border-ink bg-ink" : "border-ink-3"}`} aria-hidden />
                    <span>{c.label}</span>
                    <span className={`mono text-[10px] uppercase tracking-[0.04em] ${on && ["restricted", "partner"].includes(c.tier) ? "text-signal-ink" : "text-ink-3"}`}>{TIER_META[c.tier].label}</span>
                  </button>
                );
              })
            : stopped ? <span className="text-[13.5px] text-ink-3">Capabilities and scopes come from the research step.</span>
            : [0, 1, 2].map((i) => <span key={i} className="skel h-8 w-40" aria-hidden />)}
        </div>
        <div className="mt-4">
          {full && steps.length ? (
            <Runway key={sel.join(",")} steps={steps} onPick={pick} />
          ) : stopped ? (
            <div className="flex h-[118px] items-center justify-center border border-dashed border-rule-2 px-4 text-center text-[13.5px] text-ink-3">The runway is built from researched steps. Add a model key, or open a ready guide from the board.</div>
          ) : (
            <div className="skel h-[118px] w-full" aria-hidden />
          )}
        </div>
        {today.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
            <span className="mono bg-signal px-1.5 py-0.5 text-[11px] font-semibold uppercase text-ink">Start today</span>
            {today.map((s, i) => (
              <button key={s.id} onClick={() => pick(s.id)} className="text-ink underline decoration-rule-2 underline-offset-4 hover:decoration-ink">
                {s.title}{i < today.length - 1 ? "," : ""}
              </button>
            ))}
            <span className="text-ink-3">— these waits don&apos;t depend on anything else.</span>
          </p>
        )}
      </section>

      {/* checklist + evidence */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Steps">
          <div className="flex items-baseline justify-between border-b border-ink pb-2">
            <p className="label !text-ink">Steps</p>
            {full && <p className="label num">{steps.filter((s) => done.includes(s.id)).length}/{steps.length} done · saved on this device</p>}
          </div>
          {full ? (
            <ol>
              {steps.map((s, i) => (
                <StepRow key={s.id} s={s} n={i + 1} g={guide} done={done.includes(s.id)} critical={crit.has(s.id)} onDone={() => toggleDone(s.id)} />
              ))}
            </ol>
          ) : stopped ? (
            <p className="pt-3 text-[13.5px] text-ink-3">No steps without research.</p>
          ) : (
            <div className="space-y-3 pt-3" aria-hidden>{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-9 w-full" />)}</div>
          )}
          {full && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
              <EvLegend e="tested" /> <EvLegend e="sourced" /> <EvLegend e="uncertain" />
            </p>
          )}
        </section>
        <EvidencePanel g={guide} />
      </div>

      <Actions disabled={!full} onCopy={async () => { await copyText(shareUrl()); flash("Link copied"); }} onKit={() => setKit(true)} className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink bg-paper p-3 lg:hidden" stretch />

      {kit && full && <SetupKit g={guide} sel={sel} shareUrl={shareUrl()} onClose={() => setKit(false)} />}
      {toast && <div role="status" className="mono fixed bottom-20 left-1/2 z-50 -translate-x-1/2 bg-ink px-3 py-2 text-[12px] text-white lg:bottom-6">{toast}</div>}
    </main>
  );
}

function Actions({ onCopy, onKit, disabled, className = "", stretch }: { onCopy: () => void; onKit: () => void; disabled?: boolean; className?: string; stretch?: boolean }) {
  return (
    <div className={`items-center gap-2 ${className}`}>
      <button disabled={disabled} onClick={onCopy} className={`h-10 border border-ink px-4 text-[14px] hover:bg-surface disabled:opacity-40 ${stretch ? "flex-1" : ""}`}>Copy link</button>
      <button disabled={disabled} onClick={onKit} className={`h-10 border border-ink bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2 disabled:opacity-40 ${stretch ? "flex-[1.4]" : ""}`}>
        Get setup kit <span className="mono ml-1 text-signal" aria-hidden>→</span>
      </button>
    </div>
  );
}

function Num({ label, value, sub, mono, hot, cls = "", stopped }: { label: string; value?: string; sub?: string; mono?: boolean; hot?: boolean; cls?: string; stopped?: boolean }) {
  return (
    <div className={`rule py-3 pr-3 ${cls}`}>
      <p className="label">{label}</p>
      {value ? (
        <p key={value} className={`flap mt-1 text-[28px] font-semibold leading-none tracking-[-0.02em] sm:text-[34px] ${mono ? "mono num !tracking-[-0.04em]" : ""} ${hot ? "text-signal-ink" : ""}`}>{value}</p>
      ) : stopped ? (
        <p className="mono mt-1 text-[28px] leading-none text-ink-3 sm:text-[34px]">—</p>
      ) : (
        <div className="skel mt-2 h-8 w-24" aria-hidden />
      )}
      {sub && <p className="mt-1 text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}

function FastLane({ g }: { g: PartialGuide }) {
  const c = g.composio;
  if (!c) return <div className="skel mb-5 h-12 w-full" aria-hidden />;
  const link = c.slug ? `https://docs.composio.dev/toolkits/${c.slug}` : undefined;
  if (c.managed === "available")
    return (
      <section className="mb-5 grid grid-cols-[auto_1fr] items-start gap-x-3 border border-ink bg-surface p-3 fill-in sm:grid-cols-[auto_1fr_auto]" aria-label="Composio fast lane">
        <span className="mono mt-0.5 bg-signal px-1.5 py-0.5 text-[11px] font-semibold uppercase text-ink">Fast lane</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Skip all of this: Composio already runs an approved {g.name.replace(/\s*\(.*\)/, "")} OAuth app. Your users can connect today.</p>
          {c.note && <p className="mt-0.5 text-[13px] text-ink-2">Trade-off: {c.note}</p>}
        </div>
        {link && <a href={link} target="_blank" rel="noreferrer" className="mono col-start-2 mt-1 text-[12px] underline underline-offset-4 sm:col-start-3 sm:mt-0.5">Toolkit ↗</a>}
      </section>
    );
  if (c.managed === "not_available")
    return (
      <section className="mb-5 grid grid-cols-[auto_1fr] items-start gap-x-3 border border-amber/60 p-3 fill-in" aria-label="No Composio fast lane">
        <span className="mono mt-0.5 border border-amber px-1.5 py-0.5 text-[11px] font-semibold uppercase text-amber">No fast lane</span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Composio needs your own {g.name.replace(/\s*\(.*\)/, "")} app here, so this runway is the only route.</p>
          <p className="mt-0.5 break-all text-[13px] text-ink-2">{c.note} Callback to register: <span className="mono">{COMPOSIO_CALLBACK}</span></p>
        </div>
      </section>
    );
  return (
    <section className="mb-5 border rule p-3 text-[13.5px] text-ink-2 fill-in">
      <span className="mono mr-2 text-[11px] uppercase text-ink-3">Composio</span>{c.note || "Not found in Composio's toolkit directory under this name."}
    </section>
  );
}

function AgentLog({ live }: { live: Live }) {
  return (
    <section className="mb-5 border border-ink bg-ink p-3 text-white" aria-label="Agent log" aria-live="polite">
      <div className="flex items-center justify-between">
        <p className="mono text-[11px] uppercase tracking-[0.06em] text-white/70">
          {live.state === "running" ? <><span className="blink text-signal">●</span> Agent investigating</> : live.state === "done" ? "Agent finished" : "Agent stopped"}
        </p>
        <p className="mono num text-[11px] text-white/70">{live.elapsed}s</p>
      </div>
      <ol className="mt-2 space-y-1">
        {live.rows.map((r) => (
          <li key={r.id} className="mono grid grid-cols-[18px_minmax(0,1fr)_auto] gap-x-2 text-[12.5px] leading-snug">
            <span className={r.status === "done" ? "text-white" : r.status === "warn" ? "text-amber-fill" : r.status === "running" ? "text-signal blink" : "text-white/35"}>
              {r.status === "done" ? "✓" : r.status === "warn" ? "!" : r.status === "running" ? "›" : "·"}
            </span>
            <span className={`min-w-0 ${r.status === "pending" ? "text-white/40" : ""}`}>
              {r.label}
              {r.detail && <span className="block break-words text-white/60">{r.detail}</span>}
            </span>
            <span className="num text-white/50">{r.ms ? `${(r.ms / 1000).toFixed(1)}s` : ""}</span>
          </li>
        ))}
      </ol>
      {live.error && (
        <div className="mt-3 border-t border-white/20 pt-3">
          <p className="text-[14px]">{live.error.message}</p>
          {live.error.code === "no_model" && (
            <p className="mt-1 text-[13px] text-white/70">To turn on research: add <span className="mono text-white">GEMINI_API_KEY</span> (or <span className="mono text-white">GROQ_API_KEY</span> / <span className="mono text-white">OPENROUTER_API_KEY</span>) to the Vercel project and redeploy. Ready guides on the board work without it.</p>
          )}
          {live.onRetry && <button onClick={live.onRetry} className="mono mt-3 border border-white px-3 py-1 text-[12px] uppercase hover:bg-white hover:text-ink">Retry</button>}
        </div>
      )}
    </section>
  );
}

const EV_LABEL: Record<Evidence, string> = { tested: "Tested: live public probe", sourced: "Sourced: cited document", uncertain: "Uncertain: estimate, not confirmed" };
function Ev({ e }: { e: Evidence }) {
  return <span className={`ev ev-${e}`} role="img" aria-label={EV_LABEL[e]} title={EV_LABEL[e]} />;
}
function EvLegend({ e }: { e: Evidence }) {
  return <span className="flex items-center gap-1.5"><Ev e={e} />{EV_LABEL[e]}</span>;
}

function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span className="md">
      {parts.map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}
    </span>
  );
}

function StepRow({ s, n, g, done, critical, onDone }: { s: Step; n: number; g: Guide; done: boolean; critical: boolean; onDone: () => void }) {
  const owner = s.owner === "agent" ? "Agent" : s.owner === "you" ? "You" : "Agent→You";
  return (
    <li className="border-b rule">
      <details id={`step-${s.id}`} className="group">
        <summary className="grid grid-cols-[22px_20px_minmax(0,1fr)_auto] items-center gap-x-2.5 py-2.5 hover:bg-surface sm:grid-cols-[22px_20px_minmax(0,1fr)_86px_118px_14px]">
          <span className={`mono num text-[12px] ${critical ? "font-semibold text-signal-ink" : "text-ink-3"}`}>{String(n).padStart(2, "0")}</span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDone(); }}
            aria-pressed={done}
            aria-label={`Mark "${s.title}" ${done ? "not done" : "done"}`}
            className={`flex h-4 w-4 items-center justify-center border text-[11px] leading-none ${done ? "border-ink bg-ink text-white" : "border-ink-3 bg-surface"}`}
          >
            {done ? "✓" : ""}
          </button>
          <span className={`min-w-0 text-[14.5px] ${done ? "text-ink-3 line-through decoration-ink-3" : ""}`}>
            <span className="chev mr-1.5 text-[10px] text-ink-3" aria-hidden>▶</span>
            {s.title}
            {s.cost && <span className="mono ml-2 text-[10.5px] uppercase text-amber">cost</span>}
          </span>
          <span className={`mono hidden w-fit px-1.5 py-0.5 text-[10.5px] uppercase sm:inline ${s.owner === "you" ? "bg-ink text-white" : s.owner === "agent" ? "border border-ink" : "border border-ink bg-shade"}`}>{owner}</span>
          <span className="mono num whitespace-nowrap text-right text-[12px] sm:text-left">
            <span className="text-ink-2">{fmtEffort(s.activeMinutes)}</span>
            {s.waitDays[1] > 0 && <span className="block text-amber sm:inline sm:ml-1">+{s.waitDays[0] === s.waitDays[1] ? s.waitDays[1] : `${s.waitDays[0]}–${s.waitDays[1]}`}d</span>}
          </span>
          <span className="hidden sm:inline-flex"><Ev e={s.evidence} /></span>
        </summary>
        <div className="grid gap-2 pb-4 pl-[52px] pr-2 text-[13.5px] text-ink-2">
          <p><Md text={s.detail} /></p>
          {(s.agent || s.human) && (
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              {s.agent && <p><span className="mono mr-1.5 text-[10.5px] uppercase text-ink">Agent</span>{s.agent}</p>}
              {s.human && <p><span className="mono mr-1.5 bg-ink px-1 text-[10.5px] uppercase text-white">You</span>{s.human}</p>}
            </div>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            <span className="flex items-center gap-1.5 sm:hidden"><Ev e={s.evidence} />{s.evidence}</span>
            {s.cost && <span className="text-amber">Cost: {s.cost}</span>}
            {s.link && <a className="underline underline-offset-2 hover:text-ink" href={s.link} target="_blank" rel="noreferrer">Open console ↗</a>}
            {s.sources.map((i) => g.sources[i] && (
              <a key={i} className="underline underline-offset-2 hover:text-ink" href={g.sources[i].url} target="_blank" rel="noreferrer">[{i + 1}] {g.sources[i].title.slice(0, 48)}</a>
            ))}
          </p>
        </div>
      </details>
    </li>
  );
}

function Fold({ title, count, open, children }: { title: string; count?: number; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="border-b rule">
      <summary className="flex items-center justify-between py-2.5 text-[14px] hover:text-ink">
        <span><span className="chev mr-2 text-[10px] text-ink-3" aria-hidden>▶</span>{title}</span>
        {count !== undefined && <span className="mono num text-[12px] text-ink-3">{count}</span>}
      </summary>
      <div className="pb-3 text-[13px] text-ink-2">{children}</div>
    </details>
  );
}

function EvidencePanel({ g }: { g: PartialGuide }) {
  const probes = g.probes || [];
  const caps = g.capabilities || [];
  const steps = g.steps || [];
  const sourced = [...caps, ...steps].filter((x) => x.evidence === "sourced").length;
  const unsure = [...caps, ...steps].filter((x) => x.evidence === "uncertain").length + (g.uncertain?.length || 0);
  const full = isFull(g);
  return (
    <aside aria-label="Evidence and fallbacks">
      <div className="border-b border-ink pb-2"><p className="label !text-ink">Evidence</p></div>
      <div className="grid grid-cols-3 border-b rule py-3 text-[12px]">
        <p className="flex flex-col gap-1"><span className="flex items-center gap-1.5"><Ev e="tested" />Tested</span><span className="mono num text-[20px] font-semibold text-ink">{probes.length}</span></p>
        <p className="flex flex-col gap-1"><span className="flex items-center gap-1.5"><Ev e="sourced" />Sourced</span><span className="mono num text-[20px] font-semibold text-ink">{full ? sourced : "–"}</span></p>
        <p className="flex flex-col gap-1"><span className="flex items-center gap-1.5"><Ev e="uncertain" />Uncertain</span><span className="mono num text-[20px] font-semibold text-ink">{full ? unsure : "–"}</span></p>
      </div>
      {probes.length > 0 && (
        <Fold title="Live probes" count={probes.length}>
          <ul className="space-y-2">
            {probes.map((p, i) => (
              <li key={i} className="fill-in">
                <p className="flex items-center gap-1.5 text-ink"><span className={`mono text-[11px] ${p.ok ? "" : "text-amber"}`}>{p.ok ? "PASS" : "MISS"}</span>{p.label}</p>
                <p className="break-words text-[12.5px]">{p.result}</p>
                <a href={p.url} target="_blank" rel="noreferrer" className="mono break-all text-[11px] text-ink-3 underline underline-offset-2">{p.url.replace(/^https?:\/\//, "").slice(0, 70)} · {p.at}</a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-3">Public, unauthenticated requests only. Nothing was created, signed into or submitted.</p>
        </Fold>
      )}
      {(g.checks?.length || 0) > 0 && (
        <Fold title="Re-verified against live sources" count={g.checks!.length}>
          <ul className="space-y-2">
            {g.checks!.map((c, i) => (
              <li key={i}>
                <p className="text-ink"><span className={`mono mr-1.5 text-[10.5px] uppercase ${c.status === "corrected" ? "bg-signal px-1 text-ink" : c.status === "unverifiable" ? "text-amber" : ""}`}>{c.status}</span>{c.claim}</p>
                <p className="text-[12.5px]">{c.note} <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source ↗</a></p>
              </li>
            ))}
          </ul>
        </Fold>
      )}
      {full && g.launchToday!.length > 0 && (
        <Fold title="Ship before approval" count={g.launchToday!.length}>
          <ul className="list-[square] space-y-1 pl-4">{g.launchToday!.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Fold>
      )}
      {full && g.blockers!.length > 0 && (
        <Fold title="If you're blocked" count={g.blockers!.length}>
          <ul className="space-y-2">{g.blockers!.map((b, i) => <li key={i}><p className="font-medium text-ink">{b.problem}</p><p>{b.fix}</p></li>)}</ul>
        </Fold>
      )}
      {full && g.rejections!.length > 0 && (
        <Fold title="Why apps get rejected" count={g.rejections!.length}>
          <ul className="list-[square] space-y-1 pl-4">{g.rejections!.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Fold>
      )}
      {full && g.uncertain!.length > 0 && (
        <Fold title="What we couldn't confirm" count={g.uncertain!.length}>
          <ul className="list-[square] space-y-1 pl-4">{g.uncertain!.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Fold>
      )}
      {(g.sources?.length || 0) > 0 && (
        <Fold title="Sources" count={g.sources!.length}>
          <ol className="space-y-1">
            {g.sources!.map((s, i) => (
              <li key={i} className="grid grid-cols-[22px_1fr] fill-in"><span className="mono num text-[11px] text-ink-3">{i + 1}</span><a href={s.url} target="_blank" rel="noreferrer" className="break-words underline decoration-rule-2 underline-offset-2 hover:decoration-ink">{s.title}</a></li>
            ))}
          </ol>
        </Fold>
      )}
      {g.model && <p className="mono mt-3 break-words text-[11px] text-ink-3">Model: {g.model}</p>}
      {!full && !probes.length && <div className="mt-3 space-y-2" aria-hidden><div className="skel h-5 w-full" /><div className="skel h-5 w-4/5" /></div>}
    </aside>
  );
}
