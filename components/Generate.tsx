"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { compressToEncodedURIComponent } from "lz-string";
import { Guide } from "@/lib/types";
import { defaultSelection } from "@/lib/plan";
import GuideView from "./GuideView";

type Ev = { type: "step"; id: string; label: string; status: "running" | "done" | "warn"; detail?: string } | { type: "guide"; guide: Guide; cached?: boolean } | { type: "error"; message: string };
type Row = { id: string; label: string; status: "running" | "done" | "warn"; detail?: string; t0: number; t1?: number };

const PLAN = [
  { id: "composio", label: "Check Composio's toolkit directory" },
  { id: "research", label: "Search the provider's developer docs" },
  { id: "probe", label: "Probe OAuth/OIDC endpoints live" },
  { id: "read", label: "Read the official pages" },
  { id: "write", label: "Write the scope-aware guide" },
];

export default function Generate() {
  const sp = useSearchParams();
  const q = (sp.get("q") || "").trim();
  const slugHint = sp.get("slug") || undefined;
  const [rows, setRows] = useState<Row[]>([]);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    setRows([]); setError(""); setGuide(null);
    started.current = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 250);
    (async () => {
      try {
        const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q, slug: slugHint, fresh: run > 0 }) });
        if (!res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done || cancelled) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as Ev;
            if (ev.type === "step") {
              setRows((r) => {
                const i = r.findIndex((x) => x.id === ev.id);
                if (i < 0) return [...r, { id: ev.id, label: ev.label, status: ev.status, detail: ev.detail, t0: Date.now() }];
                const n = [...r];
                n[i] = { ...n[i], label: ev.label, status: ev.status, detail: ev.detail ?? n[i].detail, t1: ev.status !== "running" ? Date.now() : undefined };
                return n;
              });
            } else if (ev.type === "guide") {
              const g = Guide.parse(ev.guide);
              localStorage.setItem(`gl:guide:${g.slug}`, JSON.stringify(g));
              const u = new URL(`/guide/${g.slug}`, window.location.origin);
              u.searchParams.set("need", defaultSelection(g).join(","));
              u.hash = `g=${compressToEncodedURIComponent(JSON.stringify(g))}`;
              window.history.replaceState(null, "", u.toString());
              setGuide(g);
            } else if (ev.type === "error") {
              setError(ev.message);
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(`Connection dropped: ${e?.message || e}. Try again.`);
      } finally {
        clearInterval(tick);
      }
    })();
    return () => { cancelled = true; clearInterval(tick); };
  }, [q, slugHint, run]);

  if (guide) return <div className="rise"><GuideView guide={guide} /></div>;
  if (!q) return <main className="mx-auto max-w-2xl px-5 py-20"><p>Type an app name on the <Link className="underline" href="/">home page</Link>.</p></main>;

  const merged = PLAN.map((p) => rows.find((r) => r.id === p.id) || { id: p.id, label: p.label, status: "pending" as const, t0: 0 });
  return (
    <main className="mx-auto max-w-2xl px-5 pt-8 pb-24">
      <p className="text-sm text-ink-3">Agent investigation · {elapsed}s</p>
      <h1 className="display mt-1 text-5xl">{q}</h1>
      <p className="mt-3 text-ink-2">Working out how to register an OAuth app with {q} and get it approved. When it's done, you get a guide with its own share link.</p>
      <ol className="mt-8 space-y-0">
        {merged.map((r, i) => (
          <li key={r.id} className="relative flex gap-4 pb-6">
            {i < merged.length - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%-22px)] w-px bg-line-2" />}
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
              r.status === "done" ? "border-go bg-go text-white" : r.status === "warn" ? "border-wait bg-wait-bg text-wait" : r.status === "running" ? "border-ink bg-card" : "border-line-2 bg-paper text-ink-3"}`}>
              {r.status === "done" ? "✓" : r.status === "warn" ? "!" : r.status === "running" ? <span className="h-2 w-2 rounded-full bg-ink pulse-soft" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${r.status === "pending" ? "text-ink-3" : ""}`}>{r.label}</div>
              {"detail" in r && r.detail && <div className="mt-0.5 break-words text-[13px] text-ink-2 rise">{r.detail}</div>}
            </div>
            {"t1" in r && r.t1 && r.t0 ? <span className="font-mono text-xs text-ink-3">{((r.t1 - r.t0) / 1000).toFixed(1)}s</span> : null}
          </li>
        ))}
      </ol>
      {error && (
        <div className="card border-l-4 !border-l-wait p-5 rise">
          <p className="font-medium">{error}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setRun((n) => n + 1)} className="rounded-xl bg-ink px-4 py-2 text-sm text-white">Retry</button>
            <Link href="/#library" className="rounded-xl border hairline px-4 py-2 text-sm">Browse ready guides</Link>
          </div>
        </div>
      )}
    </main>
  );
}
