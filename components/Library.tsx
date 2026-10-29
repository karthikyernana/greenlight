"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";
import { AppLogo, ComposioBadge, DiffPill } from "./bits";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "self-serve", label: "Self-serve" },
  { id: "review", label: "Review required" },
  { id: "security-review", label: "Security review" },
  { id: "partner-only", label: "Partner-only" },
  { id: "paid", label: "Paid" },
  { id: "managed", label: "Composio-managed" },
];

export default function Library({ index, curatedCount }: { index: IndexEntry[]; curatedCount: number }) {
  const [f, setF] = useState("all");
  const [mine, setMine] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("gl:guide:"));
      setMine(keys.map((k) => { const g = JSON.parse(localStorage.getItem(k) || "{}"); return { slug: g.slug, name: g.name }; }).filter((x) => x.slug));
    } catch {}
  }, []);

  const ready = index.filter((i) => i.curated || i.generated);
  const shown = useMemo(() => ready.filter((i) => f === "all" || (f === "managed" ? i.managed === "available" : i.tags?.includes(f))), [ready, f]);
  const rest = index.filter((i) => !i.curated && !i.generated);
  const [q, setQ] = useState("");
  const restShown = rest.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <section id="library" className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-3xl">Ready guides</h2>
          <p className="text-sm text-ink-3">{curatedCount} hand-researched{ready.length > curatedCount ? ` + ${ready.length - curatedCount} agent-generated` : ""} · worst-case difficulty and approval wait across all scopes</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((x) => (
            <button key={x.id} onClick={() => setF(x.id)}
              className={`rounded-full border px-3 py-1 text-[13px] transition ${f === x.id ? "border-ink bg-ink text-white" : "hairline bg-card text-ink-2 hover:border-ink-3"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((i) => (
          <Link key={i.slug} href={`/guide/${i.slug}`} className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:border-ink-3 hover:shadow-[0_10px_30px_-18px_rgba(40,35,20,.35)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <AppLogo slug={i.composioSlug || i.slug} name={i.name} size={34} />
                <div>
                  <div className="font-semibold leading-tight">{i.name}</div>
                  <div className="text-xs text-ink-3">{i.category}{i.generated ? " · agent-generated" : ""}</div>
                </div>
              </div>
              <DiffPill label={i.difficulty || "?"} />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-3">Typical agent use</div>
                <div className="display text-2xl leading-none">{i.wait}</div>
                {i.maxWait && i.maxWait !== i.wait && <div className="mt-1 text-xs text-ink-3">up to {i.maxWait.split("–").pop()?.replace("~", "")} with every scope</div>}
              </div>
              <ComposioBadge managed={i.managed} />
            </div>
          </Link>
        ))}
        {shown.length === 0 && <p className="text-sm text-ink-3">No ready guides match this filter yet.</p>}
      </div>

      {mine.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-ink-2">Guides you generated on this device</h3>
          <div className="flex flex-wrap gap-2">
            {mine.map((m) => <Link key={m.slug} href={`/guide/${m.slug}`} className="pill tone-mute hover:bg-line">{m.name} →</Link>)}
          </div>
        </div>
      )}

      <div className="mt-14">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-3xl">The next {rest.length}</h2>
            <p className="max-w-2xl text-sm text-ink-3">OAuth toolkits from Composio's directory. Managed-auth status was checked live from docs.composio.dev on 2026-10-30. Click any one and the agent researches it and writes its guide in about a minute.</p>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="card w-44 px-3 py-1.5 text-sm outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
          {restShown.map((i) => (
            <Link key={i.slug} href={`/generate?q=${encodeURIComponent(i.name)}&slug=${i.slug}`} className="group flex items-center justify-between border-b hairline py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`dot shrink-0 ${i.managed === "available" ? "text-go" : "text-wait"}`} title={i.managed === "available" ? "Composio-managed OAuth available" : "Bring your own OAuth app"} />
                <span className="truncate">{i.name}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-3 opacity-0 transition group-hover:opacity-100">Generate →</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 flex gap-4 text-xs text-ink-3"><span><span className="dot text-go" /> Composio-managed OAuth</span><span><span className="dot text-wait" /> Bring your own app</span></p>
      </div>
    </section>
  );
}
