import type { IndexEntry } from "./types";
import { slugify } from "./urlstate";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Rank library entries for a query. Empty query returns everything in board order. */
export function match(index: IndexEntry[], q: string): IndexEntry[] {
  const t = q.trim();
  if (!t) return index;
  const n = norm(t);
  const s = slugify(t);
  const scored = index
    .map((e) => {
      const name = norm(e.name);
      const keys = [e.slug, e.composioSlug || ""].map(norm);
      let score = 0;
      if (keys.includes(n) || e.slug === s || name === n) score = 100;
      else if (name.startsWith(n) || keys.some((k) => k.startsWith(n))) score = 60;
      else if (name.includes(n) || keys.some((k) => k.includes(n))) score = 30;
      else if (n.length >= 3 && (e.category || "").toLowerCase().includes(t.toLowerCase())) score = 10;
      if (score && (e.curated || e.generated)) score += 5;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.e);
}

/** Where Enter goes: a ready guide opens instantly; anything else starts live generation on the same page. */
export function hrefFor(e: IndexEntry | null, q: string): string {
  if (e && (e.curated || e.generated)) return `/guide/${e.slug}`;
  if (e) return `/guide/${e.slug}?q=${encodeURIComponent(e.name)}${e.composioSlug ? `&cs=${encodeURIComponent(e.composioSlug)}` : ""}`;
  const t = q.trim();
  return `/guide/${slugify(t)}?q=${encodeURIComponent(t)}`;
}

/** Is the query an exact hit (so Enter should open it rather than investigate something new)? */
export function exact(index: IndexEntry[], q: string): IndexEntry | null {
  const n = norm(q), s = slugify(q);
  if (!n) return null;
  return index.find((e) => e.slug === s || norm(e.name) === n || norm(e.composioSlug || "") === n) || null;
}
