"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readShelf, onShelfChange, setPinned, type Shelf as ShelfT, type ShelfItem } from "@/lib/shelf";
import { useFlip } from "./motion";
import { Icon, StatusBadge } from "./ui";

/** "Your apps": pinned first, then recently viewed (not pinned). Lives in this browser; hidden until there is something. */
export default function Shelf() {
  const [sh, setSh] = useState<ShelfT | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setSh(readShelf()); return onShelfChange(() => setSh(readShelf())); }, []);
  const pinned = sh?.pinned || [];
  const recent = (sh?.recent || []).filter((r) => !pinned.some((p) => p.slug === r.slug)).slice(0, 6);
  useFlip(ref, [pinned.map((p) => p.slug).join(), recent.map((p) => p.slug).join()]);
  if (!sh || (!pinned.length && !recent.length)) return null;
  return (
    <section aria-label="Your apps" className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Your apps</h2>
        <span className="text-[12.5px] text-ink-3">Saved in this browser · no account needed</span>
      </div>
      <div ref={ref} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {pinned.map((it) => <Tile key={`p-${it.slug}`} it={it} pinned />)}
        {recent.map((it) => <Tile key={`r-${it.slug}`} it={it} />)}
      </div>
    </section>
  );
}

function Tile({ it, pinned }: { it: ShelfItem; pinned?: boolean }) {
  return (
    <div data-flip={it.slug} className="panel group relative flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-[var(--shadow-2)]">
      <Link href={it.href || `/guide/${it.slug}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']">
        <span className="flex items-center gap-2">
          <span className="clamp-1 text-[15px] font-medium">{it.name}</span>
          {it.status && it.status !== "curated" && <StatusBadge status={it.status} />}
        </span>
        <span className="mono num mt-0.5 block clamp-1 text-[12px] text-ink-3">{it.wait ? `${it.wait} to live` : "open guide"} · {pinned ? "pinned" : "viewed recently"}</span>
      </Link>
      <button
        type="button"
        onClick={() => setPinned(it, !pinned)}
        className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-[8px] transition-colors hover:bg-shade ${pinned ? "text-ink" : "text-ink-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"}`}
        aria-label={pinned ? `Unpin ${it.name}` : `Pin ${it.name}`}
        aria-pressed={!!pinned}
        title={pinned ? "Unpin" : "Pin"}
      >
        <Icon name={pinned ? "pinned" : "pin"} />
      </button>
    </div>
  );
}
