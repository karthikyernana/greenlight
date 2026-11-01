"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Fact, Need, Profile, ProviderGraph } from "@/lib/graph/schema";
import { DEFAULT_PROFILE } from "@/lib/graph/schema";
import { plan, planFacts, dedupeFacts, TIER_LABEL, TIER_HINT, defaultCaps, cleanCaps, BUSINESS_FACT, type PlanStep, type ToggleKey } from "@/lib/engine";
import { graphToGuide } from "@/lib/graph/adapt";
import { needHref, parseNeed, parseProfile } from "@/lib/urlstate";
import { fmtEffort } from "@/lib/plan";
import { COMPOSIO_CALLBACK } from "@/lib/kit";
import type { Trace } from "@/lib/pipeline/trace";
import type { PublishVerdict } from "@/lib/publish";
import { recordVisit, setPinned, readShelf, isPinned, onShelfChange } from "@/lib/shelf";
import Runway from "./Runway";
import dynamic from "next/dynamic";
import { copyText } from "@/lib/copy";
// the drawer is only needed after a click: keep it (and lib/kit's generators) out of the guide's first-load JS
const SetupKit = dynamic(() => import("./SetupKit"), { ssr: false });
import Term, { WithTerms } from "./Term";
import { CountText, Collapse, useFlip } from "./motion";
import { Disclosure, Icon, Seg, StatusBadge, Tick, useToast } from "./ui";

const TOGGLES: Record<ToggleKey, { label: string; hint: string; options: { v: string; label: string }[] }> = {
  audience: { label: "Who connects", hint: "Apps used only inside your own organisation often skip review.", options: [{ v: "team", label: "My team" }, { v: "public", label: "Public" }] },
  scale: { label: "Users", hint: "Some providers let a small number of users in before review.", options: [{ v: "small", label: "≤ 100" }, { v: "large", label: "100+" }] },
  business: { label: "Registered business", hint: "Some checks only accept a registered company.", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }] },
};

export type GuideMeta = { storedAt?: string; stale?: boolean; recheckInMin?: number; onRecheck?: () => void; rechecking?: boolean };

