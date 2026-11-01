/* One key per app, however it is typed: "Dropbox", "dropbox.com", "https://www.dropbox.com/developers",
   "Dropbox API" and "developers.dropbox.com" all become "dropbox". The shared store is keyed by this. */

const PREFIXES = /^(www|developers?|dev|api|apis|docs|app|apps|portal|console|platform|my|auth|login|oauth)\./;
const SUFFIX_WORDS = /\s+(api|apis|oauth|oauth2|developer|developers|platform|integration|app)$/i;
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "app";
}

/** Registrable label of a host: developers.dropbox.com → dropbox, api.xero.co.uk → xero. */
export function hostLabel(host: string): string {
  let h = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  while (PREFIXES.test(h)) h = h.replace(PREFIXES, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 1) return parts[0] || h;
  const tld = parts[parts.length - 1], sld = parts[parts.length - 2];
  if (parts.length >= 3 && SECOND_LEVEL.has(sld) && tld.length === 2) return parts[parts.length - 3];
  return sld;
}

export function looksLikeDomain(s: string): boolean {
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(s.trim());
}

/** Canonical slug for an app name, domain or URL. */
export function canonicalSlug(input: string): string {
  const t = input.trim();
  if (!t) return "app";
  if (looksLikeDomain(t)) {
    const host = t.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
    return slugify(hostLabel(host));
  }
  return slugify(t.replace(SUFFIX_WORDS, "").replace(SUFFIX_WORDS, ""));
}

/** Damerau-free Levenshtein, bounded: returns > max as soon as it is certain. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Fuzzy "is this the same app?" between what the user typed and a known entry (name, slug, domain, aliases).
 * Exact canonical match = 1; one typo in a 4–6 letter name, two in 7+ letters = 0.8; prefix of a long name = 0.7.
 */
export function sameApp(q: string, keys: string[]): number {
  const c = squash(canonicalSlug(q));
  if (c.length < 2) return 0;
  let best = 0;
  for (const k0 of keys) {
    if (!k0) continue;
    const k = squash(looksLikeDomain(k0) ? hostLabel(k0.replace(/^https?:\/\//, "").split("/")[0]) : canonicalSlug(k0));
    if (!k) continue;
    if (k === c) return 1;
    const allow = c.length >= 7 ? 2 : c.length >= 4 ? 1 : 0;
    if (allow && editDistance(c, k, allow) <= allow) best = Math.max(best, 0.8);
    else if (c.length >= 4 && k.startsWith(c) && c.length / k.length >= 0.6) best = Math.max(best, 0.7);
  }
  return best;
}
