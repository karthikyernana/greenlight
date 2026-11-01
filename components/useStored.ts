"use client";
import { useEffect, useState } from "react";
import type { StoredLite } from "@/lib/command";

let cache: { at: number; v: StoredLite[] } | null = null;
let inflight: Promise<StoredLite[]> | null = null;

/** Stored guides (drafts included), fetched once per minute per tab; `enabled` delays the fetch until the bar is used. */
export function useStored(initial: StoredLite[] = [], enabled = true) {
  const [v, setV] = useState<StoredLite[]>(cache?.v || initial);
  useEffect(() => {
    if (!enabled) return;
    if (cache && Date.now() - cache.at < 60_000) { setV(cache.v); return; }
    inflight ??= fetch("/api/store").then((r) => (r.ok ? r.json() : { guides: [] })).then((j) => (j.guides || []) as StoredLite[]).catch(() => []).finally(() => { inflight = null; });
    let live = true;
    inflight.then((g) => { cache = { at: Date.now(), v: g }; if (live) setV(g); });
    return () => { live = false; };
  }, [enabled]);
  return v;
}
