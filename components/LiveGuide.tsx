"use client";
import { useEffect, useRef, useState } from "react";
import { ProviderGraph, type FactStatus, type Profile } from "@/lib/graph/schema";
import { decodeGraphHash } from "@/lib/urlstate";
import type { Trace } from "@/lib/pipeline/trace";
import Guide, { Ev } from "./Guide";

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

const parseGraph = (x: unknown) => { const p = ProviderGraph.safeParse(x); return p.success ? p.data : null; };

/** Apps outside the library: restore from the share URL or this browser, otherwise investigate live in five lanes. */
export default function LiveGuide({ slug, name, q, composioSlug, caps, profile }: { slug: string; name: string; q?: string; composioSlug?: string; caps?: string[]; profile?: Partial<Profile> }) {
  const [graph, setGraph] = useState<ProviderGraph | null>(null);
  const [trace, setTrace] = useState<Trace | undefined>();
  const [lanes, setLanes] = useState<Record<StageId, Lane>>(() => Object.fromEntries(LANES.map((l) => [l.id, { status: "pending", facts: [] }])) as any);
  const [state, setState] = useState<"idle" | "running" | "done" | "error" | "restored">("idle");
  const [error, setError] = useState<{ code?: string; message: string }>();
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const t0 = useRef(0);

  useEffect(() => {
    if (run === 0) {
      let restored = decodeGraphHash(window.location.hash, parseGraph);
      if (!restored) try { restored = parseGraph(JSON.parse(localStorage.getItem(`gl:graph:${slug}`) || "null")); } catch {}
      if (restored) { setGraph(restored); setState("restored"); return; }
    }
    let cancelled = false;
    setGraph(null); setError(undefined); setState("running");
    setLanes(Object.fromEntries(LANES.map((l) => [l.id, { status: "pending", facts: [] }])) as any);
    t0.current = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0.current) / 1000)), 500);
    const upd = (id: StageId, f: (l: Lane) => Lane) => setLanes((ls) => ({ ...ls, [id]: f(ls[id]) }));
    (async () => {
      try {
        const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: q || name, slug, composioSlug, fresh: run > 0 }) });
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
            if (ev.type === "stage") upd(ev.id, (l) => ({ ...l, status: ev.status, detail: ev.detail ?? l.detail, ms: ev.ms || l.ms }));
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
              if (g) { try { localStorage.setItem(`gl:graph:${slug}`, JSON.stringify(g)); } catch {} setGraph(g); setState("done"); finished = true; }
            } else if (ev.type === "trace") {
              setTrace(ev.trace);
              try { localStorage.setItem(`gl:trace:${ev.trace.id}`, JSON.stringify(ev.trace)); } catch {}
            } else if (ev.type === "error") { setError({ code: ev.code, message: ev.message }); setState("error"); finished = true; }
          }
        }
        if (!finished && !cancelled) { setError({ message: "The connection closed before the investigation finished." }); setState("error"); }
      } catch (e: any) {
        if (!cancelled) { setError({ code: "network", message: `Connection dropped: ${e?.message || e}` }); setState("error"); }
      } finally { clearInterval(tick); }
    })();
    return () => { cancelled = true; clearInterval(tick); };
  }, [slug, name, q, composioSlug, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const panel = state === "running" || state === "error" || (state === "done" && !!trace)
    ? <Investigation lanes={lanes} state={state} elapsed={elapsed} error={error} onRetry={error && error.code !== "no_model" ? () => setRun((n) => n + 1) : undefined} collapsed={state === "done"} />
    : null;

  if (graph) return <Guide key={graph.slug + state} graph={graph} initialNeed={{ caps, profile }} trace={trace} live={panel} />;
  return (
    <main className="mx-auto max-w-[1080px] px-4 pb-16 sm:px-6">
      <div className="border-b rule py-3"><p className="label">Investigating · not in the library yet</p></div>
      <section className="pt-7">
        <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[48px]">{name}</h1>
        {state === "error" ? (
          <p className="mt-3 max-w-[860px] text-[19px] leading-snug sm:text-[22px]"><span className="font-semibold">No plan yet.</span> <span className="text-ink-2">{error?.message}</span></p>
        ) : (
          <p className="mt-3 max-w-[860px] text-[19px] leading-snug text-ink-2 sm:text-[22px]">Reading {name}&apos;s docs and testing its endpoints. Every fact is checked against its source before it reaches your plan.</p>
        )}
      </section>
      {panel}
    </main>
  );
}

function Investigation({ lanes, state, elapsed, error, onRetry, collapsed }: { lanes: Record<StageId, Lane>; state: string; elapsed: number; error?: { code?: string; message: string }; onRetry?: () => void; collapsed?: boolean }) {
  const body = (
    <div className="grid border-t border-ink sm:grid-cols-5">
      {LANES.map((l, i) => {
        const lane = lanes[l.id];
        return (
          <div key={l.id} className={`min-w-0 border-b rule px-3 py-3 sm:border-b-0 ${i ? "sm:border-l" : ""}`} aria-label={`${l.label} lane`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="mono text-[11px] font-semibold uppercase tracking-[0.06em]">
                <span className={lane.status === "running" ? "blink text-signal" : lane.status === "warn" ? "text-amber" : lane.status === "done" ? "text-ink" : "text-ink-3"}>
                  {lane.status === "done" ? "✓" : lane.status === "warn" ? "!" : lane.status === "running" ? "●" : lane.status === "skipped" ? "–" : "○"}
                </span>{" "}{l.label}
              </p>
              {lane.ms ? <span className="mono num text-[11px] text-ink-3">{(lane.ms / 1000).toFixed(1)}s</span> : null}
            </div>
            <p className="mt-0.5 text-[12px] text-ink-3">{lane.detail || l.does}</p>
            {lane.facts.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {lane.facts.slice(-6).map((f) => (
                  <li key={f.id} className="tick-in grid grid-cols-[12px_1fr] gap-x-1.5 text-[12.5px] leading-snug">
                    <span className="pt-1">{f.status === "corrected" ? <span className="mono text-[10px] text-signal-ink">↻</span> : <Ev s={f.status} />}</span>
                    <span className={`min-w-0 break-words ${f.struck ? "text-ink-3 line-through decoration-ink-3" : ""}`}>
                      {f.claim.length > 110 ? f.claim.slice(0, 110) + "…" : f.claim}
                      {f.note && <span className="block text-[11.5px] text-amber no-underline">{f.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
  const head = (
    <div className="flex items-center justify-between px-3 py-2">
      <p className="mono text-[11px] uppercase tracking-[0.06em]">{state === "running" ? <><span className="blink text-signal">●</span> Investigating</> : state === "error" ? "Stopped" : "Investigation"}</p>
      <p className="mono num text-[11px] text-ink-3">{elapsed}s</p>
    </div>
  );
  return (
    <section className="mt-6 border border-ink bg-surface" aria-label="Investigation" aria-live="polite">
      {collapsed ? (
        <details>
          <summary className="flex items-center justify-between px-3 py-2"><span className="mono text-[11px] uppercase tracking-[0.06em]"><span className="chev mr-2 text-[10px]">▶</span>How this plan was found</span><span className="mono num text-[11px] text-ink-3">{elapsed}s</span></summary>
          {body}
        </details>
      ) : <>{head}{body}</>}
      {error && (
        <div className="border-t border-ink px-3 py-3">
          <p className="text-[14px]">{error.message}</p>
          {onRetry && <button onClick={onRetry} className="mono mt-2 border border-ink px-3 py-1 text-[12px] uppercase hover:bg-shade">Retry</button>}
        </div>
      )}
    </section>
  );
}
