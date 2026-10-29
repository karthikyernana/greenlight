/* Batch path to 100: guides researched offline by a research agent (Hark), run through the same schema,
   with live probes attached. Marked origin=generated until a human reviews them. */
import { writeFileSync } from "fs";
import { Guide } from "../lib/types";
import { probeAuthorize, probeComposio, probeDiscovery, probeDevDocs } from "../lib/probe";
const CB = "https://backend.composio.dev/api/v3/toolkits/auth/callback";
const V = "2026-10-30";
const MODEL = "batch: offline research agent (Hark), same schema; not yet human-reviewed";

const drafts: any[] = [
  {
    slug: "spotify", name: "Spotify", domain: "spotify.com", category: "Media", authz: "https://accounts.spotify.com/authorize",
    summary: "Registering the app is instant, but Spotify has effectively closed general access: Development Mode allows 5 users per app (and the owner needs Premium), and Extended Quota is only for registered organizations with ~250k MAU. For most agents, plan to stay at 5 users.",
    console: "https://developer.spotify.com/dashboard", appType: "Spotify app (Web API, OAuth 2.0)",
    capabilities: [
      { id: "personal", label: "Read/control playback for you + 4 others", scopes: ["user-read-playback-state", "user-modify-playback-state", "playlist-read-private"], tier: "self_serve", why: "Development Mode: 5 allow-listed users per app; the owner needs Premium", default: true, evidence: "sourced", sources: [0, 1] },
      { id: "public", label: "Any Spotify user can connect", scopes: [], tier: "partner", why: "Extended Quota: organizations only, launched service, ~250k MAU", default: false, evidence: "sourced", sources: [0, 2] },
    ],
    steps: [
      { id: "premium", title: "Make sure the app owner has Spotify Premium", detail: "Since Feb/Mar 2026, Development Mode apps stop working if the owner's Premium lapses.", owner: "you", human: "Keep Premium active on the owner account", activeMinutes: 5, evidence: "sourced", sources: [1] },
      { id: "create", title: "Create the app in the Developer Dashboard", detail: "Dashboard → Create app. Name and description appear on the consent screen. Add redirect URIs (Composio BYO: " + CB + "). You can have up to 25 client IDs, which share one quota.", owner: "both", agent: "Fill in the redirect URIs and choose Web API", human: "Accept the Developer Terms and create the app", activeMinutes: 10, link: "https://developer.spotify.com/dashboard", evidence: "sourced", sources: [3, 4] },
      { id: "allowlist", title: "Allow-list your 5 users", detail: "Add each user's Spotify email under User Management. Anyone else gets an error at sign-in.", owner: "you", agent: "Explain the limit to users in your onboarding", human: "Add the emails", activeMinutes: 10, evidence: "sourced", sources: [1] },
      { id: "quota", title: "Apply for Extended Quota (organizations only)", detail: "Use the form from a company email. Criteria: a legally registered business, an active launched service, about 250k MAU, and availability in key Spotify markets.", owner: "both", agent: "Draft the application and a compliance checklist against the Developer Terms", human: "Submit as the organization", activeMinutes: 120, waitDays: [14, 60], requiredFor: ["public"], evidence: "uncertain", sources: [0, 2] },
    ],
    launchToday: ["Ship to yourself plus 4 testers in Development Mode today.", "Composio has no managed Spotify app. You need your own client ID.", "If you need the public, treat Spotify as partner-only and design around it."],
    rejections: ["Applying as an individual (Extended Quota has been organizations-only since May 15, 2025)", "Below the ~250k MAU bar or not yet launched", "Use cases Spotify reviewers flag as not driving artist discovery or as automation risk"],
    blockers: [
      { problem: "A 6th user can't log in", fix: "Development Mode caps you at 5 allow-listed users per app. There's no self-serve way around it." },
      { problem: "429 with reason QUOTA_EXCEEDED", fix: "All your Development Mode client IDs share one quota since July 2026. Cache and batch calls." },
      { problem: "App suddenly stops working", fix: "The owner's Premium subscription lapsed. Renew it." },
    ],
    uncertain: ["Spotify doesn't publish Extended Quota review times.", "The ~250k MAU threshold comes from Spotify's 2025 criteria. Agencies may be judged differently."],
    sources: [
      { title: "Spotify: Quota modes", url: "https://developer.spotify.com/documentation/web-api/concepts/quota-modes" },
      { title: "Spotify blog: Update on developer access (Feb 2026)", url: "https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security" },
      { title: "Spotify blog: Updating criteria for extended access (Apr 2025)", url: "https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access" },
      { title: "Spotify: Apps", url: "https://developer.spotify.com/documentation/web-api/concepts/apps" },
      { title: "Spotify blog: Web API quota updates (Jul 2026)", url: "https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates" },
      { title: "Composio: Spotify toolkit FAQ", url: "https://docs.composio.dev/toolkits/spotify" },
    ],
  },
  {
    slug: "zoom", name: "Zoom", domain: "zoom.us", category: "Meetings", authz: "https://zoom.us/oauth/authorize",
    summary: "An unpublished General app works only for users in your own Zoom account. To let other accounts connect, the app has to pass Marketplace review (functional, then security), or get approval to share a beta link, which needs SAST/DAST evidence. Expect weeks, and few apps pass on the first try.",
    console: "https://marketplace.zoom.us/develop/create", appType: "General app (OAuth), user- or admin-managed",
    capabilities: [
      { id: "own", label: "Your own account's meetings & recordings", scopes: ["meeting:read:list_meetings", "cloud_recording:read:list_recording_files"], tier: "self_serve", why: "Unpublished apps work for users in your Zoom account without review", evidence: "sourced", sources: [1] },
      { id: "external", label: "Other companies' users connect", scopes: ["meeting:read:list_meetings", "meeting:read:summary"], tier: "restricted", why: "Marketplace review: functional + security review; scopes are justified individually", default: true, evidence: "sourced", sources: [2, 3] },
    ],
    steps: [
      { id: "create", title: "Create a General app", detail: "Marketplace → Develop → Build App → General app. Choose user-managed (each user authorizes) or admin-managed (account-wide).", owner: "both", agent: "Recommend user- vs admin-managed from your scopes", human: "Create it while signed in to the Zoom developer account", activeMinutes: 10, link: "https://marketplace.zoom.us/develop/create", evidence: "sourced", sources: [0] },
      { id: "scopes", title: "Add scopes with a justification for each", detail: "Each scope is a request to Zoom's Security Review team, which rejects anything that isn't needed. Add the OAuth redirect URL (Composio BYO: " + CB + ") and allow-list it.", owner: "agent", agent: "Choose the minimal granular scopes and write a justification for each", activeMinutes: 30, evidence: "sourced", sources: [0, 4] },
      { id: "domains", title: "Verify your domains", detail: "Privacy policy, terms, redirect, webhook and home URLs must all be on domains you verify in the build flow.", owner: "both", agent: "Produce the verification records", human: "Add them at your DNS/host", activeMinutes: 20, waitDays: [0, 1], requiredFor: ["external"], evidence: "sourced", sources: [5] },
      { id: "secdocs", title: "Prepare the security documentation", detail: "SSDLC doc, SAST and DAST scan output (real scanner output, not summaries), privacy policy, plus 3 of: pentest summary, security policy, incident response, vulnerability management, dependency policy. TLS 1.2+.", owner: "both", agent: "Run SAST/DAST scans and draft the policies", human: "Approve the policies and commission a pentest if needed", activeMinutes: 720, requiredFor: ["external"], evidence: "sourced", sources: [6] },
      { id: "submit", title: "Submit for review (functional → security)", detail: "Give test account credentials and reviewer notes. Zoom says few apps pass on the first attempt.", owner: "both", agent: "Write the reviewer notes and test plan", human: "Submit and respond to feedback", activeMinutes: 60, waitDays: [14, 42], after: ["domains", "secdocs"], requiredFor: ["external"], evidence: "uncertain", sources: [2, 3] },
    ],
    launchToday: ["Composio-managed Zoom auth lets external users connect today.", "Build and dogfood inside your own Zoom account. No review needed.", "Start the security pack (SAST/DAST, policies) now. It's the long pole."],
    rejections: ["Scopes broader than the feature needs", "Scan evidence submitted as written summaries, not scanner output", "Redirect or webhook URLs on unverified domains", "No working test account for the reviewer"],
    blockers: [
      { problem: "Users from another company get an error installing", fix: "The app is unpublished. Publish it (or get beta sharing approved) through review, or use Composio-managed auth meanwhile." },
      { problem: "Account admin must approve the app", fix: "Many accounts require admin pre-approval in Marketplace settings. Send the admin your listing link." },
    ],
    uncertain: ["Zoom doesn't publish review turnaround. 2–6 weeks is an estimate from developer reports."],
    sources: [
      { title: "Zoom: Create an OAuth (General) app", url: "https://developers.zoom.us/docs/build-flow/create-oauth-apps" },
      { title: "Zoom: Key concepts (private vs published apps)", url: "https://developers.zoom.us/docs/platform/key-concepts/" },
      { title: "Zoom: App review process", url: "https://developers.zoom.us/docs/distribute/app-review-process/" },
      { title: "Zoom Support: Security review process", url: "https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058021" },
      { title: "Zoom: Security requirements for Marketplace apps", url: "https://developers.zoom.us/docs/distribute/security-requirements/" },
      { title: "Zoom: Submit apps for review (domain verification)", url: "https://developers.zoom.us/docs/build-flow/submitting-apps-for-review/" },
      { title: "Zoom: Sharing private and beta apps (security docs)", url: "https://developers.zoom.us/docs/distribute/sharing-private-and-beta-apps/" },
      { title: "Composio: Zoom toolkit", url: "https://docs.composio.dev/toolkits/zoom" },
    ],
  },
  {
    slug: "shopify", name: "Shopify", domain: "shopify.com", category: "E-commerce",
    summary: "Custom distribution (one store, or stores in one Plus org) needs no review. Public distribution means App Store review, a one-time registration fee, and a separate review to access protected customer data such as names and emails. Your distribution choice is permanent.",
    console: "https://dev.shopify.com/dashboard/", appType: "Shopify app (Partner org, Dev Dashboard)",
    capabilities: [
      { id: "custom", label: "Connect one merchant's store", scopes: ["read_products", "read_orders"], tier: "self_serve", why: "Custom distribution: install link, no App Store review", evidence: "sourced", sources: [0] },
      { id: "public", label: "Any merchant can install", scopes: ["read_products", "read_orders"], tier: "review", why: "Public distribution requires App Store review", default: true, evidence: "sourced", sources: [0, 2] },
      { id: "pcd", label: "Read customer names, emails, addresses", scopes: ["read_customers"], tier: "review", why: "Protected customer data: level 1/2 access needs its own review for public apps", evidence: "sourced", sources: [3] },
    ],
    steps: [
      { id: "partner", title: "Create a Partner organization and the app", detail: "Create it in the Dev Dashboard with the Shopify CLI. Add redirect URLs (Composio BYO: " + CB + ").", owner: "both", agent: "Scaffold with the Shopify CLI and set scopes and redirects", human: "Sign up for the Partner org", activeMinutes: 30, link: "https://dev.shopify.com/dashboard/", evidence: "sourced", sources: [0] },
      { id: "distribution", title: "Choose the distribution method (permanent)", detail: "Custom (one store or one Plus org) or Public (App Store). **You can't change it later.** If you have separate dev and prod apps, choose on the prod app.", owner: "you", agent: "Lay out the trade-offs", human: "Choose", activeMinutes: 10, evidence: "sourced", sources: [0] },
      { id: "pcd", title: "Request protected customer data access", detail: "Declare which fields you need and why, and meet the level 1 (or level 2) requirements. Until it's approved, the API won't return that data from non-dev stores.", owner: "both", agent: "Draft the data-use justification and implement the requirements (encryption, retention)", human: "Submit the request", activeMinutes: 90, waitDays: [3, 14], requiredFor: ["pcd"], evidence: "uncertain", sources: [3, 4] },
      { id: "listing", title: "Register for the App Store and build the listing", detail: "One-time registration fee. You need the listing, an app icon, compliance webhooks, and billing via Shopify App Pricing if you charge.", owner: "both", agent: "Subscribe the compliance webhooks; draft the listing; run Shopify's AI self-review", human: "Pay the registration fee", activeMinutes: 240, requiredFor: ["public"], cost: "One-time App Store registration fee", evidence: "sourced", sources: [1, 2, 5] },
      { id: "review", title: "Submit for App Store review", detail: "Status moves Draft → Submitted → Reviewed → Published. If core requirements fail, the app goes to Paused.", owner: "both", agent: "Pre-check against the requirements list", human: "Submit and respond to feedback", activeMinutes: 60, waitDays: [5, 21], after: ["listing"], requiredFor: ["public"], evidence: "uncertain", sources: [2, 6] },
    ],
    launchToday: ["Use custom distribution for your first merchant today: install link, no review.", "Composio has no managed Shopify app (bring your own).", "File the protected customer data request early if you need customer PII."],
    rejections: ["Requesting access scopes you can't justify", "Missing compliance webhooks", "Submitting a beta or incomplete app", "Billing outside Shopify App Pricing for public apps"],
    blockers: [
      { problem: "API returns null for customer fields", fix: "You don't have protected customer data access yet. Request it in the dashboard. Development stores work without it." },
      { problem: "“App not found” when connecting via Composio", fix: "Check the store's myshopify domain and that your app's distribution allows that store." },
    ],
    uncertain: ["The discovery probe found accounts.shopify.com, which is Shopify's own identity service. App OAuth runs per store at https://{shop}.myshopify.com/admin/oauth/authorize, which has no discovery document.", "Shopify doesn't state the review turnaround on the cited pages. The ranges are estimates.", "The exact registration fee isn't on the cited pages."],
    sources: [
      { title: "Shopify: About app distribution", url: "https://shopify.dev/docs/apps/launch/distribution" },
      { title: "Shopify: App Store requirements", url: "https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements" },
      { title: "Shopify: About the app review process", url: "https://shopify.dev/docs/apps/launch/app-store-review/review-process" },
      { title: "Shopify: Work with protected customer data", url: "https://shopify.dev/docs/apps/launch/protected-customer-data" },
      { title: "Shopify: API access scopes", url: "https://shopify.dev/docs/api/usage/access-scopes" },
      { title: "Shopify: Pass app review", url: "https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review" },
      { title: "Shopify: Submit your app for review", url: "https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review" },
      { title: "Composio: Shopify toolkit FAQ", url: "https://docs.composio.dev/toolkits/shopify" },
    ],
  },
];

(async () => {
  const out = [];
  for (const d of drafts) {
    const c = await probeComposio(d.name, d.slug);
    const disc = await probeDiscovery(d.domain);
    const docs = await probeDevDocs(d.domain);
    const az = d.authz || disc.found?.authorization_endpoint;
    const a = az ? await probeAuthorize(az) : null;
    const probes = [c.probe, ...disc.probes, docs.probe, ...(a ? [a] : [])].filter(Boolean).map((p: any) => ({ ...p, at: V }));
    const composio = {
      managed: c.managed, slug: c.slug, evidence: "tested",
      note: c.managed === "available" ? "Composio provides a managed OAuth app, so you can ship without registering your own. Bring your own app for your brand on the consent screen, custom scopes, or your own rate limits."
        : "Composio lists this toolkit but you must bring your own OAuth app (client ID + secret) in a custom auth config.",
    };
    const { authz, ...rest } = d;
    out.push(Guide.parse({ ...rest, composio, probes, verifiedAt: V, origin: "generated", model: MODEL }));
    console.log(d.slug, c.managed, probes.map((p: any) => p.result.slice(0, 80)));
  }
  writeFileSync("data/generated/index.json", JSON.stringify(out, null, 1));
})();
