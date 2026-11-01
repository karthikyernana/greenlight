"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Guide, Step } from "@/lib/types";
import { buildKit, kitMarkdown } from "@/lib/kit";
import { animate } from "./motion";
import { Icon } from "./ui";

export { copyText } from "@/lib/copy";
import { copyText } from "@/lib/copy";

/** One drawer with everything an agent can produce right now. Deterministic, instant, no model call. */
export default function SetupKit({ g, sel, shareUrl, onClose, planned }: { g: Guide; sel: string[]; shareUrl: string; onClose: () => void; planned?: { steps: Step[]; wait: string } }) {
  const kit = useMemo(() => buildKit(g, sel, shareUrl, planned), [g, sel, shareUrl, planned]);
  const [copied, setCopied] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    animate(panel.current, mobile ? [{ transform: "translateY(24px)", opacity: 0 }, { transform: "none", opacity: 1 }] : [{ transform: "translateX(24px)", opacity: 0 }, { transform: "none", opacity: 1 }], "sheet");
    animate(backdrop.current, [{ opacity: 0 }, { opacity: 1 }], "gentle");
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
    const blob = new Blob([kitMarkdown(g, sel, shareUrl, planned)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${g.slug}-oauth-setup-kit.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const caps = g.capabilities.filter((c) => sel.includes(c.id)).map((c) => c.label);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={`${g.name} setup kit`}>
      <button ref={backdrop} className="sheet-backdrop absolute inset-0" aria-label="Close setup kit" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-[18px] border rule bg-surface shadow-[var(--shadow-3)] outline-none focus-visible:outline-none sm:m-3 sm:h-auto sm:max-w-[600px] sm:rounded-[18px]">
        <div className="flex items-start justify-between gap-3 border-b rule px-5 py-4">
          <div className="min-w-0">
            <p className="label">Setup kit · {kit.length} artifacts · ready now</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em]">{g.name}</h2>
            <p className="mt-0.5 clamp-1 text-[13px] text-ink-2" title={caps.join(", ")}>For: {caps.join(", ")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={download} className="btn btn-primary h-9 text-[13px]">Download .md</button>
            <button onClick={onClose} className="btn h-9 w-9 !px-0" aria-label="Close"><Icon name="close" /></button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b rule px-5 py-2" aria-label="Kit sections">
          {kit.map((k, i) => (
            <a key={k.id} href={`#kit-${k.id}`} className="mono shrink-0 rounded-[6px] px-2 py-1 text-[11px] uppercase tracking-[0.04em] text-ink-2 hover:bg-shade">
              {String(i + 1).padStart(2, "0")} {k.title}
            </a>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto px-5 pb-10">
          {kit.map((k, i) => (
            <section key={k.id} id={`kit-${k.id}`} className="border-b rule py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold"><span className="mono mr-2 text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>{k.title}</h3>
                <button onClick={() => copy(k.id, k.body)} className={`btn h-7 shrink-0 px-2.5 text-[12px] ${copied === k.id ? "!border-ok !bg-ok-wash !text-ok" : ""}`}>
                  {copied === k.id ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-3">{k.hint}</p>
              <pre className="mono mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] border rule bg-surface p-3 text-[12px] leading-[1.55] text-ink [overflow-wrap:anywhere]">{k.body}</pre>
            </section>
          ))}
          <p className="mt-4 text-[12px] text-ink-3">Built from this guide and your selected capabilities. Nothing is sent anywhere. The agent can't sign in, pay, prove your identity, record video or click Submit; those stay with you.</p>
        </div>
      </div>
    </div>
  );
}
