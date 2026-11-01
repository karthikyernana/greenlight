"use client";
import { useEffect, useRef, useState } from "react";
import { Guide } from "@/lib/types";
import { decodeGuideHash, guideHref } from "@/lib/urlstate";
import GuideView, { type Live, type LiveRow, type PartialGuide } from "./GuideView";

const PLAN: LiveRow[] = [
  { id: "composio", label: "Composio directory: is it managed?", status: "pending" },
  { id: "research", label: "Research OAuth setup, scopes and app review", status: "pending" },
  { id: "probe", label: "Live probes: discovery, developer portal, authorize", status: "pending" },
  { id: "read", label: "Read the official pages", status: "pending" },
  { id: "write", label: "Structure: scopes → tiers, critical path, agent vs you", status: "pending" },
];

type Ev =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "warn"; detail?: string }
  | { type: "patch"; patch: Partial<Guide> }
  | { type: "guide"; guide: Guide; cached?: boolean }
  | { type: "error"; code?: string; message: string };

/**
 * Guides that aren't in the library: restore from the share URL (#g=) or this browser,
 * otherwise investigate live. Streams into the same layout as a library guide.
 */
export default function LiveGuide({ slug, name, q, composioSlug, need }: { slug: string; name: string; q?: string; composioSlug?: string; need?: string[] }) {
  const [guide, setGuide] = useState<PartialGuide>({ slug, name });
  const [rows, setRows] = useState<LiveRow[]>(PLAN);
  const [state, setState] = useState<Live["state"] | "restored" | "idle">("idle");
  const [error, setError] = useState<Live["error"]>();
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const t0 = useRef(0);
  const stepStart = useRef<Record<string, number>>({});

  useEffect(() => {
    if (run === 0) {
      const fromHash = decodeGuideHash(window.location.hash);
      let restored: Guide | null = fromHash;
      if (!restored) {
        try {
          const raw = localStorage.getItem(`gl:guide:${slug}`);
          const p = raw ? Guide.safeParse(JSON.parse(raw)) : null;
          if (p?.success) restored = p.data;
        } catch {}
      }
      if (restored) {
        localStorage.setItem(`gl:guide:${restored.slug}`, JSON.stringify(restored));
        setGuide(restored);
        setState("restored");
        return;
      }
    }
    let cancelled = false;
    setGuide({ slug, name });
    setRows(PLAN);
    setError(undefined);
    setState("running");
    t0.current = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0.current) / 1000)), 250);
    (async () => {
      try {
        const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: q || name, slug, composioSlug, fresh: run > 0 }) });
        if (!res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let finished = false;
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as Ev;
            if (ev.type === "step") {
              const now = Date.now();
              if (ev.status === "running") stepStart.current[ev.id] = now;
              setRows((r) => {
                const i = r.findIndex((x) => x.id === ev.id);
                const row: LiveRow = { id: ev.id, label: ev.label, status: ev.status, detail: ev.detail, ms: ev.status !== "running" && stepStart.current[ev.id] ? now - stepStart.current[ev.id] : undefined };
                if (i < 0) return [...r, row];
                const n = [...r];
                n[i] = { ...n[i], ...row, detail: row.detail ?? n[i].detail };
                return n;
              });
            } else if (ev.type === "patch") {
              setGuide((g) => ({ ...g, ...ev.patch, slug, name: ev.patch.name || g.name }));
            } else if (ev.type === "guide") {
              const g = Guide.parse({ ...ev.guide, slug });
              localStorage.setItem(`gl:guide:${slug}`, JSON.stringify(g));
              window.history.replaceState(null, "", guideHref(g, need, { embed: true }));
              setGuide(g);
              setState("done");
              finished = true;
            } else if (ev.type === "error") {
              setError({ code: ev.code, message: ev.message });
              setRows((r) => r.map((x) => (x.status === "pending" || x.status === "running" ? { ...x, status: "pending" } : x)));
              setState("error");
              finished = true;
            }
          }
        }
        if (!finished && !cancelled) { setError({ message: "The connection closed before the agent finished." }); setState("error"); }
      } catch (e: any) {
        if (!cancelled) { setError({ code: "network", message: `Connection dropped: ${e?.message || e}` }); setState("error"); }
      } finally {
        clearInterval(tick);
      }
    })();
    return () => { cancelled = true; clearInterval(tick); };
  }, [slug, name, q, composioSlug, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const live: Live | undefined =
    state === "running" || state === "error" || state === "done"
      ? { rows, state, error, elapsed, onRetry: state === "error" && error?.code !== "no_model" ? () => setRun((n) => n + 1) : undefined }
      : undefined;

  if (state === "idle") return <GuideView guide={{ slug, name }} />;
  return <GuideView key={state === "restored" ? "r" : "l"} guide={guide} initialNeed={need} live={live} />;
}
