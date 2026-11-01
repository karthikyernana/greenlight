/* The command bar's brain, shared by the Home bar and the header bar.
   Before anything is generated, the query is matched against the library AND the shared store (exact, then fuzzy
   name/domain), so nobody triggers a fresh investigation for an app that already has a guide. */
import type { IndexEntry } from "./types";
import { exact, hrefFor, match } from "./search";
import { sameApp, canonicalSlug } from "./canonical";

export type StoredLite = { slug: string; name: string; domain?: string; keys?: string[]; status: "curated" | "verified" | "draft" };
export type CmdRow =
  | { kind: "open"; entry: IndexEntry; href: string }
  | { kind: "stored"; item: StoredLite; href: string; fuzzy: boolean }
  | { kind: "investigate"; q: string; href: string };

const ready = (e: IndexEntry) => !!(e.curated || e.generated || e.stored);

export function commandRows(index: IndexEntry[], stored: StoredLite[], q: string, limit = 8): CmdRow[] {
  const t = q.trim();
  if (!t) return [];
  const rows: CmdRow[] = [];
  const seen = new Set<string>();
  const hit = exact(index, t);
  // stored guides (drafts included) that are the same app: exact canonical slug or a fuzzy match
  const storedHits = stored
    .map((s) => ({ s, score: s.slug === canonicalSlug(t) ? 1 : sameApp(t, [s.slug, s.name, s.domain || "", ...(s.keys || [])]) }))
    .filter((x) => x.score >= 0.7)
    .sort((a, b) => b.score - a.score);
  const libHits = match(index, t);
  // fuzzy library hits the substring matcher misses ("dropbx", "hubspt", "developers.notion.com")
  const fuzzyLib = libHits.length ? [] : index.filter((e) => sameApp(t, [e.slug, e.name, e.domain || "", e.composioSlug || ""]) >= 0.8);
  for (const e of [...(hit ? [hit] : []), ...libHits, ...fuzzyLib]) {
    if (seen.has(e.slug)) continue;
    seen.add(e.slug);
    const st = storedHits.find((x) => x.s.slug === e.slug);
    if (!ready(e) && st) { rows.push({ kind: "stored", item: st.s, href: `/guide/${st.s.slug}`, fuzzy: st.score < 1 }); continue; }
    rows.push({ kind: "open", entry: e, href: hrefFor(e, t) });
  }
  for (const { s, score } of storedHits) {
    if (seen.has(s.slug)) continue;
    seen.add(s.slug);
    rows.unshift({ kind: "stored", item: s, href: `/guide/${s.slug}`, fuzzy: score < 1 });
  }
  // a ready guide whose name starts with what was typed means the user is still typing it: don't offer a new run
  const prefixReady = libHits.some((e) => ready(e) && (e.name.toLowerCase().startsWith(t.toLowerCase()) || e.slug.startsWith(canonicalSlug(t))));
  const covered = !!hit || prefixReady || storedHits.some((x) => x.score >= 0.8) || fuzzyLib.length > 0;
  const out = rows.slice(0, limit);
  if (!covered) out.push({ kind: "investigate", q: t, href: hrefFor(null, t) });
  return out;
}
