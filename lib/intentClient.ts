/* Command-bar helper: when the server says Jev is configured, ask /api/intent for the capability set (≤ 2.5 s),
   otherwise or on any failure use the rules' href computed in the browser. */
import { intentHref, type Intent } from "./intent";

export async function hrefForIntent(q: string, intent: Intent, jev: boolean): Promise<string> {
  const local = intentHref(intent);
  if (!jev || !intent.ready || !intent.sentence) return local;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch("/api/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }), signal: ctl.signal });
    const d = await r.json();
    return r.ok && typeof d.href === "string" && d.href.startsWith("/guide/") ? d.href : local;
  } catch {
    return local;
  } finally {
    clearTimeout(t);
  }
}
