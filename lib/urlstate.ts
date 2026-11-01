import { canonicalSlug } from "./canonical";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { Guide } from "./types";
import { defaultSelection } from "./plan";

/**
 * Every guide URL is the full state: /guide/<slug>?need=<cap,cap>[#g=<compressed guide>]
 * - `need` = selected capabilities (omitted when it equals the default, so canonical links stay short)
 * - `#g=`  = the whole generated guide, so agent-generated guides survive without a database
 */
export function guideHref(g: Pick<Guide, "slug" | "capabilities"> & Partial<Guide>, sel?: string[], opts: { embed?: boolean; origin?: string } = {}): string {
  const base = `${opts.origin || ""}/guide/${encodeURIComponent(g.slug)}`;
  const def = defaultSelection(g as Guide);
  const s = sel ? cleanSelection(g as Guide, sel) : def;
  const same = s.length === def.length && s.every((x) => def.includes(x));
  const qs = same ? "" : `?need=${s.map(encodeURIComponent).join(",")}`;
  const hash = opts.embed && g.origin === "generated" ? `#g=${compressToEncodedURIComponent(JSON.stringify(g))}` : "";
  return base + qs + hash;
}

/** Keep only ids that exist; fall back to defaults if nothing valid remains. */
export function cleanSelection(g: Guide, ids?: string[] | null): string[] {
  const valid = (ids || []).map((x) => x.trim()).filter((id, i, a) => id && a.indexOf(id) === i && g.capabilities.some((c) => c.id === id));
  return valid.length ? valid : defaultSelection(g);
}

export function parseNeed(raw?: string | string[] | null): string[] | undefined {
  if (!raw) return undefined;
  const s = Array.isArray(raw) ? raw.join(",") : raw;
  const out = s.split(",").map((x) => decodeURIComponent(x).trim()).filter(Boolean);
  return out.length ? out : undefined;
}

export function decodeGuideHash(hash: string): Guide | null {
  const m = hash.match(/(?:^#|&)g=([^&]+)/) || hash.match(/g=([^&]+)/);
  if (!m) return null;
  try {
    const raw = decompressFromEncodedURIComponent(m[1]);
    if (!raw) return null;
    const p = Guide.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export function slugify(s: string) {
  return canonicalSlug(s);
}

/* ───────── v3: graph + need + profile in the URL ───────── */
import type { Need, ProviderGraph } from "./graph/schema";
import { DEFAULT_PROFILE } from "./graph/schema";
import { defaultCaps, cleanCaps } from "./engine";

/** /guide/<slug>?need=a,b&who=team&scale=small&biz=no[#g=<compressed graph>] — defaults are omitted so links stay short. */
export function needHref(g: Pick<ProviderGraph, "slug" | "capabilities"> & Partial<ProviderGraph>, need?: Partial<Need>, opts: { embed?: boolean; origin?: string } = {}) {
  const base = `${opts.origin || ""}/guide/${encodeURIComponent(g.slug)}`;
  const def = defaultCaps(g as ProviderGraph);
  const caps = need?.caps ? cleanCaps(g as ProviderGraph, need.caps) : def;
  const p = { ...DEFAULT_PROFILE, ...(need?.profile || {}) };
  const qs = new URLSearchParams();
  if (!(caps.length === def.length && caps.every((x) => def.includes(x)))) qs.set("need", caps.join(","));
  if (p.audience !== DEFAULT_PROFILE.audience) qs.set("who", p.audience);
  if (p.scale !== DEFAULT_PROFILE.scale) qs.set("scale", p.scale);
  if (p.business !== DEFAULT_PROFILE.business) qs.set("biz", "no");
  const s = qs.toString().replace(/%2C/g, ",");
  const hash = opts.embed && g.origin === "generated" ? `#g=${compressToEncodedURIComponent(JSON.stringify(g))}` : "";
  return base + (s ? `?${s}` : "") + hash;
}

export function parseProfile(sp: { who?: string; scale?: string; biz?: string }) {
  return {
    audience: sp.who === "team" ? "team" : "public",
    scale: sp.scale === "small" ? "small" : "large",
    business: sp.biz !== "no",
  } as Need["profile"];
}

export function decodeGraphHash(hash: string, parse: (x: unknown) => ProviderGraph | null): ProviderGraph | null {
  const m = hash.match(/(?:^#|&)g=([^&]+)/);
  if (!m) return null;
  try {
    const raw = decompressFromEncodedURIComponent(m[1]);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
