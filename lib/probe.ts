import type { Probe } from "./types";

const UA = "GreenlightProbe/1.0 (+https://github.com/karthikyernana/greenlight; public unauthenticated checks only)";

export async function fetchText(url: string, ms = 6000, init: RequestInit = {}): Promise<{ status: number; text: string; finalUrl: string; ctype: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: "follow", ...init, signal: ctl.signal, headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...(init.headers || {}) } });
    const text = (await r.text()).slice(0, 400_000);
    return { status: r.status, text, finalUrl: r.url || url, ctype: r.headers.get("content-type") || "" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const today = () => new Date().toISOString().slice(0, 10);

export type ComposioResult = { managed: "available" | "not_available" | "unknown"; slug?: string; schemes: string[]; faq: string[]; url?: string };

export function composioSlugCandidates(name: string): string[] {
  const n = name.toLowerCase().trim();
  const a = n.replace(/[^a-z0-9]/g, "");
  const b = n.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return [...new Set([a, b])].filter(Boolean);
}

/** Public check of Composio's toolkit page: "Composio-managed OAuth available / not available". */
export async function probeComposio(name: string, slugHint?: string): Promise<ComposioResult & { probe?: Probe }> {
  const cands = slugHint ? [slugHint, ...composioSlugCandidates(name)] : composioSlugCandidates(name);
  for (const slug of [...new Set(cands)]) {
    const url = `https://docs.composio.dev/toolkits/${slug}`;
    const r = await fetchText(url, 8000);
    if (!r || r.status !== 200) continue;
    const t = htmlToText(r.text);
    const i = t.indexOf("Authentication Details");
    if (i < 0) continue;
    const seg = t.slice(i, i + 300);
    const managed = seg.includes("Composio-managed OAuth available") ? "available" : seg.includes("Composio-managed OAuth not available") ? "not_available" : "unknown";
    const schemes = (seg.match(/\b(OAuth2|OAuth1|API Key|Bearer Token|BASIC|S2S_OAUTH2|DCR_OAUTH|GOOGLE_SERVICE_ACCOUNT)\b/g) || []).filter((v, k, s) => s.indexOf(v) === k);
    const fi = t.indexOf("Frequently Asked Questions");
    const faq = fi > 0 ? (t.slice(fi + 27, fi + 2000).match(/[A-Z][^?]{8,140}\?/g) || []).slice(0, 8) : [];
    const result =
      managed === "available" ? "Toolkit page says “Composio-managed OAuth available”" :
      managed === "not_available" ? "Toolkit page says “Composio-managed OAuth not available” — bring your own OAuth app" :
      `Toolkit exists; auth: ${schemes.join(", ") || "unknown"}`;
    return { managed, slug, schemes, faq, url, probe: { label: "Composio toolkit directory", url, result, ok: true, at: today() } };
  }
  return { managed: "unknown", schemes: [], faq: [], probe: { label: "Composio toolkit directory", url: `https://docs.composio.dev/toolkits/${cands[0] || ""}`, result: "No Composio toolkit page found for this name", ok: false, at: today() } };
}

export type OidcResult = { issuer?: string; authorization_endpoint?: string; token_endpoint?: string; scopes?: string[]; pkce?: string[]; registration?: string; url?: string };

/** Try RFC 8414 / OIDC discovery on likely hosts. */
export async function probeDiscovery(domain: string, extra: string[] = []): Promise<{ found?: OidcResult; probes: Probe[] }> {
  const bare = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const hosts = [...extra, bare, `accounts.${bare}`, `login.${bare}`, `auth.${bare}`, `api.${bare}`, `app.${bare}`, `id.${bare}`];
  const urls: string[] = [];
  for (const h of hosts) {
    const base = h.startsWith("http") ? h : `https://${h}`;
    if (base.includes("/.well-known/")) { urls.push(base); continue; }
    urls.push(`${base}/.well-known/openid-configuration`, `${base}/.well-known/oauth-authorization-server`);
  }
  const results = await Promise.all(
    urls.slice(0, 16).map(async (u) => {
      const r = await fetchText(u, 5000, { headers: { accept: "application/json" } });
      if (!r || r.status !== 200) return null;
      try {
        const j = JSON.parse(r.text);
        if (!j.authorization_endpoint && !j.issuer) return null;
        return { url: u, j };
      } catch {
        return null;
      }
    })
  );
  const hit = results.find(Boolean);
  if (!hit) {
    return { probes: [{ label: "OAuth/OIDC discovery", url: `https://${bare}/.well-known/openid-configuration`, result: `No discovery document on ${hosts.length} likely hosts (provider likely documents endpoints manually)`, ok: false, at: today() }] };
  }
  const j = hit.j;
  const found: OidcResult = {
    issuer: j.issuer, authorization_endpoint: j.authorization_endpoint, token_endpoint: j.token_endpoint,
    scopes: Array.isArray(j.scopes_supported) ? j.scopes_supported.slice(0, 40) : undefined,
    pkce: j.code_challenge_methods_supported, registration: j.registration_endpoint, url: hit.url,
  };
  const bits = [
    found.authorization_endpoint ? `authorize: ${found.authorization_endpoint}` : "",
    found.pkce ? `PKCE: ${found.pkce.join("/")}` : "",
    found.registration ? "dynamic client registration endpoint advertised" : "",
    found.scopes ? `${found.scopes.length} scopes advertised` : "",
  ].filter(Boolean);
  return { found, probes: [{ label: "OAuth/OIDC discovery", url: hit.url, result: `Discovery document found. ${bits.join(" · ")}`, ok: true, at: today() }] };
}

/** Hit the authorize endpoint with a fake client_id and record how it rejects us. Proves the endpoint is live; never creates anything. */
export async function probeAuthorize(endpoint: string, extraQuery = ""): Promise<Probe> {
  const u = `${endpoint}${endpoint.includes("?") ? "&" : "?"}client_id=greenlight-probe-000&response_type=code&redirect_uri=${encodeURIComponent("https://example.com/callback")}&scope=openid${extraQuery}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  let first: Response | null = null;
  try { first = await fetch(u, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": UA } }); } catch { first = null; } finally { clearTimeout(timer); }
  if (!first) return { label: "Authorize endpoint (fake client)", url: endpoint, result: "No response (timeout or blocked)", ok: false, at: today() };
  const loc = first.headers.get("location") || "";
  let hop = "";
  if (first.status >= 300 && first.status < 400 && loc) {
    const abs = new URL(loc, u);
    const err = abs.searchParams.get("error") || abs.searchParams.get("authError") ? "error param present" : "";
    hop = ` → ${abs.host}${abs.pathname.slice(0, 50)}${err ? ` (${err})` : ""}`;
  }
  const r = hop ? await fetchText(new URL(loc, u).toString(), 7000) : { status: first.status, text: await first.text(), finalUrl: u, ctype: "" };
  if (!r) return { label: "Authorize endpoint (fake client)", url: endpoint, result: `HTTP ${first.status}${hop}`, ok: true, at: today() };
  const txt = htmlToText(r.text) + " " + r.text.slice(0, 200000);
  const m = txt.match(/(invalid[_ ]client[^.]{0,80}|unauthorized[_ ]client[^.]{0,60}|client[_ ]id[^.]{0,80}(invalid|not found|does not exist|unknown)[^.]{0,40}|invalid[_ ]request[^.]{0,80}|AADSTS\d+[^.]{0,120}|Error \d{3}[^.]{0,80})/i);
  const note = m ? `rejects unknown client: “${m[0].trim().replace(/[<>"\\]/g, "").slice(0, 120)}”` : hop ? "redirects an unknown client to a sign-in/error page" : "endpoint is live";
  return { label: "Authorize endpoint (fake client)", url: endpoint, result: `HTTP ${first.status}${hop} — ${note}`, ok: true, at: today() };
}

export async function probeDevDocs(domain: string): Promise<{ urls: string[]; probe: Probe }> {
  const bare = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const cands = [`https://developers.${bare}`, `https://developer.${bare}`, `https://docs.${bare}`, `https://${bare}/developers`, `https://${bare}/docs`, `https://api.${bare}`];
  const res = await Promise.all(cands.map(async (u) => ({ u, r: await fetchText(u, 5000) })));
  // The page title must look like developer docs: "calendly.com/docs" is somebody's booking page, not documentation.
  const title = (t: string) => (t.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  const ok = res
    .filter((x) => x.r && x.r.status === 200 && /developer|docs|documentation|\bapi\b|reference/i.test(title(x.r.text)) && /oauth|api|developer/i.test(x.r.text.slice(0, 80000)))
    .map((x) => x.r!.finalUrl);
  const uniq = [...new Set(ok)];
  return { urls: uniq, probe: { label: "Developer portal reachability", url: cands[0], result: uniq.length ? `Reachable: ${uniq.slice(0, 3).join(", ")}` : "No public developer portal at common URLs", ok: uniq.length > 0, at: today() } };
}
