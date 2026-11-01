/* Command bars call the server's input gate (/api/check) before opening an investigation, so a typo or keyboard mash
   gets an answer in under 2 s instead of a multi-minute run. The server enforces the same gate in /api/generate. */
export type ClientCheck =
  | { ok: true; href: string; app: string; via: string }
  | { ok: false; message: string; suggestions: { slug: string; name: string; href: string; near?: boolean }[] };

/** null = the check itself could not run (network); the caller may proceed and let the server decide. */
export async function checkQuery(q: string, timeoutMs = 3500): Promise<ClientCheck | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`/api/check?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
    const d = await r.json();
    if (d && d.ok === true && typeof d.href === "string" && d.href.startsWith("/guide/")) return { ok: true, href: d.href, app: d.app, via: d.via };
    if (d && d.ok === false && typeof d.message === "string") return { ok: false, message: d.message, suggestions: Array.isArray(d.suggestions) ? d.suggestions : [] };
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** "Did you mean" only when the suggestions are close spellings; otherwise they are just popular guides. */
export const suggestLead = (s: { near?: boolean }[]) => (s.some((x) => x.near) ? "Did you mean" : "Ready guides:");
