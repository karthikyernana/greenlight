"use client";
import { useEffect, useState } from "react";
import type { Trace } from "@/lib/pipeline/trace";
import { TraceSummary } from "./Guide";

/** A run's trace: from this browser, the server instance that ran it, or the eval traces shipped in /traces. */
export default function TraceView({ id }: { id: string }) {
  const [t, setT] = useState<Trace | null>(null);
  const [miss, setMiss] = useState(false);
  useEffect(() => {
    (async () => {
      try { const l = localStorage.getItem(`gl:trace:${id}`); if (l) return setT(JSON.parse(l)); } catch {}
      for (const u of [`/api/trace/${id}`, `/traces/${id}.json`]) {
        const r = await fetch(u).catch(() => null);
        if (r?.ok) return setT(await r.json());
      }
      setMiss(true);
    })();
  }, [id]);
  if (miss) return <main className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6"><h1 className="text-[28px] font-semibold">Trace not found</h1><p className="mt-2 text-ink-2">Traces live in the browser that ran them, on the server instance for a while, and in /traces for harness runs.</p></main>;
  if (!t) return <main className="mx-auto max-w-[1080px] px-4 py-10 sm:px-6"><div className="skel h-8 w-64" /></main>;
  const t0 = Date.parse(t.startedAt);
  return (
    <main className="mx-auto max-w-[1080px] px-4 pb-16 sm:px-6">
      <div className="border-b rule py-3"><p className="label">Run trace · {t.id} · {new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC</p></div>
      <h1 className="pt-6 text-[32px] font-semibold tracking-[-0.02em]">{t.app}</h1>
      <p className="mt-1 text-[15px] text-ink-2">
        {t.outcome === "ok" ? "Finished" : t.outcome === "partial" ? "Finished with gaps" : "Stopped"} in {(t.ms / 1000).toFixed(1)}s · {(t.tokens.prompt + t.tokens.completion).toLocaleString()} of {t.tokens.budget.toLocaleString()} tokens{t.error ? ` · ${t.error}` : ""}
      </p>
      <section className="mt-6"><p className="label mb-2">Stages</p><TraceSummary t={t} /></section>
      <section className="mt-8">
        <p className="label mb-2">Model calls</p>
        <table className="w-full text-left text-[12.5px]">
          <thead><tr className="label border-b border-ink"><th className="py-1.5 font-normal">Stage</th><th className="font-normal">Model</th><th className="font-normal">Time</th><th className="font-normal">Tokens</th><th className="font-normal">Result</th></tr></thead>
          <tbody>{t.llm.map((c, i) => <tr key={i} className="mono border-b rule"><td className="py-1.5">{c.stage}</td><td className="break-all">{c.model}</td><td className="num">{(c.ms / 1000).toFixed(1)}s</td><td className="num">{c.prompt + c.completion}</td><td className={c.ok ? "" : "text-amber"}>{c.ok ? (c.repaired ? "ok after repair" : "ok") : (c.error || "failed").slice(0, 60)}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="mt-8">
        <p className="label mb-2">Tool calls</p>
        <ul className="space-y-1">
          {t.tools.map((x, i) => <li key={i} className="mono grid grid-cols-[64px_56px_1fr] gap-2 text-[12px]"><span className="text-ink-3">{x.stage}</span><span className={x.ok ? "" : "text-amber"}>{x.kind}</span><span className="min-w-0 break-all">{x.target}{x.via ? <span> · via {x.via}</span> : null}{x.note ? <span className="text-ink-3"> · {x.note}</span> : null}</span></li>)}
        </ul>
      </section>
      {t.decisions?.length ? (
        <section className="mt-8">
          <p className="label mb-2">Decisions · who decided</p>
          <table className="w-full text-left text-[12.5px]">
            <thead><tr className="label border-b border-ink"><th className="py-1.5 font-normal">Stage</th><th className="font-normal">Subject</th><th className="font-normal">Answer</th><th className="font-normal">Decided by</th></tr></thead>
            <tbody>{t.decisions.map((d, i) => <tr key={i} className="mono border-b rule"><td className="py-1.5">{d.stage}</td><td className="break-all">{d.target}</td><td>{d.value}</td><td className={d.engine === "jev" ? "" : "text-ink-3"}>{d.engine === "jev" ? `Jev ${d.p?.toFixed(2)}` : d.engine === "llm" ? "LLM" : d.engine}{d.note ? ` · ${d.note}` : ""}</td></tr>)}</tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
