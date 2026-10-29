import { probeComposio, probeDiscovery, probeAuthorize } from "../lib/probe";
import { writeFileSync } from "fs";
const seeds: Record<string, { name: string; slug: string; domain: string; disc: string[]; authz?: string }> = {
  github: { name: "GitHub", slug: "github", domain: "github.com", disc: [], authz: "https://github.com/login/oauth/authorize" },
  notion: { name: "Notion", slug: "notion", domain: "notion.com", disc: ["https://mcp.notion.com/.well-known/oauth-authorization-server"], authz: "https://api.notion.com/v1/oauth/authorize" },
  slack: { name: "Slack", slug: "slack", domain: "slack.com", disc: ["https://slack.com/.well-known/openid-configuration"], authz: "https://slack.com/oauth/v2/authorize" },
  hubspot: { name: "HubSpot", slug: "hubspot", domain: "hubspot.com", disc: [], authz: "https://app.hubspot.com/oauth/authorize" },
  outlook: { name: "Outlook", slug: "outlook", domain: "microsoft.com", disc: ["https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"] },
  gmail: { name: "Gmail", slug: "gmail", domain: "google.com", disc: ["https://accounts.google.com/.well-known/openid-configuration"] },
  salesforce: { name: "Salesforce", slug: "salesforce", domain: "salesforce.com", disc: ["https://login.salesforce.com/.well-known/openid-configuration"] },
  instagram: { name: "Instagram", slug: "instagram", domain: "instagram.com", disc: ["https://www.facebook.com/.well-known/openid-configuration"], authz: "https://www.instagram.com/oauth/authorize" },
  linkedin: { name: "LinkedIn", slug: "linkedin", domain: "linkedin.com", disc: ["https://www.linkedin.com/oauth/.well-known/openid-configuration"] },
  twitter: { name: "X (Twitter)", slug: "twitter", domain: "x.com", disc: [], authz: "https://x.com/i/oauth2/authorize" },
};
(async () => {
  const out: any = {};
  for (const [k, s] of Object.entries(seeds)) {
    const c = await probeComposio(s.name, s.slug);
    const d = s.disc.length ? await probeDiscovery(s.domain, s.disc.map(x=>x)) : { probes: [] as any[], found: undefined as any };
    const az = s.authz || d.found?.authorization_endpoint;
    const a = az ? await probeAuthorize(az) : null;
    out[k] = { composio: { managed: c.managed, slug: c.slug, schemes: c.schemes }, probes: [c.probe, ...d.probes, ...(a ? [a] : [])].filter(Boolean), disc: d.found };
    console.log(k, c.managed, d.probes.map((p:any)=>p.result.slice(0,120)), a?.result);
  }
  writeFileSync("data/seed-probes.json", JSON.stringify(out, null, 1));
})();
