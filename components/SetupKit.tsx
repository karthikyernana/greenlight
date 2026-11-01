"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Guide } from "@/lib/types";
import { buildKit, kitMarkdown } from "@/lib/kit";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}

/** One drawer with everything an agent can produce right now. Deterministic, instant, no model call. */
export default function SetupKit({ g, sel, shareUrl, onClose }: { g: Guide; sel: string[]; shareUrl: string; onClose: () => void }) {
  const kit = useMemo(() => buildKit(g, sel, shareUrl), [g, sel, shareUrl]);
  const [copied, setCopied] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);

  const copy = async (id: string, text: string) => {
    await copyText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 1600);
  };
  const download = () => {
    const blob = new Blob([kitMarkdown(g, sel, shareUrl)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${g.slug}-oauth-setup-kit.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const caps = g.capabilities.filter((c) => sel.includes(c.id)).map((c) => c.label);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${g.name} setup kit`}>
      <button className="absolute inset-0 bg-ink/30" aria-label="Close setup kit" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="relative flex h-full w-full max-w-[600px] flex-col border-l border-ink bg-paper outline-none fill-in">
        <div className="flex items-start justify-between gap-3 border-b border-ink px-5 py-4">
          <div className="min-w-0">
            <p className="label">Setup kit · {kit.length} artifacts · ready now</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em]">{g.name}</h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-2">For: {caps.join(", ")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={download} className="h-9 border border-ink bg-ink px-3 text-[13px] font-medium text-white hover:bg-ink-2">Download .md</button>
            <button onClick={onClose} className="h-9 w-9 border border-ink text-[16px]" aria-label="Close">×</button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b rule px-5 py-2" aria-label="Kit sections">
          {kit.map((k, i) => (
            <a key={k.id} href={`#kit-${k.id}`} className="mono shrink-0 px-1.5 py-1 text-[11px] uppercase tracking-[0.04em] text-ink-2 hover:bg-shade">
              {String(i + 1).padStart(2, "0")} {k.title}
            </a>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto px-5 pb-10">
          {kit.map((k, i) => (
            <section key={k.id} id={`kit-${k.id}`} className="border-b rule py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold"><span className="mono mr-2 text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>{k.title}</h3>
                <button onClick={() => copy(k.id, k.body)} className={`mono h-7 shrink-0 border px-2 text-[11px] uppercase ${copied === k.id ? "border-signal bg-signal text-ink" : "border-ink hover:bg-ink hover:text-white"}`}>
                  {copied === k.id ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-3">{k.hint}</p>
              <pre className="mono mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-words border rule bg-surface p-3 text-[12px] leading-[1.55] text-ink">{k.body}</pre>
            </section>
          ))}
          <p className="mt-4 text-[12px] text-ink-3">Built from this guide and your selected capabilities. Nothing is sent anywhere. The agent can't sign in, pay, prove your identity, record video or click Submit; those stay with you.</p>
        </div>
      </div>
    </div>
  );
}
