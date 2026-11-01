"use client";
import { suggestLead } from "@/lib/checkClient";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProviderGraph, type FactStatus, type Profile } from "@/lib/graph/schema";
import { decodeGraphHash } from "@/lib/urlstate";
import type { Trace } from "@/lib/pipeline/trace";
import type { PublishVerdict } from "@/lib/publish";
import Guide, { Ev } from "./Guide";
import { Collapse, useFlip } from "./motion";
import { useToast } from "./ui";

type StageId = "scout" | "scopes" | "gates" | "probe" | "verify";
const LANES: { id: StageId; label: string; does: string }[] = [
  { id: "scout", label: "Scout", does: "Finds official docs and Composio status" },
  { id: "scopes", label: "Scopes", does: "Classifies each scope's review tier" },
  { id: "gates", label: "Gates", does: "Finds reviews, checks, caps, payment" },
  { id: "probe", label: "Prober", does: "Tests OAuth endpoints live" },
  { id: "verify", label: "Verifier", does: "Checks every quote against its source" },
];
type Lane = { status: "pending" | "running" | "done" | "warn" | "skipped"; detail?: string; ms?: number; facts: { id: string; claim: string; status: FactStatus | "corrected"; note?: string; struck?: boolean }[] };
type Ev = { type: string; [k: string]: any };
export type StoredProps = { graph: ProviderGraph; publish: PublishVerdict; storedAt: string; stale?: boolean; recheckInMin?: number };

const parseGraph = (x: unknown) => { const p = ProviderGraph.safeParse(x); return p.success ? p.data : null; };
const fresh = () => Object.fromEntries(LANES.map((l) => [l.id, { status: "pending", facts: [] }])) as unknown as Record<StageId, Lane>;

/** Apps outside the library. A stored guide renders at once (zero model calls); otherwise the server either serves
    one from the shared store or investigates live in five lanes, and the guide fills in when the graph lands. */
