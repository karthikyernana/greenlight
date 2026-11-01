/* Need intake. The command bar takes an app ("Gmail") or a sentence ("agent that triages my users' Gmail and drafts replies").
   Rules only, no model: find the app, map verbs to capabilities with each graph's keywords, read audience/scale/business hints. */
import type { Profile } from "./graph/schema";

export type CapKeywords = { id: string; label?: string; keywords: string[] };
export type IntentIndex = { slug: string; name: string; aliases: string[]; ready: boolean; composioSlug?: string; caps: CapKeywords[] };
export type Intent = { slug?: string; app: string; ready: boolean; composioSlug?: string; caps: string[]; profile: Partial<Profile>; sentence: boolean };

const STOP = new Set(["agent", "that", "the", "and", "my", "our", "their", "users", "user", "with", "for", "from", "into", "to", "an", "a", "of", "in", "on", "an", "app", "api", "which", "who", "can", "will", "should", "build", "building", "want", "need", "needs", "i", "we", "it", "its", "all", "every", "reads", "read", "send", "sends", "drafts", "draft", "replies", "reply", "posts", "post", "manage", "manages", "triage", "triages", "summarise", "summarize", "summarises", "summarizes"]);

export const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

export function parseIntent(raw: string, index: IntentIndex[]): Intent {
  const q = norm(raw.trim());
  const words = q.split(/\s+/).filter(Boolean);
  const sentence = words.length >= 3;
  // app: longest alias that appears as a whole word
  let best: IntentIndex | undefined;
  let bestLen = 0;
  for (const e of index)
    for (const a of [e.name, e.slug, ...e.aliases].map((x) => norm(x).replace(/\s*\(.*\)$/, "")).filter((x) => x.length >= 2)) {
      const re = new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}('s|s)?([^a-z0-9]|$)`);
      if (re.test(q) && a.length > bestLen && (best?.ready !== true || e.ready || a.length > bestLen + 2)) { best = e; bestLen = a.length; }
    }
  let app = best?.name || "";
  if (!best) {
    if (!sentence) app = raw.trim();
    else {
      const orig = raw.trim().split(/\s+/);
      const cap = orig.find((w, i) => i > 0 && /^[A-Z][A-Za-z0-9.]+/.test(w) && !STOP.has(w.toLowerCase()));
      const dom = orig.find((w) => /[a-z0-9-]+\.[a-z]{2,}/i.test(w));
      app = (dom || cap || orig.find((w) => !STOP.has(w.toLowerCase())) || raw).replace(/['’]s$/, "").replace(/[^\w.-]/g, "");
    }
  }
  // capabilities: longest keyword first, consumed so "drafts replies" doesn't also count as "replies"
  const caps: string[] = [];
  if (best && sentence) {
    let rest = q;
    const kws = best.caps.flatMap((c) => c.keywords.map((k) => ({ id: c.id, k: norm(k) }))).sort((a, b) => b.k.length - a.k.length);
    for (const { id, k } of kws) {
      if (k.length < 2 || !rest.includes(k)) continue;
      rest = rest.split(k).join(" ");
      if (!caps.includes(id)) caps.push(id);
    }
  }
  const profile: Partial<Profile> = {};
  if (/\b(my team|our team|internal|in-house|employees|colleagues|our company|our org|our workspace|my company)\b/.test(q)) profile.audience = "team";
  else if (/\b(my users|our users|customers|clients|public|anyone|users')\b/.test(q)) profile.audience = "public";
  const n = q.match(/\b(\d{1,6})\s*(users|people|customers|accounts)\b/);
  if (n) profile.scale = Number(n[1]) <= 100 ? "small" : "large";
  else if (/\b(a few|handful|beta|pilot|design partners?)\b/.test(q)) profile.scale = "small";
  if (/\b(no (registered )?(company|business|entity)|not a (registered )?(company|business)|without a (registered )?(company|business)|individual|solo|indie|side project|hobby|unregistered|not registered|personal project)\b/.test(q)) profile.business = false;
  return { slug: best?.slug, app, ready: !!best?.ready, composioSlug: best?.composioSlug, caps, profile, sentence };
}

/** Where Enter goes for a sentence. */
export function intentHref(i: Intent): string {
  const qs = new URLSearchParams();
  if (i.caps.length) qs.set("need", i.caps.join(","));
  if (i.profile.audience === "team") qs.set("who", "team");
  if (i.profile.scale === "small") qs.set("scale", "small");
  if (i.profile.business === false) qs.set("biz", "no");
  const slug = i.slug || i.app.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.(com|io|ai|dev|app|co|org|net)(\/.*)?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";
  if (!i.ready) { qs.set("q", i.app); if (i.composioSlug) qs.set("cs", i.composioSlug); }
  const s = qs.toString().replace(/%2C/g, ",");
  return `/guide/${slug}${s ? `?${s}` : ""}`;
}
