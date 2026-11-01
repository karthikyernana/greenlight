"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Fact, Need, Profile, ProviderGraph } from "@/lib/graph/schema";
import { DEFAULT_PROFILE } from "@/lib/graph/schema";
import { plan, planFacts, TIER_LABEL, TIER_HINT, defaultCaps, BUSINESS_FACT, type Plan, type PlanStep, type ToggleKey } from "@/lib/engine";
import { graphToGuide } from "@/lib/graph/adapt";
import { needHref } from "@/lib/urlstate";
import { fmtEffort } from "@/lib/plan";
import { COMPOSIO_CALLBACK } from "@/lib/kit";
import type { Trace } from "@/lib/pipeline/trace";
import Runway from "./Runway";
import SetupKit, { copyText } from "./SetupKit";
import Term, { WithTerms } from "./Term";
import { CountText } from "./motion";

const TOGGLES: Record<ToggleKey, { label: string; hint: string; options: { v: string; label: string }[] }> = {
  audience: { label: "Who connects", hint: "Apps used only inside your own organisation often skip review.", options: [{ v: "team", label: "Just my team" }, { v: "public", label: "Public users" }] },
  scale: { label: "Users", hint: "Some providers let a small number of users in before review.", options: [{ v: "small", label: "Up to 100" }, { v: "large", label: "More than 100" }] },
  business: { label: "Registered business", hint: "Some checks only accept a registered company.", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }] },
};