export default function LiveGuide({ slug, name: name0, q: q0, composioSlug: cs0, stored }: { slug: string; name: string; q?: string; composioSlug?: string; caps?: string[]; profile?: Partial<Profile>; stored?: StoredProps }) {
  const router = useRouter();
  /* The page is static/ISR, so ?q= and ?cs= are read here after hydration; the investigation waits for them. */
  const [url, setUrl] = useState<{ q?: string; cs?: string } | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setUrl({ q: sp.get("q")?.trim() || undefined, cs: sp.get("cs")?.trim() || undefined });
  }, []);
  const q = url?.q || q0;
  const name = url?.q || name0;
  const composioSlug = url?.cs || cs0;
  const [graph, setGraph] = useState<ProviderGraph | null>(stored?.graph || null);
  const [publish, setPublish] = useState<PublishVerdict | undefined>(stored?.publish);
  const [meta, setMeta] = useState<{ storedAt?: string; stale?: boolean; recheckInMin?: number }>({ storedAt: stored?.storedAt, stale: stored?.stale, recheckInMin: stored?.recheckInMin });
  const [trace, setTrace] = useState<Trace | undefined>();
  const [lanes, setLanes] = useState<Record<StageId, Lane>>(fresh);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(stored ? "done" : "idle");
  const [error, setError] = useState<{ code?: string; message: string; suggestions?: { slug: string; name: string; href: string; near?: boolean }[] }>();
  const [elapsed, setElapsed] = useState(0);
  const [waiting, setWaiting] = useState<string | undefined>();
  const [run, setRun] = useState(0);
  const t0 = useRef(0);
  const { flash, node: toast } = useToast();

  useEffect(() => {
    if (run === 0 && stored) return; // served by the store on the server: nothing to do
    if (!url) return; // wait until ?q= / ?cs= have been read
    if (run === 0) {
      const restored = decodeGraphHash(window.location.hash, parseGraph);
      if (restored) { setGraph(restored); setState("done"); return; }
    }
    let cancelled = false;
    const recheck = run > 0;
    setError(undefined); setState("running"); setLanes(fresh()); setTrace(undefined); setWaiting(undefined);
    if (!recheck) setGraph(null);
    t0.current = Date.now();
    setElapsed(0);
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0.current) / 1000)), 500);
    const upd = (id: StageId, f: (l: Lane) => Lane) => setLanes((ls) => ({ ...ls, [id]: f(ls[id]) }));
    (async () => {
      let got = false, servedFromStore = false;
      try {
        const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: q || name, slug, composioSlug, fresh: recheck }) });
        if (!res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", finished = false;
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as Ev;
            if (ev.type === "redirect") { finished = true; router.replace(`/guide/${ev.slug}`); flash(ev.reason); return; }
            if (ev.type === "cached") { servedFromStore = true; setMeta({ storedAt: ev.storedAt, stale: ev.stale, recheckInMin: ev.recheckInMin }); setState("done"); }
            else if (ev.type === "stage") upd(ev.id, (l) => ({ ...l, status: ev.status, detail: ev.detail ?? l.detail, ms: ev.ms || l.ms }));
            else if (ev.type === "fact") upd(ev.stage, (l) => ({ ...l, facts: [...l.facts, { id: ev.id, claim: ev.claim, status: ev.status }] }));
            else if (ev.type === "correction") {
              setLanes((ls) => {
                const n = { ...ls };
                for (const k of Object.keys(n) as StageId[]) n[k] = { ...n[k], facts: n[k].facts.map((f) => (f.id === ev.id ? { ...f, status: ev.to === "corrected" ? "sourced" : ev.to, struck: ev.to === "uncertain" } : f)) };
                n.verify = { ...n.verify, facts: [...n.verify.facts, { id: `${ev.id}-c${n.verify.facts.length}`, claim: ev.claim, status: ev.to === "corrected" ? "corrected" : ev.to, note: ev.to === "uncertain" ? `Downgraded: ${ev.reason}` : ev.reason }] };
                return n;
              });
            } else if (ev.type === "graph") {
              const g = parseGraph({ ...ev.graph, slug });
              if (g) { setGraph(g); got = true; if (!recheck) setPublish(undefined); }
            } else if (ev.type === "published") {
              setPublish(ev.publish);
              if (!servedFromStore) setMeta({ storedAt: ev.storedAt, stale: false, recheckInMin: 10 });
              setState("done"); finished = true;
              if (ev.store === "memory" && !servedFromStore) flash("Saved on this server only (shared store not configured)");
            } else if (ev.type === "trace") {
              setTrace(ev.trace);
              try { localStorage.setItem(`gl:trace:${ev.trace.id}`, JSON.stringify(ev.trace)); } catch {}
            } else if (ev.type === "notice") flash(ev.message);
            else if (ev.type === "waiting") setWaiting(ev.message);
            else if (ev.type === "error") { setError({ code: ev.code, message: ev.message, suggestions: ev.suggestions }); setState("error"); finished = true; }
          }
        }
        if (!finished && !cancelled) { if (got) setState("done"); else { setError({ message: "The connection closed before the investigation finished." }); setState("error"); } }
      } catch (e: any) {
        if (!cancelled) { setError({ code: "network", message: `Connection dropped: ${e?.message || e}` }); setState("error"); }
      } finally { clearInterval(tick); }
    })();
    return () => { cancelled = true; clearInterval(tick); };
  }, [slug, name, q, composioSlug, run, url]); // eslint-disable-line react-hooks/exhaustive-deps

  const notApp = error?.code === "not_an_app";
  const showPanel = !notApp && (state === "running" || state === "error" || (state === "done" && !!trace));
  const panel = showPanel ? <Investigation lanes={lanes} state={state} elapsed={elapsed} error={error} waiting={state === "running" ? waiting : undefined} onRetry={error && error.code !== "no_model" && error.code !== "rate_limited" ? () => setRun((n) => n + 1) : undefined} collapsed={state === "done"} /> : null;
  const onRecheck = () => setRun((n) => n + 1);

  if (graph)
    return (
      <>
        <Guide key={graph.slug + (graph.traceId || "")} graph={graph} publish={publish} fromUrl trace={trace} live={panel} meta={{ ...meta, onRecheck, rechecking: state === "running" }} />
        {toast}
      </>
    );
  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 pt-5 text-[13px] text-ink-3"><a href="/" className="rounded px-1 hover:text-ink">Apps</a><span aria-hidden>/</span><span className="text-ink-2">{name}</span></nav>
      <section className="pt-5 sm:pt-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 data-vt="app-title" className="text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[46px]">{name}</h1>
          <span className="badge">{notApp ? "Not found" : state === "error" ? "Stopped" : "Investigating"}</span>
        </div>
        {notApp ? (
          <div className="mt-4 max-w-[820px]" role="alert" data-rejected="">
            <p className="text-[18px] leading-snug sm:text-[21px]"><span className="font-semibold">Nothing to investigate.</span> <span className="text-ink-2">{error?.message}</span></p>
            {!!error?.suggestions?.length && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-ink-3">{suggestLead(error.suggestions)} {error.suggestions.map((s) => <a key={s.slug} href={s.href} className="chip">{s.name}</a>)}</p>
            )}
            <p className="mt-4 text-[14px]"><a href="/" className="underline underline-offset-4">Back to all apps</a></p>
          </div>
        ) : state === "error" ? (
          <div className="mt-4 max-w-[820px]" data-error={error?.code || ""}>
            <p className="text-[18px] leading-snug sm:text-[21px]"><span className="font-semibold">{error?.code === "rate_limited" ? "Hourly limit reached." : "No plan yet."}</span> <span className="text-ink-2">{error?.message}</span></p>
            {error?.code === "rate_limited" && <p className="mt-3 text-[14px]"><a href="/" className="underline underline-offset-4">Browse the guides that are ready</a></p>}
          </div>
        ) : (
          <p className="mt-4 max-w-[820px] text-[18px] leading-snug text-ink-2 sm:text-[21px]">Reading {name}&apos;s docs and testing its endpoints. Every quote is checked against its source before it reaches the plan, and the finished guide is saved so nobody has to wait for it again.</p>
        )}
      </section>
      {panel}
      {(state === "running" || (state === "idle" && !stored)) && !notApp && <Skeleton />}
      {toast}
    </main>
  );
}

function Skeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden>
      <div className="flex gap-2"><div className="skel h-8 w-36 !rounded-full" /><div className="skel h-8 w-28 !rounded-full" /><div className="skel h-8 w-40 !rounded-full" /></div>
      <div className="panel h-[220px] p-5"><div className="skel h-6 w-1/3" /><div className="skel mt-6 h-3 w-full" /><div className="skel mt-4 h-3 w-5/6" /><div className="skel mt-4 h-3 w-2/3" /></div>
    </div>
  );
}

function Investigation({ lanes, state, elapsed, error, waiting, onRetry, collapsed }: { lanes: Record<StageId, Lane>; state: string; elapsed: number; error?: { code?: string; message: string }; waiting?: string; onRetry?: () => void; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => setOpen(!collapsed), [collapsed]);
  const doneCount = LANES.filter((l) => ["done", "warn", "skipped"].includes(lanes[l.id].status)).length;
  return (
    <section className="panel mt-6 overflow-hidden" aria-label="Investigation" aria-live="polite">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
        <span className="flex items-center gap-2.5 text-[14px] font-medium">
          {state === "running" ? <span className="live-dot" aria-hidden /> : <span className="disclose-chev text-[10px] text-ink-3" aria-hidden>▶</span>}
          {state === "running" ? "Investigating" : state === "error" ? "Investigation stopped" : "How this plan was found"}
        </span>
        <span className="mono num flex items-center gap-3 text-[12px] text-ink-3">
          <span>{doneCount}/5 lanes</span><span>{elapsed}s</span>
        </span>
      </button>
      <div className="h-[2px] bg-shade"><div className="h-full bg-signal transition-[width] duration-300" style={{ width: `${(doneCount / 5) * 100}%` }} /></div>
      {waiting && <p data-waiting="" className="flex items-start gap-2 border-b rule bg-amber-wash px-4 py-2.5 text-[13.5px] text-ink sm:px-5"><span className="live-dot mt-1.5 shrink-0" aria-hidden /><span>{waiting}</span></p>}
      <Collapse open={open}>
        <div className="grid border-t rule md:grid-cols-5">
          {LANES.map((l, i) => <LaneView key={l.id} l={l} lane={lanes[l.id]} first={i === 0} />)}
        </div>
      </Collapse>
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t rule px-4 py-3 sm:px-5">
          <p className="min-w-0 text-[14px] text-ink-2">{error.message}</p>
          {onRetry && <button onClick={onRetry} className="btn h-8 text-[13px]">Retry</button>}
        </div>
      )}
    </section>
  );
}

function LaneView({ l, lane, first }: { l: (typeof LANES)[number]; lane: Lane; first: boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  const shown = lane.facts.slice(-5);
  useFlip(ref, [shown.map((f) => f.id + f.status).join()]);
  const mark = lane.status === "done" ? <span className="text-ok">✓</span> : lane.status === "warn" ? <span className="text-amber">!</span> : lane.status === "running" ? <span className="live-dot" /> : lane.status === "skipped" ? <span className="text-ink-3">–</span> : <span className="text-ink-3">○</span>;
  return (
    <div className={`min-w-0 border-b rule px-4 py-3 md:border-b-0 ${first ? "" : "md:border-l"}`} aria-label={`${l.label} lane`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold"><span className="grid w-3 place-items-center text-[12px]" aria-hidden>{mark}</span>{l.label}</p>
        {lane.ms ? <span className="mono num text-[11px] text-ink-3">{(lane.ms / 1000).toFixed(1)}s</span> : null}
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-3 [overflow-wrap:anywhere]">{lane.detail || l.does}</p>
      {shown.length > 0 && (
        <ul ref={ref} className="mt-2 space-y-1.5">
          {shown.map((f) => (
            <li key={f.id} data-flip={f.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-1.5 text-[12.5px] leading-snug">
              <span className="pt-1">{f.status === "corrected" ? <span className="mono text-[10px] text-signal-ink">↻</span> : <Ev s={f.status} />}</span>
              <span className={`min-w-0 [overflow-wrap:anywhere] ${f.struck ? "text-ink-3 line-through decoration-ink-3" : ""}`}>
                <span className="clamp-2" title={f.claim}>{f.claim}</span>
                {f.note && <span className="block text-[11.5px] text-amber no-underline">{f.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
