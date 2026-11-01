/* "Your apps": pinned + recently viewed guides, kept in this browser (localStorage). No login on purpose:
   a demo that asks for sign-up loses people before they see a plan. Future: sync to a Composio account. */

export type ShelfItem = { slug: string; name: string; wait?: string; status?: "curated" | "verified" | "draft"; at: number; href?: string };
export type Shelf = { pinned: ShelfItem[]; recent: ShelfItem[] };

const KEY = "gl:shelf:v1";
const MAX_RECENT = 8;
const MAX_PINNED = 12;
const EVENT = "gl:shelf";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const store = (): Storage | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function readShelf(s: Storage | null = store()): Shelf {
  try {
    const j = JSON.parse(s?.getItem(KEY) || "null");
    if (j && Array.isArray(j.pinned) && Array.isArray(j.recent)) return { pinned: j.pinned, recent: j.recent };
  } catch {}
  return { pinned: [], recent: [] };
}

function write(sh: Shelf, s: Storage | null = store()) {
  try { s?.setItem(KEY, JSON.stringify(sh)); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
  return sh;
}

/** Pure update functions (tested). */
export function withVisit(sh: Shelf, it: Omit<ShelfItem, "at">, now = Date.now()): Shelf {
  const recent = [{ ...it, at: now }, ...sh.recent.filter((x) => x.slug !== it.slug)].slice(0, MAX_RECENT);
  const pinned = sh.pinned.map((p) => (p.slug === it.slug ? { ...p, ...it, at: p.at } : p));
  return { pinned, recent };
}
export function withPin(sh: Shelf, it: Omit<ShelfItem, "at">, on: boolean, now = Date.now()): Shelf {
  const rest = sh.pinned.filter((x) => x.slug !== it.slug);
  return { ...sh, pinned: on ? [{ ...it, at: now }, ...rest].slice(0, MAX_PINNED) : rest };
}
export const isPinned = (sh: Shelf, slug: string) => sh.pinned.some((x) => x.slug === slug);

export const recordVisit = (it: Omit<ShelfItem, "at">) => write(withVisit(readShelf(), it));
export const setPinned = (it: Omit<ShelfItem, "at">, on: boolean) => write(withPin(readShelf(), it, on));
export function forgetRecent(slug: string) { const sh = readShelf(); return write({ ...sh, recent: sh.recent.filter((x) => x.slug !== slug) }); }

export function onShelfChange(cb: () => void) {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  window.addEventListener("storage", h);
  return () => { window.removeEventListener(EVENT, h); window.removeEventListener("storage", h); };
}