export default function Guide({ graph, initialNeed, trace, live }: { graph: ProviderGraph; initialNeed?: { caps?: string[]; profile?: Partial<Profile> }; trace?: Trace; live?: React.ReactNode }) {
  const [need, setNeed] = useState<Need>(() => ({ caps: initialNeed?.caps?.length ? initialNeed.caps : defaultCaps(graph), profile: { ...DEFAULT_PROFILE, ...(initialNeed?.profile || {}) } }));
  const [kit, setKit] = useState(false);
  const [toast, setToast] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const p = useMemo(() => plan(graph, need), [graph, need]);
  const facts = useMemo(() => new Map([...graph.facts, BUSINESS_FACT].map((f) => [f.id, f])), [graph]);
  const guide = useMemo(() => graphToGuide(graph), [graph]);
  const generated = graph.origin === "generated";

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(`gl:progress:${graph.slug}`) || "[]")); } catch {}
  }, [graph.slug]);
  useEffect(() => {
    window.history.replaceState(null, "", needHref(graph, p.need, { embed: generated }));
  }, [p.need, graph, generated]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };
  const shareUrl = () => window.location.origin + needHref(graph, p.need, { embed: generated });
  const toggleCap = (id: string) => setNeed((n) => ({ ...n, caps: n.caps.includes(id) ? (n.caps.length > 1 ? n.caps.filter((x) => x !== id) : n.caps) : [...n.caps, id] }));
  const setProfile = (k: ToggleKey, v: string) => setNeed((n) => ({ ...n, profile: { ...n.profile, ...(k === "business" ? { business: v === "yes" } : { [k]: v }) } as Profile }));
  const toggleDone = (id: string) => setDone((d) => { const n = d.includes(id) ? d.filter((x) => x !== id) : [...d, id]; localStorage.setItem(`gl:progress:${graph.slug}`, JSON.stringify(n)); return n; });
  const openStep = useCallback((id: string) => {
    const sec = document.getElementById("sec-steps") as HTMLDetailsElement | null;
    if (sec) sec.open = true;
    const el = document.getElementById(`step-${id}`) as HTMLDetailsElement | null;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const agentCan = p.steps.filter((s) => s.owner !== "you").length;
  const usedFacts = useMemo(() => planFacts(graph, p), [graph, p]);
  const counts = { tested: usedFacts.filter((f) => f.status === "tested").length, sourced: usedFacts.filter((f) => f.status === "sourced").length, uncertain: usedFacts.filter((f) => f.status === "uncertain").length };
  const dcr = graph.probes.some((x) => /dynamic client registration/i.test(x.result));
  const bestSave = p.suggestions.filter((s) => s.kind !== "composio")[0];

  return (
    <main className="mx-auto max-w-[1080px] px-4 pb-28 sm:px-6 lg:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b rule py-3">
        <p className="label flex flex-wrap items-center gap-x-2 gap-y-1">
          {graph.category && <><span>{graph.category}</span><span aria-hidden>·</span></>}
          {generated ? <span className="text-signal-ink">Investigated by agents · not human-reviewed</span> : <span className="!text-ink">Hand-researched</span>}
          <span aria-hidden>·</span><span className="num">Checked {graph.verifiedAt}</span>
        </p>
        <Actions onCopy={async () => { await copyText(shareUrl()); flash("Link copied with your choices"); }} onKit={() => setKit(true)} className="hidden lg:flex" />
      </div>

      <section className="pt-7">
        <h1 className="text-[32px] font-semibold leading-none tracking-[-0.03em] sm:text-[48px]">{graph.name}</h1>
        <p className="mt-3 max-w-[860px] text-[18px] leading-snug tracking-[-0.01em] sm:text-[22px]" aria-live="polite">
          <span className="font-semibold">{p.lead}</span>
          {p.pole && <> <span className="text-signal-ink"><WithTerms text={p.pole.text.replace(/^\S+(–\S+)? because /, "Because ")} /></span> <FactRefs ids={p.pole.facts} facts={facts} /></>}
        </p>
        {p.warnings.map((w) => (
          <p key={w.text} className="mt-2 flex max-w-[860px] items-baseline gap-2 text-[14px] text-amber fill-in"><span aria-hidden>▲</span><span>{w.text} <FactRefs ids={w.facts} facts={facts} /></span></p>
        ))}
      </section>

      {live}

      {/* what your agent needs + who it's for */}
      <section className="mt-6 space-y-3" aria-label="Your need">
        <div>
          <p className="label mb-1.5">Your agent needs</p>
          <div className="flex flex-wrap gap-1.5">
            {graph.capabilities.map((c) => {
              const on = p.need.caps.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleCap(c.id)} aria-pressed={on} title={`${TIER_LABEL[c.tier]}: ${c.why}${c.scopes.length ? `\nScopes: ${c.scopes.map((s) => s.name.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "")).join(", ")}` : ""}`}
                  className={`chip ${on ? "chip-on" : ""}`}>
                  <span className={`box ${on ? "box-on" : ""}`} aria-hidden />
                  <span>{c.label}</span>
                  <span className={`mono text-[10px] uppercase tracking-[0.04em] ${on && (c.tier === "restricted" || c.tier === "partner") ? "text-signal-ink" : "text-ink-3"}`}>{TIER_LABEL[c.tier]}</span>
                </button>
              );
            })}
          </div>
        </div>
        {p.toggles.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {p.toggles.map((k) => {
              const t = TOGGLES[k];
              const cur = k === "business" ? (p.need.profile.business ? "yes" : "no") : String(p.need.profile[k]);
              return (
                <div key={k} className="flex items-center gap-2 fill-in" title={t.hint}>
                  <span className="label">{t.label}</span>
                  <div className="seg" role="group" aria-label={t.label}>
                    {t.options.map((o) => (
                      <button key={o.v} aria-pressed={cur === o.v} onClick={() => setProfile(k, o.v)} className={cur === o.v ? "seg-on" : ""}>{o.label}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* runway */}
      <section className="mt-6" aria-label="Runway">
        <div className="mb-3 grid grid-cols-2 gap-y-2 border-y border-ink py-2.5 sm:grid-cols-4">
          <Stat label="Until users connect" value={p.live ? "Today" : p.wait} hot={p.days[1] >= 14} />
          <Stat label="Hands-on" value={p.effort} />
          <Stat label="Steps" value={String(p.steps.length)} />
          <Stat label="Agent can prepare" value={`${agentCan} of ${p.steps.length}`} />
        </div>
        <Runway steps={p.steps} onPick={openStep} />
      </section>

      {/* everything else, folded */}
      <div className="mt-8 border-t border-ink">
        {p.suggestions.length > 0 && (
          <Section id="sec-faster" title="Faster paths" meta={bestSave ? `up to ${bestSave.saves} sooner` : "ship today"} hot>
            <ul className="divide-y rule">
              {p.suggestions.map((s) => (
                <li key={s.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div>
                    <p className="text-[15px] font-medium">
                      {s.kind === "composio" ? <><Term t="Composio-managed">Composio’s approved app</Term>: users connect today</> : s.label}
                      <span className="mono ml-2 bg-signal-wash px-1.5 py-0.5 text-[11px] text-signal-ink">{s.kind === "composio" ? "today" : `${s.saves} sooner`}</span>
                    </p>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">{s.tradeoff} <FactRefs ids={s.facts} facts={facts} /></p>
                  </div>
                  {s.caps && <button onClick={() => setNeed((n) => ({ ...n, caps: s.caps! }))} className="h-8 w-fit border border-ink px-3 text-[13px] hover:bg-surface">Use this</button>}
                  {s.kind === "composio" && graph.composio.slug && <a href={`https://docs.composio.dev/toolkits/${graph.composio.slug}`} target="_blank" rel="noreferrer" className="mono flex h-8 w-fit items-center border border-ink px-3 text-[12px] hover:bg-surface">Toolkit ↗</a>}
                </li>
              ))}
            </ul>
            {graph.composio.managed === "not_available" && <p className="pt-2 text-[13px] text-ink-2">Composio needs your own app here. Register this callback: <span className="mono break-all">{COMPOSIO_CALLBACK}</span></p>}
          </Section>
        )}
        {graph.composio.managed === "not_available" && p.suggestions.length === 0 && (
          <Section id="sec-composio" title="Composio" meta="bring your own app">
            <p className="text-[13.5px] text-ink-2">{graph.composio.note} Callback to register: <span className="mono break-all">{COMPOSIO_CALLBACK}</span></p>
          </Section>
        )}

        <Section id="sec-why" title={p.live ? "Why there’s no wait" : "Why it takes this long"} meta={`${p.gatesHit.length} gate${p.gatesHit.length === 1 ? "" : "s"}${p.gatesSkipped.length ? ` · ${p.gatesSkipped.length} skipped` : ""}`}>
          {p.explain.length ? (
            <ul className="space-y-2">
              {p.explain.map((e) => <li key={e.text} className="text-[14px]"><WithTerms text={e.text} /> <FactRefs ids={e.facts} facts={facts} /></li>)}
            </ul>
          ) : <p className="text-[14px] text-ink-2">No provider review stands between your app and real users for what you picked.</p>}
          <p className="mt-3 text-[12.5px] text-ink-3">Tier of what you picked: {TIER_LABEL[p.tier]}. {TIER_HINT[p.tier]}</p>
          {dcr && <p className="mt-2 text-[13px] text-ink-2">Its OAuth server advertises <Term t="DCR" />, so an agent may be able to register a client by API instead of a console form. Probed, not exercised.</p>}
        </Section>

        <Section id="sec-steps" title="Steps" meta={`${p.steps.filter((s) => done.includes(s.id)).length} of ${p.steps.length} done`}>
          <ol>
            {p.steps.map((s, i) => <StepRow key={s.id} s={s} n={i + 1} facts={facts} done={done.includes(s.id)} critical={p.critical.includes(s.id)} onDone={() => toggleDone(s.id)} />)}
          </ol>
          <p className="mt-2 text-[12px] text-ink-3">Progress is saved on this device.</p>
        </Section>

        <Section id="sec-evidence" title="Evidence" meta={`${counts.tested} tested · ${counts.sourced} sourced · ${counts.uncertain} uncertain`}>
          <EvidenceList facts={usedFacts} />
          {graph.checks.length > 0 && (
            <div className="mt-4">
              <p className="label mb-1">Re-checked by hand</p>
              <ul className="space-y-1.5 text-[13px] text-ink-2">
                {graph.checks.map((c, i) => <li key={i}><span className={`mono mr-1.5 text-[10.5px] uppercase ${c.status === "corrected" ? "bg-signal px-1 text-ink" : ""}`}>{c.status}</span>{c.claim}. <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a></li>)}
              </ul>
            </div>
          )}
        </Section>

        {(graph.context.launchToday.length + graph.context.blockers.length + graph.context.rejections.length > 0) && (
          <Section id="sec-stuck" title="If you get stuck" meta={`${graph.context.blockers.length + graph.context.rejections.length} known issues`}>
            <div className="grid gap-5 text-[13.5px] text-ink-2 sm:grid-cols-2">
              {graph.context.blockers.length > 0 && <div><p className="label mb-1">Common blockers</p><ul className="space-y-2">{graph.context.blockers.map((b, i) => <li key={i}><p className="font-medium text-ink">{b.problem}</p><p>{b.fix}</p></li>)}</ul></div>}
              <div className="space-y-4">
                {graph.context.launchToday.length > 0 && <div><p className="label mb-1">Ship before approval</p><ul className="list-[square] space-y-1 pl-4">{graph.context.launchToday.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                {graph.context.rejections.length > 0 && <div><p className="label mb-1">Why apps get rejected</p><ul className="list-[square] space-y-1 pl-4">{graph.context.rejections.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              </div>
            </div>
          </Section>
        )}

        {(trace || graph.traceId) && (
          <Section id="sec-trace" title="Run trace" meta={trace ? `${Math.round(trace.ms / 1000)}s · ${(trace.tokens.prompt + trace.tokens.completion).toLocaleString()} tokens` : "view"}>
            {trace && <TraceSummary t={trace} />}
            <Link href={`/trace/${trace?.id || graph.traceId}`} className="mono mt-2 inline-block text-[12px] underline underline-offset-4">Full trace →</Link>
          </Section>
        )}
      </div>

      <Actions onCopy={async () => { await copyText(shareUrl()); flash("Link copied"); }} onKit={() => setKit(true)} className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink bg-paper p-3 lg:hidden" stretch />
      {kit && <SetupKit g={guide} sel={p.need.caps} shareUrl={shareUrl()} planned={{ steps: p.steps, wait: p.live ? "Same day" : p.wait }} onClose={() => setKit(false)} />}
      {toast && <div role="status" className="mono fixed bottom-20 left-1/2 z-50 -translate-x-1/2 bg-ink px-3 py-2 text-[12px] text-white lg:bottom-6">{toast}</div>}
    </main>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="pr-3">
      <p className="label">{label}</p>
      <p className={`mono mt-0.5 text-[22px] font-semibold leading-none tracking-[-0.03em] sm:text-[26px] ${hot ? "text-signal-ink" : ""}`}><CountText value={value} /></p>
    </div>
  );
}

function Section({ id, title, meta, hot, children }: { id: string; title: string; meta?: string; hot?: boolean; children: React.ReactNode }) {
  return (
    <details id={id} className="border-b rule">
      <summary className="flex items-baseline justify-between gap-3 py-3.5 hover:bg-surface/60">
        <span className="text-[15px] font-medium"><span className="chev mr-2 text-[10px] text-ink-3" aria-hidden>▶</span>{title}</span>
        {meta && <span className={`mono num text-right text-[12px] ${hot ? "text-signal-ink" : "text-ink-3"}`}>{meta}</span>}
      </summary>
      <div className="pb-5 pl-[22px]">{children}</div>
    </details>
  );
}

function Actions({ onCopy, onKit, className = "", stretch }: { onCopy: () => void; onKit: () => void; className?: string; stretch?: boolean }) {
  return (
    <div className={`items-center gap-2 ${className}`}>
      <button onClick={onCopy} className={`h-10 border border-ink px-4 text-[14px] hover:bg-surface ${stretch ? "flex-1" : ""}`}>Copy link</button>
      <button onClick={onKit} className={`h-10 border border-ink bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2 ${stretch ? "flex-[1.4]" : ""}`}>Setup kit <span className="mono ml-1 text-signal" aria-hidden>→</span></button>
    </div>
  );
}

const EV: Record<Fact["status"], string> = { tested: "Tested: we probed it live", sourced: "Sourced: quote found in the cited page", uncertain: "Uncertain: estimate or unverified" };
export function Ev({ s }: { s: Fact["status"] }) {
  return <span className={`ev ev-${s}`} role="img" aria-label={EV[s]} title={EV[s]} />;
}

/** Tiny superscript-style references to the facts behind a sentence. Hover shows the quote. */
function FactRefs({ ids, facts }: { ids: string[]; facts: Map<string, Fact> }) {
  const fs = [...new Set(ids)].map((i) => facts.get(i)).filter(Boolean) as Fact[];
  if (!fs.length) return null;
  return (
    <span className="inline-flex translate-y-[-1px] items-center gap-1 align-middle">
      {fs.slice(0, 3).map((f) => (
        <a key={f.id} href={f.url || undefined} target="_blank" rel="noreferrer" className="factref" title={`${EV[f.status]}\n${f.claim}${f.quote ? `\n“${f.quote.slice(0, 220)}${f.quote.length > 220 ? "…" : ""}”` : ""}${f.note ? `\n${f.note}` : ""}`}>
          <Ev s={f.status} />
        </a>
      ))}
    </span>
  );
}

function EvidenceList({ facts }: { facts: Fact[] }) {
  if (!facts.length) return <p className="text-[13.5px] text-ink-3">No facts cited for this selection.</p>;
  const order = { tested: 0, sourced: 1, uncertain: 2 };
  return (
    <ul className="space-y-3">
      {[...facts].sort((a, b) => order[a.status] - order[b.status]).map((f) => (
        <li key={f.id} className="grid grid-cols-[14px_1fr] gap-x-2 text-[13.5px]">
          <span className="pt-1.5"><Ev s={f.status} /></span>
          <div className="min-w-0">
            <p className="text-ink">{f.claim}</p>
            {f.quote && f.status !== "tested" && <blockquote className="mt-1 border-l-2 border-rule-2 pl-2.5 text-[13px] italic text-ink-2">“{f.quote.length > 320 ? f.quote.slice(0, 320) + "…" : f.quote}”</blockquote>}
            <p className="mono mt-1 break-all text-[11px] text-ink-3">
              {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">{(f.title || f.url).slice(0, 80)}</a> : "Greenlight estimate"} · checked {f.checked}
              {f.note && <span className="text-amber"> · {f.note}</span>}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <span className="md">{parts.map((x, i) => (x.startsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : x.startsWith("`") ? <code key={i}>{x.slice(1, -1)}</code> : <span key={i}>{x}</span>))}</span>;
}

function StepRow({ s, n, facts, done, critical, onDone }: { s: PlanStep; n: number; facts: Map<string, Fact>; done: boolean; critical: boolean; onDone: () => void }) {
  const owner = s.owner === "agent" ? "Agent" : s.owner === "you" ? "You" : "Agent + you";
  return (
    <li className="border-b rule last:border-b-0">
      <details id={`step-${s.id}`}>
        <summary className="grid grid-cols-[22px_18px_minmax(0,1fr)_auto] items-center gap-x-2.5 py-2.5 hover:bg-surface sm:grid-cols-[22px_18px_minmax(0,1fr)_92px_104px]">
          <span className={`mono num text-[12px] ${critical ? "font-semibold text-signal-ink" : "text-ink-3"}`} title={critical ? "On the critical path" : undefined}>{String(n).padStart(2, "0")}</span>
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDone(); }} aria-pressed={done} aria-label={`Mark “${s.title}” ${done ? "not done" : "done"}`}
            className={`flex h-4 w-4 items-center justify-center border text-[11px] leading-none ${done ? "border-ink bg-ink text-white" : "border-ink-3 bg-surface"}`}>{done ? "✓" : ""}</button>
          <span className={`min-w-0 text-[14.5px] ${done ? "text-ink-3 line-through" : ""}`}>{s.title}{s.cost && <span className="mono ml-2 text-[10.5px] uppercase text-amber">paid</span>}</span>
          <span className={`mono hidden w-fit px-1.5 py-0.5 text-[10.5px] uppercase sm:inline ${s.owner === "you" ? "bg-ink text-white" : "border border-ink"}`}>{owner}</span>
          <span className="mono num whitespace-nowrap text-right text-[12px] sm:text-left">
            <span className="text-ink-2">{fmtEffort(s.activeMinutes)}</span>
            {s.waitDays[1] > 0 && <span className="block text-amber sm:ml-1 sm:inline">+{s.waitDays[0] === s.waitDays[1] ? s.waitDays[1] : `${s.waitDays[0]}–${s.waitDays[1]}`}d</span>}
          </span>
        </summary>
        <div className="grid gap-2 pb-4 pl-[52px] pr-2 text-[13.5px] text-ink-2">
          {s.detail && <p><Md text={s.detail} /></p>}
          {(s.agent || s.human) && (
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              {s.agent && <p><span className="mono mr-1.5 border border-ink px-1 text-[10.5px] uppercase text-ink">Agent</span>{s.agent}</p>}
              {s.human && <p><span className="mono mr-1.5 bg-ink px-1 text-[10.5px] uppercase text-white">You</span>{s.human}</p>}
            </div>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            {s.cost && <span className="text-amber">Cost: {s.cost}</span>}
            {s.link && <a className="underline underline-offset-2 hover:text-ink" href={s.link} target="_blank" rel="noreferrer">Open console ↗</a>}
            {s.facts.map((id) => facts.get(id)).filter(Boolean).map((f) => (
              <a key={f!.id} href={f!.url || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 underline underline-offset-2 hover:text-ink" title={f!.quote}><Ev s={f!.status} />{f!.claim.slice(0, 70)}</a>
            ))}
          </p>
        </div>
      </details>
    </li>
  );
}

export function TraceSummary({ t }: { t: Trace }) {
  return (
    <div className="text-[13px]">
      <ul className="grid gap-1 sm:grid-cols-2">
        {t.stages.map((s) => (
          <li key={s.id} className="mono flex justify-between gap-3 border-b rule py-1 text-[12px]">
            <span>{s.status === "done" ? "✓" : s.status === "warn" ? "!" : "·"} {s.label}</span><span className="num text-ink-3">{(s.ms / 1000).toFixed(1)}s</span>
          </li>
        ))}
      </ul>
      <p className="mono mt-2 text-[12px] text-ink-3">
        {t.tools.length} tool calls · {t.llm.length} model calls · quotes matched {t.verifier.quoteMatched}/{t.verifier.checked} · downgraded {t.verifier.downgraded} · corrected {t.verifier.corrected} · models {t.models.join(", ") || "none"}
      </p>
    </div>
  );
}
