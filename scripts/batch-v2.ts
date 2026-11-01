/* v2 batch: three more varied guides (no gate / user-count clock / money gate), researched offline by a research
   agent (Hark) from the cited pages on 2026-11-01, run through the same schema, with live probes attached.
   origin=generated until a human reviews them. Run: npx tsx scripts/batch-v2.ts */
import { readFileSync, writeFileSync } from "fs";
import { Guide } from "../lib/types";
import { probeAuthorize, probeComposio, probeDiscovery, probeDevDocs } from "../lib/probe";

const CB = "https://backend.composio.dev/api/v3/toolkits/auth/callback";
const V = "2026-11-01";
const MODEL = "batch v2: offline research agent (Hark) from cited pages, same schema; not yet human-reviewed";

const drafts: any[] = [
  {
    slug: "calendly", name: "Calendly", domain: "calendly.com", category: "Scheduling", gate: "None", authz: "https://auth.calendly.com/oauth/authorize", composioSlug: "calendly",
    summary: "No review gate: a Production OAuth app works for any Calendly user the moment you create it. Two gotchas: each app takes exactly one redirect URI, and new apps get no API access until you pick scopes.",
    console: "https://developer.calendly.com", appType: "OAuth app (OAuth 2.1, PKCE), Sandbox or Production",
    capabilities: [
      { id: "read", label: "Read meetings & availability", scopes: ["scheduled_events:read", "event_types:read", "availability:read", "users:read"], tier: "self_serve", why: "Pick the scopes when you create the app; no review", default: true, evidence: "sourced", sources: [0, 1] },
      { id: "book", label: "Book, cancel & share links", scopes: ["scheduled_events:write", "scheduling_links:write", "shares:write"], tier: "self_serve", why: "Write scopes include the matching read scope; no review", evidence: "sourced", sources: [1] },
      { id: "webhooks", label: "Real-time webhooks", scopes: ["webhooks:write", "scheduled_events:read"], tier: "self_serve", why: "Needs the related read scopes to receive payloads", evidence: "sourced", sources: [1] },
    ],
    steps: [
      { id: "devacct", title: "Create a Calendly developer account", detail: "Sign up on developer.calendly.com with GitHub or Google. It is **separate from your Calendly user account**.", owner: "you", human: "Sign up", activeMinutes: 5, evidence: "sourced", sources: [3] },
      { id: "sandbox", title: "Create a Sandbox app for development", detail: "OAuth apps → Create OAuth app → Environment: Sandbox. Sandbox allows `http://localhost` redirect URIs.", owner: "both", agent: "Pick the minimal scopes and wire up PKCE locally", human: "Click create while signed in", activeMinutes: 10, evidence: "sourced", sources: [0] },
      { id: "scopes", title: "Choose scopes up front", detail: "New apps get **no API access** until scopes are selected. Request the minimum; adding scopes later means users must re-authorize.", owner: "agent", agent: "Map each agent feature to the scope catalog", activeMinutes: 15, evidence: "sourced", sources: [1] },
      { id: "prod", title: "Create a separate Production app", detail: "Production requires https and accepts **exactly one redirect URI**, so use one app for Composio BYO (" + CB + ") and another for your own callback.", owner: "both", agent: "Prepare both app configs", human: "Create them and store the secrets", activeMinutes: 10, evidence: "sourced", sources: [0] },
      { id: "tokens", title: "Handle tokens the Calendly way", detail: "Access tokens last 2 hours; refresh tokens don't expire until used (store the new one every time); max 8 token requests per user per minute.", owner: "agent", agent: "Implement refresh with single-use refresh tokens and backoff", activeMinutes: 30, evidence: "sourced", sources: [2] },
    ],
    launchToday: ["Composio-managed Calendly works today.", "Or create your Production app today: there is no approval queue."],
    rejections: ["No review exists, so failures show up at runtime: redirect_uri mismatch (one URI per app)", "403 missing scope: the app was created without the scope the endpoint needs"],
    blockers: [
      { problem: "403 insufficient permissions", fix: "The token lacks a scope. Add it to the app and send the user through OAuth again." },
      { problem: "Refresh suddenly fails", fix: "Refresh tokens are single-use. Persist the new refresh token from every refresh response." },
      { problem: "Need two callbacks (yours + Composio)", fix: "Production apps take one redirect URI. Create a second app." },
    ],
    uncertain: ["Calendly's docs describe no review gate for Production apps. That is confirmed by its absence, not by an explicit statement.", "Whether webhook delivery depends on the end user's Calendly plan isn't stated on the pages read."],
    sources: [
      { title: "Calendly: Creating an OAuth app", url: "https://developer.calendly.com/docs/authentication/creating-an-oauth-app" },
      { title: "Calendly: Authorization scopes", url: "https://developer.calendly.com/docs/authentication/scopes" },
      { title: "Calendly: Get access token (token lifetimes, rate limit)", url: "https://developer.calendly.com/api-docs/calendly-o-auth/o-auth/post-oauth-refresh-token" },
      { title: "Calendly: Create a developer account", url: "https://developer.calendly.com/docs/authentication/create-a-developer-account" },
      { title: "Composio: Calendly toolkit", url: "https://docs.composio.dev/toolkits/calendly" },
    ],
  },
  {
    slug: "dropbox", name: "Dropbox", domain: "dropbox.com", category: "Files", gate: "Production review at 50 users", authz: "https://www.dropbox.com/oauth2/authorize", composioSlug: "dropbox",
    summary: "Works right away in Development status, but a clock starts at 50 linked users: you then have two weeks to win Production approval or new links freeze. Review checks least-privilege permissions, branding and a privacy policy; Dropbox says it answers nearly all requests within a few business days.",
    console: "https://www.dropbox.com/developers/apps", appType: "Scoped-access app (App folder or Full Dropbox)",
    capabilities: [
      { id: "pilot", label: "Read & write files, first 50 users", scopes: ["files.metadata.read", "files.content.read", "files.content.write"], tier: "self_serve", why: "Development status: works like production, review not needed below 50 linked users", evidence: "sourced", sources: [0] },
      { id: "public", label: "Any Dropbox user can connect", scopes: ["files.metadata.read", "files.content.read"], tier: "review", why: "Production approval required once you pass 50 linked users (hard cap 500 in development)", default: true, evidence: "sourced", sources: [0, 2] },
      { id: "full", label: "Access the whole Dropbox, not one folder", scopes: ["(access type: Full Dropbox)"], tier: "review", why: "Reviewers check the permission isn't broader than the feature needs", evidence: "sourced", sources: [0] },
    ],
    steps: [
      { id: "create", title: "Create a scoped app in the App Console", detail: "Choose **App folder** unless the agent truly needs the whole Dropbox: reviewers reject broader access than the features need.", owner: "both", agent: "Recommend App folder vs Full Dropbox from your features", human: "Create it while signed in", activeMinutes: 10, link: "https://www.dropbox.com/developers/apps", evidence: "sourced", sources: [0, 1] },
      { id: "perms", title: "Set permissions and redirect URIs", detail: "Permissions tab: tick only the scopes you use. Settings: add redirect URIs (Composio BYO: " + CB + ").", owner: "agent", agent: "Configure scopes and test the OAuth flow with PKCE", activeMinutes: 15, evidence: "sourced", sources: [0, 1] },
      { id: "brand", title: "Fix branding and publish an app-specific privacy policy", detail: "Follow the developer branding guidelines (don't lead your name with \"Dropbox\") and say what the app will and won't do with user data.", owner: "agent", agent: "Draft the privacy policy and check names/logos against the guidelines", activeMinutes: 60, requiredFor: ["public", "full"], evidence: "sourced", sources: [0] },
      { id: "users", title: "Reach 50 linked users", detail: "You can apply any time, but Dropbox won't review until 50 users are linked. From the 50th link you have **two weeks** before new links freeze.", owner: "you", agent: "Draft the beta invite", human: "Recruit users", activeMinutes: 60, waitDays: [7, 30], requiredFor: ["public", "full"], evidence: "sourced", sources: [0, 2] },
      { id: "apply", title: "Apply for production status", detail: "App Console → Apply for production. Explain how the app uses the API, upload an icon, and mention planned features that justify broader permissions.", owner: "both", agent: "Write the application text and permission justifications", human: "Submit", activeMinutes: 30, waitDays: [2, 7], after: ["users", "brand"], requiredFor: ["public", "full"], evidence: "sourced", sources: [0, 2] },
    ],
    launchToday: ["Composio-managed Dropbox works today.", "Your own app serves 50 users with no review. Submit the production application early so the 2-week clock never bites."],
    rejections: ["Requests Full Dropbox when an App folder would do", "Breaks the branding guidelines (e.g. app name starting with Dropbox)", "No app-specific privacy policy", "App type on Dropbox's not-allowed list"],
    blockers: [
      { problem: "\"Ability to link additional users frozen\"", fix: "You passed 50 users without production approval inside two weeks. Apply (or follow up on the pending request); links resume once approved." },
      { problem: "Need to rename the app after approval", fix: "Production apps can't be renamed by you. Open an API support ticket." },
    ],
    uncertain: ["\"A few business days\" is Dropbox's own statement; we haven't measured it.", "Team (Business API) apps have separate development limits that the cited guide doesn't cover in detail."],
    sources: [
      { title: "Dropbox: DBX Platform developer guide (production approval)", url: "https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide" },
      { title: "Dropbox: App Console", url: "https://docs.dropboxapi.com/dropbox-api/docs/get-started/tutorial/app-console" },
      { title: "Dropbox: Developer support FAQ (review time)", url: "https://www.dropbox.com/developers/support" },
      { title: "Composio: Dropbox toolkit", url: "https://docs.composio.dev/toolkits/dropbox" },
    ],
  },
  {
    slug: "docusign", name: "Docusign", domain: "docusign.com", category: "Documents & e-signature", gate: "Paid production account", authz: "https://account-d.docusign.com/oauth/auth", composioSlug: "docusign", disco: ["account.docusign.com"],
    summary: "Building is free in the developer sandbox; going live needs a paid production Docusign account. The old 20-API-call rule is gone: Go-Live runs automatic checks and eligible apps are promoted instantly. Public apps need the Partner Program. Composio has no managed Docusign app.",
    console: "https://developers.docusign.com", appType: "Integration key (Apps & Keys / Developer Console)",
    capabilities: [
      { id: "sandbox", label: "Send test envelopes (sandbox)", scopes: ["signature", "extended"], tier: "instant", why: "Free developer account; envelopes aren't legally binding", evidence: "sourced", sources: [0] },
      { id: "live", label: "Send real envelopes for your company's users", scopes: ["signature", "extended"], tier: "paid", why: "Go-Live needs a paid production account; promotion is often automatic", default: true, evidence: "sourced", sources: [0, 1] },
      { id: "public", label: "Public app for other Docusign customers", scopes: ["signature", "extended"], tier: "partner", why: "The 'Public integration' classification requires joining the Partner Program", evidence: "sourced", sources: [0] },
    ],
    steps: [
      { id: "devacct", title: "Create a free developer account", detail: "Sandbox at account-d.docusign.com, API base demo.docusign.net.", owner: "you", human: "Sign up", activeMinutes: 10, evidence: "sourced", sources: [0] },
      { id: "ik", title: "Create the integration key", detail: "Apps & Keys → Add app: Authorization Code Grant, secret, redirect URI (Composio BYO: " + CB + ").", owner: "both", agent: "Prepare the settings and test consent in the sandbox", human: "Create it while signed in", activeMinutes: 15, evidence: "sourced", sources: [0] },
      { id: "build", title: "Build against the sandbox the production way", detail: "Read each user's `base_uri` from /oauth/userinfo once and cache it; production hosts differ per data centre. Use webhooks, not polling.", owner: "agent", agent: "Implement OAuth, base_uri discovery and Connect webhooks", activeMinutes: 240, evidence: "sourced", sources: [0, 3] },
      { id: "prodacct", title: "Get a paid production account with admin access", detail: "Trial plans aren't eligible. ISV partners can apply for a free management account.", owner: "you", human: "Buy or pick a supported plan; make sure you're an admin", activeMinutes: 20, cost: "Paid Docusign plan", requiredFor: ["live", "public"], evidence: "sourced", sources: [0, 2] },
      { id: "classify", title: "Choose the integration classification", detail: "Private custom, third-party key, public (Partner Program) or embedded (ISV Embed licence). It also decides how envelopes are billed.", owner: "both", agent: "Recommend the classification from your business model", human: "Confirm it", activeMinutes: 10, requiredFor: ["live", "public"], evidence: "sourced", sources: [0] },
      { id: "partner", title: "Join the Docusign Partner Program", detail: "Required for a public integration that other companies authorize with their own accounts.", owner: "you", human: "Apply as the company", activeMinutes: 60, waitDays: [7, 30], requiredFor: ["public"], evidence: "uncertain", sources: [0] },
      { id: "golive", title: "Run Go-Live", detail: "Pick the production account. Eligible apps go live instantly; others go to Pending approval. \"Verification required\" means the account admin must verify their identity once.", owner: "both", agent: "Pre-check eligibility and draft the review notes", human: "Start Go-Live and complete identity verification", activeMinutes: 15, waitDays: [0, 5], after: ["prodacct", "classify"], requiredFor: ["live", "public"], evidence: "sourced", sources: [0, 1] },
      { id: "after", title: "Re-enter secrets and redirect URIs in production", detail: "The key is copied to production, but secrets and redirect URIs are not.", owner: "agent", agent: "Script the production config and switch base URIs", activeMinutes: 15, after: ["golive"], requiredFor: ["live", "public"], evidence: "sourced", sources: [0] },
    ],
    launchToday: ["Composio can't host this one: bring your own integration key.", "If you already have a paid Docusign account, Go-Live can be same-day."],
    rejections: ["Trying to go live from a trial plan", "Admin identity verification not completed (status: Declined, Verification required)", "Wrong classification for the business model", "API rule or resource-limit violations such as polling"],
    blockers: [
      { problem: "Production calls fail right after Go-Live", fix: "Secrets and redirect URIs aren't copied with the key. Add them in production and use the account's base_uri." },
      { problem: "Status: Declined, Verification required", fix: "The production account admin completes the one-time identity verification, then re-select the Go-Live account." },
    ],
    uncertain: ["Docusign doesn't say which integrations are auto-promoted vs reviewed, or how long a manual review takes (0–5 days is our estimate).", "Partner Program approval time isn't published."],
    checks: [
      { claim: "Go-Live requires 20 successful API calls in the sandbox", status: "corrected", note: "Docusign removed the 20-call requirement in Oct 2025. The current Go-Live page lists only OAuth, a paid production account and admin/developer access, with automatic promotion for eligible apps.", url: "https://community.docusign.com/go-live-70/no-more-20-api-calls-introducing-the-streamlined-integration-go-live-experience-in-apps-keys-25623", at: V },
    ],
    sources: [
      { title: "Docusign: eSignature Go-Live", url: "https://developers.docusign.com/docs/esign-rest-api/go-live/" },
      { title: "Docusign Community: No more 20 API calls (Oct 2025)", url: "https://community.docusign.com/go-live-70/no-more-20-api-calls-introducing-the-streamlined-integration-go-live-experience-in-apps-keys-25623" },
      { title: "Docusign Support: Integration keys and Go Live FAQ", url: "https://support.docusign.com/s/articles/DocuSign-Developer-FAQs-Integration-Keys-and-Go-Live?language=en_US" },
      { title: "Docusign blog: Go-live failures (polling)", url: "https://www.docusign.com/blog/developers/the-trenches-go-live-failures" },
      { title: "Composio: Docusign toolkit", url: "https://docs.composio.dev/toolkits/docusign" },
    ],
  },
];

(async () => {
  const path = "data/generated/index.json";
  const existing = JSON.parse(readFileSync(path, "utf8")) as any[];
  for (const d of drafts) {
    const { authz, composioSlug, disco, ...rest } = d;
    const [c, disc, docs, az] = await Promise.all([probeComposio(d.name, composioSlug), probeDiscovery(d.domain, disco || []), probeDevDocs(d.domain), probeAuthorize(authz)]);
    const probes = [c.probe!, ...disc.probes, docs.probe, az].filter(Boolean);
    const g = Guide.parse({
      ...rest, origin: "generated", verifiedAt: V, model: MODEL, probes,
      composio: {
        managed: c.managed, slug: c.slug, evidence: "tested",
        note: c.managed === "available" ? "Composio's managed app lets users connect today. Bring your own for your brand on the consent screen, custom scopes or your own rate limits." : "Composio lists this toolkit but you must bring your own OAuth app.",
      },
    });
    const i = existing.findIndex((x) => x.slug === g.slug);
    if (i >= 0) existing[i] = g; else existing.push(g);
    console.log(g.slug, c.managed, probes.map((p) => p.result.slice(0, 90)).join(" | "));
  }
  writeFileSync(path, JSON.stringify(existing, null, 1));
})();