/** `fromUrl`: the page is static, so the need in the URL (?need=&who=&scale=&biz=) is applied after hydration. */
export default function Guide({ graph, publish, initialNeed, trace, live, meta, fromUrl }: { graph: ProviderGraph; publish?: PublishVerdict; initialNeed?: { caps?: string[]; profile?: Partial<Profile> }; trace?: Trace; live?: React.ReactNode; meta?: GuideMeta; fromUrl?: boolean }) {
  const [need, setNeed] = useState<Need>(() => ({ caps: initialNeed?.caps?.length ? initialNeed.caps : defaultCaps(graph), profile: { ...DEFAULT_PROFILE, ...(initialNeed?.profile || {}) } }));
  const [kit, setKit] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [pinned, setPin] = useState(false);
  const { flash, node: toast } = useToast();
  const p = useMemo(() => plan(graph, need), [graph, need]);
  const facts = useMemo(() => new Map([...graph.facts, BUSINESS_FACT].map((f) => [f.id, f])), [graph]);
  const guide = useMemo(() => graphToGuide(graph), [graph]);
  const generated = graph.origin === "generated";
  const status = publish?.status || (generated ? "draft" : "curated");
  const stepsRef = useRef<HTMLOListElement>(null);
  useFlip(stepsRef, [p.steps.map((s) => s.id).join()]);

  const shelfItem = useMemo(() => ({ slug: graph.slug, name: graph.name, wait: p.live ? "Today" : p.wait, status }), [graph.slug, graph.name, p.live, p.wait, status]);
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(`gl:progress:${graph.slug}`) || "[]")); } catch {}
  }, [graph.slug]);
  useEffect(() => { recordVisit(shelfItem); setPin(isPinned(readShelf(), graph.slug)); return onShelfChange(() => setPin(isPinned(readShelf(), graph.slug))); }, [shelfItem, graph.slug]);
  // stored guides have a permanent link: no need to embed the graph in the URL any more
  const embed = generated && !meta?.storedAt;
  const synced = useRef(!fromUrl);
  const hadParams = useRef(false);
  useEffect(() => {
    if (!fromUrl) return;
    const sp = new URLSearchParams(window.location.search);
    const caps = parseNeed(sp.get("need"));
    if (caps || sp.has("who") || sp.has("scale") || sp.has("biz")) {
      hadParams.current = true;
      setNeed({ caps: caps ? cleanCaps(graph, caps) : defaultCaps(graph), profile: { ...DEFAULT_PROFILE, ...parseProfile({ who: sp.get("who") || undefined, scale: sp.get("scale") || undefined, biz: sp.get("biz") || undefined }) } });
    }
  }, [fromUrl, graph]);
  useEffect(() => {
    // the first run after mount would write the default need over the URL's: skip it, the setNeed above re-runs us
    if (!synced.current) { synced.current = true; if (hadParams.current) return; }
    window.history.replaceState(null, "", needHref(graph, p.need, { embed }));
  }, [p.need, graph, embed]);

  const shareUrl = () => window.location.origin + needHref(graph, p.need, { embed });
  const toggleCap = (id: string) => setNeed((n) => ({ ...n, caps: n.caps.includes(id) ? (n.caps.length > 1 ? n.caps.filter((x) => x !== id) : n.caps) : [...n.caps, id] }));
  const setProfile = (k: ToggleKey, v: string) => setNeed((n) => ({ ...n, profile: { ...n.profile, ...(k === "business" ? { business: v === "yes" } : { [k]: v }) } as Profile }));
  const toggleDone = (id: string) => setDone((d) => { const n = d.includes(id) ? d.filter((x) => x !== id) : [...d, id]; localStorage.setItem(`gl:progress:${graph.slug}`, JSON.stringify(n)); return n; });
  const pickStep = useCallback((id: string) => {
    setStepsOpen(true);
    setOpenStep(id);
    setTimeout(() => document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }, []);
  const pin = () => { setPinned(shelfItem, !pinned); flash(pinned ? "Removed from Your apps" : "Pinned to Your apps"); };
  const copy = async () => { await copyText(shareUrl()); flash("Link copied with your choices"); };

  const agentCan = p.steps.filter((s) => s.owner !== "you").length;
  const usedFacts = useMemo(() => dedupeFacts(planFacts(graph, p)), [graph, p]);
  const counts = { tested: usedFacts.filter((f) => f.status === "tested").length, sourced: usedFacts.filter((f) => f.status === "sourced").length, uncertain: usedFacts.filter((f) => f.status === "uncertain").length };
  const dcr = graph.probes.some((x) => /dynamic client registration/i.test(x.result));
  const bestSave = p.suggestions.filter((s) => s.kind !== "composio")[0];
  const checked = meta?.storedAt ? meta.storedAt.slice(0, 10) : graph.verifiedAt;

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-28 sm:px-6 lg:pb-16">
      {/* breadcrumb + actions */}
      <div className="flex items-center justify-between gap-3 pt-5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
          <Link href="/" className="rounded px-1 hover:text-ink">Apps</Link><span aria-hidden>/</span><span className="clamp-1 text-ink-2">{graph.name}</span>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <PinButton pinned={pinned} onClick={pin} />
          <button onClick={copy} className="btn"><Icon name="link" />Copy link</button>
          <button onClick={() => setKit(true)} className="btn btn-primary"><Icon name="kit" />Setup kit</button>
        </div>
      </div>

      {/* verdict */}
      <section className="pt-5 sm:pt-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 data-vt="app-title" className="text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[46px]">{graph.name}</h1>
          <StatusBadge status={status} long />
          <button onClick={pin} className="btn btn-quiet h-8 w-8 !px-0 lg:hidden" aria-label={pinned ? "Unpin from Your apps" : "Pin to Your apps"} aria-pressed={pinned}><Icon name={pinned ? "pinned" : "pin"} /></button>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
          {graph.category && <><span>{graph.category}</span><span aria-hidden>·</span></>}
          <span className="num">Checked {checked}</span>
          {meta?.stale && <><span aria-hidden>·</span><span className="text-amber">older than 30 days</span></>}
          {generated && meta?.onRecheck && (
            <>
              <span aria-hidden>·</span>
              <button onClick={meta.onRecheck} disabled={!!meta.rechecking || (meta.recheckInMin ?? 0) > 0} className="inline-flex items-center gap-1 rounded px-1 text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60" title={(meta.recheckInMin ?? 0) > 0 ? `Re-check opens in ${meta.recheckInMin} min` : "Investigate again (uses model calls)"}>
                <Icon name="refresh" size={12} />{meta.rechecking ? "Re-checking…" : (meta.recheckInMin ?? 0) > 0 ? `Re-check in ${meta.recheckInMin} min` : "Re-check"}
              </button>
            </>
          )}
        </p>
        <p className="mt-4 max-w-[820px] text-[18px] leading-snug tracking-[-0.01em] sm:text-[21px]" aria-live="polite">
          <span className="font-semibold">{p.lead}</span>
          {p.pole && <> <span className="text-ink-2"><WithTerms text={p.pole.text.replace(/^\S+(–\S+)? because /, "Because ")} /></span> <FactRefs ids={p.pole.facts} facts={facts} /></>}
        </p>
        {p.warnings.map((w) => (
          <p key={w.text} className="mt-2 flex max-w-[820px] items-baseline gap-2 text-[14px] text-amber"><span aria-hidden>▲</span><span>{w.text} <FactRefs ids={w.facts} facts={facts} /></span></p>
        ))}
        {status === "draft" && publish && publish.failed.length > 0 && <DraftNotice publish={publish} />}
      </section>

      {live}

      {/* need */}
      <section className="mt-7" aria-label="Your need">
        <p className="mb-2 text-[13px] font-medium text-ink-2">Your agent needs</p>
        <div className="flex flex-wrap gap-2">
          {graph.capabilities.map((c) => {
            const on = p.need.caps.includes(c.id);
            const hard = c.tier === "restricted" || c.tier === "partner";
            return (
              <button key={c.id} onClick={() => toggleCap(c.id)} aria-pressed={on} title={`${TIER_LABEL[c.tier]}: ${c.why}${c.scopes.length ? `\nScopes: ${c.scopes.map((s) => s.name.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "")).join(", ")}` : ""}`} className={`chip ${on ? "chip-on" : ""}`}>
                <Tick />
                <span>{c.label}</span>
                <span className={`mono text-[10px] uppercase tracking-[0.04em] ${on && hard ? "text-signal-ink" : "text-ink-3"}`}>{TIER_LABEL[c.tier]}</span>
              </button>
            );
          })}
        </div>
        {p.toggles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {p.toggles.map((k) => {
              const t = TOGGLES[k];
              const cur = k === "business" ? (p.need.profile.business ? "yes" : "no") : String(p.need.profile[k]);
              return (
                <div key={k} className="flex items-center gap-2" title={t.hint}>
                  <span className="text-[13px] text-ink-3">{t.label}</span>
                  <Seg label={t.label} value={cur} onChange={(v) => setProfile(k, v)} options={t.options} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* numbers + runway */}
      <section className="panel mt-5 overflow-hidden" aria-label="Runway">
        <div className="grid grid-cols-2 gap-px border-b rule bg-rule sm:grid-cols-4">
          <Stat label="Until users connect" value={p.live ? "Today" : p.wait} hot={p.days[1] >= 14} />
          <Stat label="Hands-on" value={p.effort} />
          <Stat label="Steps" value={String(p.steps.length)} />
          <Stat label="Agent can prepare" value={`${agentCan} of ${p.steps.length}`} />
        </div>
        <div className="px-4 py-4 sm:px-5">
          <Runway steps={p.steps} onPick={pickStep} />
        </div>
      </section>

      {/* details, progressive */}
      <div className="panel mt-5 overflow-hidden">
        {p.suggestions.length > 0 && (
          <Disclosure id="sec-faster" title="Faster paths" meta={bestSave ? `up to ${bestSave.saves} sooner` : "ship today"} hot>
            <ul className="divide-y rule">
              {p.suggestions.map((s) => (
                <li key={s.id} className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">
                      {s.kind === "composio" ? <><Term t="Composio-managed">Composio’s approved app</Term>: users connect today</> : s.label}
                      <span className="mono ml-2 whitespace-nowrap rounded-full bg-signal-wash px-2 py-0.5 text-[11px] text-signal-ink">{s.kind === "composio" ? "today" : `${s.saves} sooner`}</span>
                    </p>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">{s.tradeoff} <FactRefs ids={s.facts} facts={facts} /></p>
                  </div>
                  {s.caps && <button onClick={() => setNeed((n) => ({ ...n, caps: s.caps! }))} className="btn h-8 w-fit text-[13px]">Use this</button>}
                  {s.kind === "composio" && graph.composio.slug && <a href={`https://docs.composio.dev/toolkits/${graph.composio.slug}`} target="_blank" rel="noreferrer" className="btn h-8 w-fit text-[13px]">Toolkit ↗</a>}
                </li>
              ))}
            </ul>
            {graph.composio.managed === "not_available" && <p className="pt-2 text-[13px] text-ink-2">Composio needs your own app here. Register this callback: <span className="mono [overflow-wrap:anywhere]">{COMPOSIO_CALLBACK}</span></p>}
          </Disclosure>
        )}
        {graph.composio.managed === "not_available" && p.suggestions.length === 0 && (
          <Disclosure id="sec-composio" title="Composio" meta="bring your own app">
            <p className="text-[13.5px] text-ink-2">{graph.composio.note} Callback to register: <span className="mono [overflow-wrap:anywhere]">{COMPOSIO_CALLBACK}</span></p>
          </Disclosure>
        )}

        <Disclosure id="sec-why" title={p.live ? "Why there’s no wait" : "Why it takes this long"} meta={`${p.gatesHit.length} gate${p.gatesHit.length === 1 ? "" : "s"}${p.gatesSkipped.length ? ` · ${p.gatesSkipped.length} skipped` : ""}`}>
          {p.explain.length ? (
            <ul className="space-y-2">{p.explain.map((e) => <li key={e.text} className="text-[14px]"><WithTerms text={e.text} /> <FactRefs ids={e.facts} facts={facts} /></li>)}</ul>
          ) : <p className="text-[14px] text-ink-2">No provider review stands between your app and real users for what you picked.</p>}
          <p className="mt-3 text-[12.5px] text-ink-3">Tier of what you picked: {TIER_LABEL[p.tier]}. {TIER_HINT[p.tier]}</p>
          {dcr && <p className="mt-2 text-[13px] text-ink-2">Its OAuth server advertises <Term t="DCR" />, so an agent may be able to register a client by API instead of a console form. Probed, not exercised.</p>}
        </Disclosure>

        <Disclosure id="sec-steps" title="Steps" open={stepsOpen} onOpenChange={setStepsOpen} meta={`${p.steps.filter((s) => done.includes(s.id)).length} of ${p.steps.length} done`}>
          <ol ref={stepsRef} className="-mx-2">
            {p.steps.map((s, i) => <StepRow key={s.id} s={s} n={i + 1} facts={facts} done={done.includes(s.id)} critical={p.critical.includes(s.id)} onDone={() => toggleDone(s.id)} open={openStep === s.id} onToggle={() => setOpenStep((o) => (o === s.id ? null : s.id))} />)}
          </ol>
          <p className="mt-2 text-[12px] text-ink-3">Progress is saved in this browser.</p>
        </Disclosure>

        <Disclosure id="sec-evidence" title="Evidence" meta={`${counts.tested} tested · ${counts.sourced} sourced · ${counts.uncertain} uncertain`}>
          <EvidenceList facts={usedFacts} />
          {graph.checks.length > 0 && (
            <div className="mt-4">
              <p className="label mb-1.5">Re-checked by hand</p>
              <ul className="space-y-1.5 text-[13px] text-ink-2">
                {graph.checks.map((c, i) => <li key={i}><span className={`mono mr-1.5 rounded px-1 text-[10.5px] uppercase ${c.status === "corrected" ? "bg-signal-wash text-signal-ink" : "bg-shade"}`}>{c.status}</span>{c.claim}. <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a></li>)}
              </ul>
            </div>
          )}
          {publish && publish.checks.length > 0 && (
            <div className="mt-4">
              <p className="label mb-1.5">Publishing checks</p>
              <ul className="space-y-1 text-[13px]">{publish.checks.map((c) => <li key={c.id} className="flex gap-2"><span className={c.pass ? "text-ok" : "text-amber"} aria-hidden>{c.pass ? "✓" : "✕"}</span><span><span className="text-ink">{c.label}</span> <span className="text-ink-3">· {c.detail}</span></span></li>)}</ul>
            </div>
          )}
        </Disclosure>

        {(graph.context.launchToday.length + graph.context.blockers.length + graph.context.rejections.length > 0) && (
          <Disclosure id="sec-stuck" title="If you get stuck" meta={`${graph.context.blockers.length + graph.context.rejections.length} known issues`}>
            <div className="grid gap-5 text-[13.5px] text-ink-2 sm:grid-cols-2">
              {graph.context.blockers.length > 0 && <div><p className="label mb-1.5">Common blockers</p><ul className="space-y-2">{graph.context.blockers.map((b, i) => <li key={i}><p className="font-medium text-ink">{b.problem}</p><p>{b.fix}</p></li>)}</ul></div>}
              <div className="space-y-4">
                {graph.context.launchToday.length > 0 && <div><p className="label mb-1.5">Ship before approval</p><ul className="list-[square] space-y-1 pl-4">{graph.context.launchToday.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                {graph.context.rejections.length > 0 && <div><p className="label mb-1.5">Why apps get rejected</p><ul className="list-[square] space-y-1 pl-4">{graph.context.rejections.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              </div>
            </div>
          </Disclosure>
        )}

        {(trace || graph.traceId) && (
          <Disclosure id="sec-trace" title="Run trace" meta={trace ? `${Math.round(trace.ms / 1000)}s · ${(trace.tokens.prompt + trace.tokens.completion).toLocaleString()} tokens` : "view"}>
            {trace && <TraceSummary t={trace} />}
            <Link href={`/trace/${trace?.id || graph.traceId}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline"><Icon name="trace" size={14} />Full trace</Link>
          </Disclosure>
        )}
      </div>

      {/* mobile action bar */}
      <div className="glass fixed inset-x-3 bottom-3 z-30 flex gap-2 rounded-[16px] p-2 lg:hidden">
        <button onClick={copy} className="btn flex-1"><Icon name="link" />Copy link</button>
        <button onClick={() => setKit(true)} className="btn btn-primary flex-[1.4]"><Icon name="kit" />Setup kit</button>
      </div>
      {kit && <SetupKit g={guide} sel={p.need.caps} shareUrl={shareUrl()} planned={{ steps: p.steps, wait: p.live ? "Same day" : p.wait }} onClose={() => setKit(false)} />}
      {toast}
    </main>
  );
}

function PinButton({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="btn" aria-pressed={pinned}><Icon name={pinned ? "pinned" : "pin"} />{pinned ? "Pinned" : "Pin"}</button>;
}

function DraftNotice({ publish }: { publish: PublishVerdict }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 max-w-[820px] rounded-[12px] border border-[color-mix(in_srgb,var(--color-amber)_25%,white)] bg-amber-wash px-4 py-3 text-[13.5px]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-ink"><span className="font-medium">Not yet verified.</span> <span className="text-ink-2">{publish.failed.length} automatic check{publish.failed.length > 1 ? "s" : ""} failed, so this guide stays off the public board.</span></span>
        <span className="disclose-chev text-[10px] text-amber" aria-hidden>▶</span>
      </button>
      <Collapse open={open}>
        <ul className="mt-2 space-y-1 text-ink-2">{publish.failed.map((f) => <li key={f} className="flex gap-2"><span className="text-amber" aria-hidden>✕</span><span className="min-w-0 [overflow-wrap:anywhere]">{f}</span></li>)}</ul>
      </Collapse>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3.5 sm:px-5">
      <p className="clamp-1 text-[12px] text-ink-3">{label}</p>
      <p className={`mono mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em] sm:text-[26px] ${hot ? "text-signal-ink" : ""}`}><CountText value={value} /></p>
    </div>
  );
}

const EV: Record<Fact["status"], string> = { tested: "Tested: we probed it live", sourced: "Sourced: quote found in the cited page", uncertain: "Uncertain: estimate or unverified" };
export function Ev({ s }: { s: Fact["status"] }) {
  return <span className={`ev ev-${s}`} role="img" aria-label={EV[s]} title={EV[s]} />;
}

/** Tiny references to the facts behind a sentence. Hover shows the quote. */
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
    <ul className="space-y-3.5">
      {[...facts].sort((a, b) => order[a.status] - order[b.status]).map((f) => (
        <li key={f.id} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2.5 text-[13.5px]">
          <span className="pt-1.5"><Ev s={f.status} /></span>
          <div className="min-w-0">
            <p className="text-ink">{f.claim}</p>
            {f.quote && f.status !== "tested" && <blockquote className="mt-1 border-l-2 border-rule-2 pl-2.5 text-[13px] text-ink-2">“{f.quote.length > 320 ? f.quote.slice(0, 320) + "…" : f.quote}”</blockquote>}
            <p className="mono mt-1 text-[11px] text-ink-3 [overflow-wrap:anywhere]">
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

function StepRow({ s, n, facts, done, critical, onDone, open, onToggle }: { s: PlanStep; n: number; facts: Map<string, Fact>; done: boolean; critical: boolean; onDone: () => void; open: boolean; onToggle: () => void }) {
  const owner = s.owner === "agent" ? "Agent" : s.owner === "you" ? "You" : "Agent + you";
  return (
    <li id={`step-${s.id}`} data-flip={s.id} className="border-b rule last:border-b-0">
      <div className="grid grid-cols-[24px_20px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-shade/60 sm:grid-cols-[24px_20px_minmax(0,1fr)_96px_92px]">
        <span className={`mono num text-[12px] ${critical ? "font-semibold text-signal-ink" : "text-ink-3"}`} title={critical ? "On the critical path" : undefined}>{String(n).padStart(2, "0")}</span>
        <button type="button" onClick={onDone} aria-pressed={done} aria-label={`Mark “${s.title}” ${done ? "not done" : "done"}`}
          className={`grid h-[18px] w-[18px] place-items-center rounded-full border transition-colors ${done ? "border-ink bg-ink text-white" : "border-rule-2 bg-surface hover:border-ink-3"}`}>
          {done && <svg width="9" height="9" viewBox="0 0 8 8" aria-hidden><path d="M1.2 4.2 3.1 6 6.8 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 items-center gap-2 text-left">
          <span className={`min-w-0 text-[14.5px] ${done ? "text-ink-3 line-through" : ""}`}>{s.title}{s.cost && <span className="mono ml-2 text-[10.5px] uppercase text-amber">paid</span>}</span>
        </button>
        <span className={`mono hidden w-fit rounded-full px-2 py-0.5 text-[10.5px] uppercase sm:inline ${s.owner === "you" ? "bg-ink text-white" : "border rule text-ink-2"}`}>{owner}</span>
        <span className="mono num whitespace-nowrap text-right text-[12px] sm:text-left">
          <span className="text-ink-2">{fmtEffort(s.activeMinutes)}</span>
          {s.waitDays[1] > 0 && <span className="block text-amber sm:ml-1 sm:inline">+{s.waitDays[0] === s.waitDays[1] ? s.waitDays[1] : `${s.waitDays[0]}–${s.waitDays[1]}`}d</span>}
        </span>
      </div>
      <Collapse open={open}>
        <div className="grid gap-2 pb-4 pl-[56px] pr-2 text-[13.5px] text-ink-2">
          <span className={`mono w-fit rounded-full px-2 py-0.5 text-[10.5px] uppercase sm:hidden ${s.owner === "you" ? "bg-ink text-white" : "border rule"}`}>{owner}</span>
          {s.detail && <p><Md text={s.detail} /></p>}
          {(s.agent || s.human) && (
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              {s.agent && <p><span className="mono mr-1.5 rounded border rule px-1 text-[10.5px] uppercase text-ink">Agent</span>{s.agent}</p>}
              {s.human && <p><span className="mono mr-1.5 rounded bg-ink px-1 text-[10.5px] uppercase text-white">You</span>{s.human}</p>}
            </div>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            {s.cost && <span className="text-amber">Cost: {s.cost}</span>}
            {s.link && <a className="underline underline-offset-2 hover:text-ink" href={s.link} target="_blank" rel="noreferrer">Open console ↗</a>}
            {s.facts.map((id) => facts.get(id)).filter(Boolean).map((f) => (
              <a key={f!.id} href={f!.url || undefined} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 underline underline-offset-2 hover:text-ink" title={f!.quote}><Ev s={f!.status} /><span className="clamp-1 max-w-[52ch]">{f!.claim}</span></a>
            ))}
          </p>
        </div>
      </Collapse>
    </li>
  );
}

export function TraceSummary({ t }: { t: Trace }) {
  return (
    <div className="text-[13px]">
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {t.stages.map((s) => (
          <li key={s.id} className="mono flex justify-between gap-3 border-b rule py-1.5 text-[12px]">
            <span className="clamp-1"><span className={s.status === "warn" ? "text-amber" : s.status === "done" ? "text-ok" : "text-ink-3"}>{s.status === "done" ? "✓" : s.status === "warn" ? "!" : "·"}</span> {s.label}</span><span className="num shrink-0 text-ink-3">{(s.ms / 1000).toFixed(1)}s</span>
          </li>
        ))}
      </ul>
      <p className="mono mt-2 text-[12px] text-ink-3 [overflow-wrap:anywhere]">
        {t.tools.length} tool calls · {t.llm.length} model calls · quotes matched {t.verifier.quoteMatched}/{t.verifier.checked} · downgraded {t.verifier.downgraded} · corrected {t.verifier.corrected} · models {t.models.join(", ") || "none"}
      </p>
    </div>
  );
}
