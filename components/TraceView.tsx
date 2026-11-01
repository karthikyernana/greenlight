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
  if (miss) return <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6"><h1 className="text-[28px] font-semibold">Trace not found</h1><p className="mt-2 text-ink-2">Traces live in the browser that ran them, on the server instance for a while, and in /traces for harness runs.</p></main>;
  if (!t) return <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6"><div className="skel h-8 w-64" /></main>;
  const t0 = Date.parse(t.startedAt);
  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 pt-5 text-[13px] text-ink-3"><a href="/" className="rounded px-1 hover:text-ink">Apps</a><span aria-hidden>/</span><span className="clamp-1">Run trace</span></nav>
      <h1 className="pt-5 text-[32px] font-semibold tracking-[-0.02em]">{t.app}</h1>
      <p className="label mt-1 !normal-case">Trace {t.id} · {new Date(t0).toISOString().slice(0, 16).replace("T", " ")} UTC</p>
      <p className="mt-1 text-[15px] text-ink-2">
        {t.outcome === "ok" ? "Finished" : t.outcome === "partial" ? "Finished with gaps" : "Stopped"} in {(t.ms / 1000).toFixed(1)}s · {(t.tokens.prompt + t.tokens.completion).toLocaleString()} of {t.tokens.budget.toLocaleString()} tokens{t.error ? ` · ${t.error}` : ""}
      </p>
      <section className="panel mt-6 p-4 sm:p-5"><h2 className="mb-2 text-[15px] font-semibold">Stages</h2><TraceSummary t={t} /></section>
      <section className="panel mt-4 overflow-x-auto p-4 sm:p-5">
        <h2 className="mb-2 text-[15px] font-semibold">Model calls</h2>
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead><tr className="label border-b rule"><th className="py-1.5 font-normal">Stage</th><th className="font-normal">Model</th><th className="font-normal">Time</th><th className="font-normal">Tokens</th><th className="font-normal">Result</th></tr></thead>
          <tbody>{t.llm.map((c, i) => <tr key={i} className="mono whitespace-nowrap border-b rule"><td className="py-1.5 pr-4">{c.stage}</td><td className="pr-4">{c.model}</td><td className="num pr-4">{(c.ms / 1000).toFixed(1)}s</td><td className="num pr-4">{c.prompt + c.completion}</td><td className={c.ok ? "" : "text-amber"} title={c.error}>{c.ok ? (c.repaired ? "ok after repair" : "ok") : /429/.test(c.error || "") ? "rate limited (429)" : /timed out/.test(c.error || "") ? "timed out" : (c.error || "failed").replace(/^[^ ]+ /, "").slice(0, 40)}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="panel mt-4 p-4 sm:p-5">
        <h2 className="mb-2 text-[15px] font-semibold">Tool calls</h2>
        <ul className="space-y-1">
          {t.tools.map((x, i) => <li key={i} className="mono grid grid-cols-[64px_56px_minmax(0,1fr)] gap-2 border-b rule py-1 text-[12px] last:border-b-0"><span className="text-ink-3">{x.stage}</span><span className={x.ok ? "" : "text-amber"}>{x.kind}</span><span className="min-w-0 break-all">{x.target}{x.via ? <span> · via {x.via}</span> : null}{x.note ? <span className="text-ink-3"> · {x.note}</span> : null}</span></li>)}
        </ul>
      </section>
      {t.decisions?.length ? (
        <section className="panel mt-4 overflow-x-auto p-4 sm:p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Decisions · who decided</h2>
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead><tr className="label border-b rule"><th className="py-1.5 font-normal">Stage</th><th className="font-normal">Subject</th><th className="font-normal">Answer</th><th className="font-normal">Decided by</th></tr></thead>
            <tbody>{t.decisions.map((d, i) => <tr key={i} className="mono border-b rule align-top"><td className="py-1.5 pr-4">{d.stage}</td><td className="pr-4">{d.target}</td><td className="pr-4">{d.value}</td><td className={d.engine === "jev" ? "" : "text-ink-3"}>{d.engine === "jev" ? `Jev ${d.p?.toFixed(2)}` : d.engine === "llm" ? "LLM" : d.engine}{d.note ? ` · ${d.note}` : ""}</td></tr>)}</tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
