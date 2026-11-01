/* Quote checks are plain code, never a model: a fact's quote either appears in the fetched source text or it does not. */

/** Lowercase, unify quotes/dashes, drop markup leftovers, collapse whitespace. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b\u2032`]/g, "'")
    .replace(/[\u201c\u201d\u201f\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[*_#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as norm, and also ignores punctuation, so "10 business days." matches "10 Business days". */
function loose(s: string): string {
  return norm(s).replace(/[^a-z0-9$%./: -]/g, " ").replace(/[.,:;]+(\s|$)/g, " ").replace(/\s+/g, " ").trim();
}

export type QuoteCheck = { found: boolean; how: "exact" | "loose" | "partial" | "none"; coverage: number };

/**
 * Does `quote` appear in `source`? Exact (normalised) or loose (punctuation-insensitive) counts.
 * Models trim and re-join sentences, so we also accept the quote when every 8-word window of it appears in order (coverage ≥ 0.9).
 */
export function checkQuote(quote: string, source: string): QuoteCheck {
  const q = norm(quote);
  if (q.length < 12) return { found: false, how: "none", coverage: 0 };
  const s = norm(source);
  if (s.includes(q)) return { found: true, how: "exact", coverage: 1 };
  const lq = loose(quote), ls = loose(source);
  if (lq.length >= 12 && ls.includes(lq)) return { found: true, how: "loose", coverage: 1 };
  const words = lq.split(" ");
  if (words.length < 10) return { found: false, how: "none", coverage: 0 };
  const W = 8;
  let hit = 0, total = 0;
  for (let i = 0; i + W <= words.length; i += 4) {
    total++;
    if (ls.includes(words.slice(i, i + W).join(" "))) hit++;
  }
  const coverage = total ? hit / total : 0;
  return { found: coverage >= 0.9, how: coverage >= 0.9 ? "partial" : "none", coverage };
}

/** Extract the sentence (or two) around `find` from a page, verbatim, max ~320 chars. Used when building the curated graph. */
export function extractQuote(text: string, find: string, max = 320): string {
  const t = text.replace(/\s+/g, " ");
  const i = t.toLowerCase().indexOf(find.toLowerCase());
  if (i < 0) return "";
  // sentence start: last ". " / "? " / "! " before i
  let a = Math.max(t.lastIndexOf(". ", i), t.lastIndexOf("? ", i), t.lastIndexOf("! ", i));
  a = a < 0 || i - a > 220 ? Math.max(0, i - 120) : a + 2;
  let b = i + find.length;
  const end = t.slice(b).search(/[.!?](\s|$)/);
  b = end < 0 || end > 240 ? Math.min(t.length, b + 160) : b + end + 1;
  let q = t.slice(a, b).trim();
  if (q.length > max) {
    const rel = i - a;
    const s0 = Math.max(0, rel - Math.floor((max - find.length) / 2));
    q = q.slice(s0, s0 + max).trim();
  }
  return q;
}
