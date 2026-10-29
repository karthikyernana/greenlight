/* Hand-researched guides. Facts verified against the cited pages on 2026-10-30.
   Probes in data/seed-probes.json were run the same day from a public, unauthenticated client. */
import probes from "./seed-probes.json";

const V = "2026-10-30";
const P = (k: keyof typeof probes) => (probes as any)[k].probes;

// Shared Composio callback, used by every bring-your-own-app guide.
const COMPOSIO_CB = "https://backend.composio.dev/api/v3/toolkits/auth/callback";

export const seeds: any[] = [
  // ───────────────────────────── GitHub ─────────────────────────────
  {
    slug: "github", name: "GitHub", domain: "github.com", category: "Developer tools",
    summary: "The easiest provider on the list: register an app in two minutes, no review for any scope. The only real decision is OAuth app vs GitHub App.",
    console: "https://github.com/settings/developers", appType: "GitHub App (recommended) or OAuth app",
    composio: { managed: "available", slug: "github", note: "Composio's managed GitHub OAuth app works today, so you can ship without registering anything. Register your own when you want your name on the consent screen or your own rate-limit pool.", evidence: "tested" },
    capabilities: [
      { id: "identity", label: "Sign in / read profile", scopes: ["read:user", "user:email"], tier: "instant", why: "Any registered app can request it, no review", default: true, sources: [0] },
      { id: "repos", label: "Read & write repos, issues, PRs", scopes: ["repo"], tier: "instant", why: "No review. Org owners may have to approve the app before it can see org repos", default: true, sources: [0, 2] },
      { id: "org", label: "Act inside orgs with restrictions", scopes: ["read:org"], tier: "self_serve", why: "Each org's owner has to approve your app (OAuth app access restrictions)", sources: [2] },
      { id: "marketplace", label: "Listed or paid on GitHub Marketplace", scopes: [], tier: "review", why: "Listing goes through GitHub review. Paid plans need an organization-owned app", sources: [3] },
    ],
    steps: [
      { id: "choose", title: "Choose a GitHub App or an OAuth app", detail: "GitHub recommends GitHub Apps: fine-grained permissions, short-lived tokens, and they can act without a user. Use an OAuth app only when you need the classic `repo` scope model.", owner: "agent", agent: "Recommend a type from what your agent needs to do", human: "Approve the choice", activeMinutes: 5, sources: [1] },
      { id: "register", title: "Register the app", detail: "Settings → Developer settings → New GitHub App / OAuth App. Fill in name, homepage URL and callback URL (Composio BYO: " + COMPOSIO_CB + ").", owner: "both", agent: "Fill in the form and callback URLs; generate the manifest", human: "Click create while signed in and copy the client secret into your vault", activeMinutes: 10, link: "https://github.com/settings/developers", sources: [0] },
      { id: "org-approve", title: "Get org owners to approve the app", detail: "Orgs with OAuth app access restrictions block your app until an owner approves it. With a GitHub App, an org admin installs it on that org.", owner: "you", agent: "Draft the approval request message for org admins", human: "Send it; the org owner clicks approve", activeMinutes: 5, waitDays: [0, 3], requiredFor: ["org"], sources: [2], evidence: "sourced" },
      { id: "mkt", title: "Submit a Marketplace listing (optional)", detail: "Only needed to be listed or to sell. Requires a privacy policy, support contact, webhook for plan changes, and more than auth-only value.", owner: "both", agent: "Draft listing copy, privacy policy and support page", human: "Submit; organizations only, for paid plans", activeMinutes: 240, waitDays: [7, 21], requiredFor: ["marketplace"], sources: [3], evidence: "uncertain" },
    ],
    launchToday: ["Use Composio-managed GitHub auth: zero registration, live in minutes.", "Or register a GitHub App now. Nothing needs review to go live."],
    rejections: ["Marketplace: the app only does sign-in, with no integration value beyond auth", "Marketplace: links to privacy policy or support are broken"],
    blockers: [
      { problem: "Users in an org can't see org repos", fix: "The org restricts OAuth apps. Ask an org owner to approve the app under Settings → Third-party access, or switch to a GitHub App and have them install it." },
      { problem: "Hitting the 100-app limit", fix: "A user or org can own up to 100 OAuth apps and 100 GitHub Apps. Reuse one app with several callback URLs per environment." },
    ],
    uncertain: ["Marketplace review time isn't published. The 1–3 week range is our estimate."],
    probes: P("github"),
    sources: [
      { title: "GitHub Docs: Creating an OAuth app", url: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app" },
      { title: "GitHub Docs: Differences between GitHub Apps and OAuth apps", url: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps" },
      { title: "GitHub Docs: Limiting OAuth app and GitHub App access requests", url: "https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/limiting-oauth-app-and-github-app-access-requests-and-installations" },
      { title: "GitHub Docs: Requirements for listing an app", url: "https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app" },
      { title: "Composio: GitHub toolkit", url: "https://docs.composio.dev/toolkits/github" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── Notion ─────────────────────────────
  {
    slug: "notion", name: "Notion", domain: "notion.com", category: "Productivity",
    summary: "Self-serve. A public connection works for any workspace the moment you create it. Notion has no per-scope review; users choose which pages to share. Marketplace listing is optional.",
    console: "https://app.notion.com/developers/connections", appType: "Public connection (OAuth 2.0)",
    composio: { managed: "available", slug: "notion", note: "Composio-managed auth works today. Composio notes that actions then show “Composio” as the actor, not your app, which is a reason to bring your own.", evidence: "tested" },
    capabilities: [
      { id: "content", label: "Read & write shared pages/databases", scopes: ["(capabilities: read, update, insert content)"], tier: "self_serve", why: "No scope review. Access is limited to the pages each user picks", default: true, sources: [0, 1] },
      { id: "email", label: "Read user emails", scopes: ["(capability: read user information incl. email)"], tier: "self_serve", why: "A checkbox on the connection's capabilities", sources: [0] },
      { id: "listing", label: "Listed on Notion Marketplace", scopes: [], tier: "review", why: "Public connections go through a Notion security review before listing", sources: [2] },
    ],
    steps: [
      { id: "create", title: "Create a public connection", detail: "Developer portal → Public connections → Create. Choose an installation scope (Any workspace or Selected workspaces). **You can't change it later**, and only 'Any workspace' can be listed on the Marketplace.", owner: "both", agent: "Pre-fill the name, redirect URIs and capabilities", human: "Choose the installation scope (permanent) and create it", activeMinutes: 10, link: "https://app.notion.com/developers/connections", sources: [0, 1] },
      { id: "org", title: "Add organization details", detail: "Company name, website, privacy policy, terms of use and support email appear on the consent screen.", owner: "agent", agent: "Draft a privacy policy and terms page if you don't have them", human: "Publish them on your domain", activeMinutes: 30, sources: [3], evidence: "uncertain" },
      { id: "redirect", title: "Register exact redirect URIs", detail: "If you register more than one URI, the token request must include redirect_uri. Composio BYO: " + COMPOSIO_CB, owner: "agent", agent: "Configure the URIs and test the token exchange", activeMinutes: 10, sources: [4] },
      { id: "listing", title: "Submit the Marketplace listing (optional)", detail: "Only 'Any workspace' connections are eligible. Notion runs a security review before listing.", owner: "both", agent: "Draft listing copy and screenshots", human: "Submit and answer reviewer questions", activeMinutes: 120, waitDays: [5, 20], requiredFor: ["listing"], sources: [2], evidence: "uncertain" },
    ],
    launchToday: ["Composio-managed Notion auth works for any workspace today.", "Your own public connection is live the minute you create it. No review gates usage."],
    rejections: ["Marketplace: connection created with 'Selected workspaces only', which can't be listed and can't be changed"],
    blockers: [
      { problem: "API returns object_not_found for pages the user can see", fix: "Notion only exposes pages the user picked during OAuth. Send them back through the page picker, or have them add the connection to the page." },
      { problem: "Token exchange fails with redirect_uri errors", fix: "With several redirect URIs registered, include redirect_uri in the token request exactly as registered." },
    ],
    uncertain: ["Notion doesn't publish how long Marketplace review takes.", "The required organization fields come from third-party guides; Notion's current docs don't list them."],
    probes: P("notion"),
    sources: [
      { title: "Notion Docs: Authorization", url: "https://developers.notion.com/guides/get-started/authorization" },
      { title: "Notion Docs: Public connections", url: "https://developers.notion.com/guides/get-started/public-connections" },
      { title: "Notion Docs: List on the Marketplace", url: "https://developers.notion.com/guides/get-started/marketplace-listing" },
      { title: "Ampersand: Notion provider guide (org fields)", url: "https://docs.withampersand.com/provider-guides/notion" },
      { title: "Notion API: Create a token", url: "https://developers.notion.com/reference/create-a-token" },
      { title: "Composio: Notion toolkit", url: "https://docs.composio.dev/toolkits/notion" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── Slack ─────────────────────────────
  {
    slug: "slack", name: "Slack", domain: "slack.com", category: "Communication",
    summary: "You can distribute without review. Workspace admin policies are the real gate: strict workspaces block apps that aren't in the Marketplace, and Marketplace listing needs 10 active installs plus a review that can take weeks.",
    console: "https://api.slack.com/apps", appType: "Slack app (OAuth v2)",
    composio: { managed: "available", slug: "slack", note: "Composio-managed works today, but its app isn't in the Slack Marketplace yet, so users see a warning and strict workspaces need admin approval. Composio says a Marketplace review is in progress.", evidence: "tested" },
    capabilities: [
      { id: "signin", label: "Sign in with Slack", scopes: ["openid", "profile", "email"], tier: "instant", why: "OpenID Connect, no review", sources: [0] },
      { id: "post", label: "Post & read messages in workspaces", scopes: ["chat:write", "channels:history", "channels:read"], tier: "self_serve", why: "Activate public distribution yourself, no review. Some workspaces still need admin approval", default: true, sources: [0, 3] },
      { id: "marketplace", label: "Listed on Slack Marketplace (trusted install)", scopes: [], tier: "review", why: "10 active installs, then a multi-stage review", sources: [1, 2] },
    ],
    steps: [
      { id: "create", title: "Create the app from a manifest", detail: "api.slack.com/apps → Create New App → From manifest. Declare bot scopes and redirect URLs (Composio BYO: " + COMPOSIO_CB + ").", owner: "both", agent: "Write the manifest with least-privilege scopes", human: "Paste it while signed in and pick a dev workspace", activeMinutes: 15, link: "https://api.slack.com/apps", sources: [0] },
      { id: "distribute", title: "Activate public distribution", detail: "Four checks, all of which must pass: remove hard-coded tokens, add an OAuth redirect URL, use HTTPS for every URL, and review scopes.", owner: "agent", agent: "Fix any check that fails; test install on a second workspace", activeMinutes: 20, sources: [0, 4], evidence: "sourced" },
      { id: "installs", title: "Get 10 active workspace installs", detail: "Required before you can submit to the Marketplace, and the app has to stay at 10 or more for the whole review.", owner: "you", agent: "Draft the beta invite and an onboarding DM", human: "Recruit beta workspaces", activeMinutes: 120, waitDays: [7, 30], requiredFor: ["marketplace"], sources: [2] },
      { id: "submit", title: "Submit for Marketplace review", detail: "Preliminary feedback takes up to 10 business days, then a functional review. **Every resubmission resets your place in the queue.**", owner: "both", agent: "Pre-check against the guidelines; write the privacy policy, support page and test instructions", human: "Submit and respond to feedback", activeMinutes: 240, waitDays: [14, 70], after: ["installs"], requiredFor: ["marketplace"], sources: [1, 4] },
    ],
    launchToday: ["Turn on public distribution today. Any workspace that allows non-Marketplace apps can install right away.", "Recruit your 10 beta workspaces now. That clock is the longest one."],
    rejections: ["Requests more scopes than the features need", "Uses Slack data to train LLMs", "Lets AI make consequential decisions without human review", "Support or privacy page sits behind a login", "Fewer than 10 active installs during review"],
    blockers: [
      { problem: "“This app isn't listed in the Slack Marketplace” or an admin-approval request", fix: "The workspace restricts unlisted apps. Ask a workspace admin to approve the app, or have an Owner install it. The long-term fix is the Marketplace listing." },
      { problem: "Activate Public Distribution is greyed out", fix: "One of the four checks is failing. Most often a redirect URL uses http://, or a token is hard-coded." },
    ],
    uncertain: ["The total review time across both stages varies. Third parties report up to about 10 weeks."],
    probes: P("slack"),
    sources: [
      { title: "Slack Docs: App lifecycle & distribution", url: "https://docs.slack.dev/app-management/distribution/" },
      { title: "Slack Docs: Marketplace review guide", url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide" },
      { title: "Slack changelog: 10-install requirement (Sep 2026)", url: "https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement" },
      { title: "Composio: Slack toolkit FAQ (Marketplace warning)", url: "https://docs.composio.dev/toolkits/slack" },
      { title: "Slack Docs: Distributing in the Marketplace", url: "https://docs.slack.dev/slack-marketplace/distributing-your-app-in-the-slack-marketplace/" },
      { title: "Slack Docs: Marketplace guidelines", url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── HubSpot ─────────────────────────────
  {
    slug: "hubspot", name: "HubSpot", domain: "hubspot.com", category: "CRM",
    summary: "Usable right away, but capped by install count: 10 allow-listed accounts for private distribution, 25 for an unlisted Marketplace app. Getting past that needs a Marketplace listing, which requires 3 active installs and a review.",
    console: "https://developers.hubspot.com", appType: "App on the HubSpot developer platform (OAuth)",
    composio: { managed: "available", slug: "hubspot", note: "Composio-managed works, but HubSpot hasn't approved Composio's app yet, so users accept an “unverified app” warning. Composio gives no date for approval.", evidence: "tested" },
    capabilities: [
      { id: "crm", label: "Read & write CRM records", scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "oauth"], tier: "self_serve", why: "Works right away, up to 25 accounts before listing", default: true, sources: [1] },
      { id: "scale", label: "More than 25 customer accounts", scopes: [], tier: "review", why: "Unlimited installs only after Marketplace listing", default: true, sources: [0, 1] },
      { id: "certified", label: "Certified badge", scopes: [], tier: "review", why: "Needs 60 active installs and 6 months listed", sources: [2] },
    ],
    steps: [
      { id: "devacct", title: "Create a developer account and a test account", detail: "Apps live in a HubSpot developer account. New public apps have to use the current developer platform, built with projects and the CLI.", owner: "you", agent: "Scaffold the project with the HubSpot CLI", human: "Sign up and verify your email", activeMinutes: 20, link: "https://developers.hubspot.com", sources: [4] },
      { id: "app", title: "Define the app, scopes and redirect URLs", detail: "Configure OAuth in app-hsmeta.json and use the OAuth v3 endpoints. Composio BYO callback: " + COMPOSIO_CB, owner: "agent", agent: "Write the config with least-privilege scopes and deploy it", activeMinutes: 30, sources: [4] },
      { id: "aup", title: "Sign the Acceptable Use Policy", detail: "Until you sign the AUP, the app can only be installed in developer test accounts.", owner: "you", human: "Read and sign it in the developer account", activeMinutes: 5, sources: [1] },
      { id: "installs", title: "Reach 3 active installs", detail: "Unaffiliated production accounts making successful API calls in the last 30 days.", owner: "you", agent: "Draft the outreach to design partners", human: "Get 3 real customers to install", activeMinutes: 60, waitDays: [3, 21], after: ["aup"], requiredFor: ["scale"], sources: [0] },
      { id: "listing", title: "Submit the Marketplace listing", detail: "Needs a public setup guide (not behind a login), OAuth as the only auth method, and one app ID.", owner: "both", agent: "Write the setup guide and listing copy", human: "Submit; HubSpot reviews", activeMinutes: 180, waitDays: [10, 30], after: ["installs"], requiredFor: ["scale"], sources: [0, 3] },
      { id: "cert", title: "Apply for certification", detail: "60 active installs, listed for 6 months, plus a demo video.", owner: "both", agent: "Draft the demo video script", human: "Record and submit", activeMinutes: 240, waitDays: [180, 240], after: ["listing"], requiredFor: ["certified"], sources: [2] },
    ],
    launchToday: ["Ship with Composio-managed HubSpot for the first users (they'll see an unverified-app warning).", "Your own app covers up to 25 accounts before listing. That's enough for a design-partner cohort."],
    rejections: ["The listing redirects to another app or needs a second app to work", "The setup guide is behind a login or links to a generic homepage", "Asks users to paste OAuth codes or tokens", "Built on an unsupported developer platform version (after Nov 2, 2026)"],
    blockers: [
      { problem: "Install fails for a 26th customer", fix: "You've hit the 25-install cap for unlisted Marketplace apps. List the app (3 active installs needed) to remove it." },
      { problem: "Users see an “unverified app” warning", fix: "Verify your domain to soften the warning to a banner. Listing on the Marketplace removes it." },
    ],
    uncertain: ["HubSpot doesn't publish how long Marketplace listing review takes. The 10–30 day range is our estimate."],
    probes: P("hubspot"),
    sources: [
      { title: "HubSpot: App Marketplace listing requirements", url: "https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements" },
      { title: "HubSpot: Manage apps in HubSpot (install limits)", url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot" },
      { title: "HubSpot: Certification requirements", url: "https://developers.hubspot.com/docs/apps/developer-platform/list-apps/apply-for-certification/applying-for-app-certification" },
      { title: "HubSpot: Listing & certification updates (May 2026)", url: "https://developers.hubspot.com/changelog/app-listing-and-app-certification-requirement-updates-for-may-2026" },
      { title: "HubSpot: Authentication overview", url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview" },
      { title: "Composio: HubSpot toolkit FAQ", url: "https://docs.composio.dev/toolkits/hubspot" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── Microsoft (Outlook / Graph) ─────────────────────────────
  {
    slug: "outlook", name: "Microsoft Outlook (Graph)", domain: "microsoft.com", category: "Email & calendar",
    summary: "Registering the app takes minutes. Trust is the gate: without publisher verification, users in other tenants often can't consent, and many orgs require an admin to approve mail scopes regardless.",
    console: "https://entra.microsoft.com", appType: "Multitenant app registration (Microsoft Entra ID)",
    composio: { managed: "available", slug: "outlook", note: "Composio-managed works. Org tenants may still show “Needs admin approval”, which is a tenant policy and not something Composio controls.", evidence: "tested" },
    capabilities: [
      { id: "signin", label: "Sign in (work & personal accounts)", scopes: ["openid", "profile", "email", "offline_access", "User.Read"], tier: "instant", why: "Basic sign-in and profile are exempt from the unverified-publisher consent block", sources: [0] },
      { id: "read", label: "Read mail & calendar", scopes: ["Mail.Read", "Calendars.Read"], tier: "review", why: "Users outside your tenant can't consent to an unverified multitenant app. Admins may also require approval", default: true, sources: [0, 2] },
      { id: "send", label: "Send mail as the user", scopes: ["Mail.Send"], tier: "review", why: "Same publisher-verification gate. Often admin-restricted", sources: [0, 2] },
      { id: "app", label: "Org-wide access with no user present", scopes: ["Mail.Read (application)"], tier: "restricted", why: "Application permissions always need tenant admin consent", sources: [2, 3] },
    ],
    steps: [
      { id: "tenant", title: "Use a work (Entra) account, not a personal one", detail: "Apps registered under a personal Microsoft account can't be publisher-verified.", owner: "you", human: "Create or choose an Entra tenant for your company", activeMinutes: 20, sources: [4] },
      { id: "register", title: "Register a multitenant app", detail: "Entra admin center → App registrations → New. Supported account types: any org directory (+ personal accounts if needed). Add the redirect URI (Composio BYO: " + COMPOSIO_CB + ").", owner: "both", agent: "Fill in the registration and add delegated Graph permissions", human: "Create it while signed in; store the client secret", activeMinutes: 15, link: "https://entra.microsoft.com", sources: [0] },
      { id: "domain", title: "Verify your publisher domain (DNS)", detail: "Add a DNS-verified custom domain to the tenant or set the publisher domain. You need it before you can verify as a publisher.", owner: "both", agent: "Generate the DNS TXT record and check propagation", human: "Add the record at your DNS provider", activeMinutes: 20, waitDays: [0, 1], requiredFor: ["read", "send", "app"], sources: [5] },
      { id: "partner", title: "Enroll in the Microsoft AI Cloud Partner Program", detail: "Partner Center creates a Partner One ID (formerly MPN ID) and verifies your business: legal entity, address and an email on your domain.", owner: "you", agent: "Pre-fill the enrollment details; track verification email", human: "Provide legal entity details and approve the verification email", activeMinutes: 45, waitDays: [1, 10], requiredFor: ["read", "send", "app"], sources: [1, 4] },
      { id: "verify", title: "Mark the app as publisher verified", detail: "App registration → Branding & properties → Add Partner ID. The user needs the right roles in both Entra and Partner Center.", owner: "both", agent: "Check the role requirements first", human: "Enter the Partner One ID and click Verify", activeMinutes: 10, after: ["partner", "domain"], requiredFor: ["read", "send", "app"], sources: [4] },
      { id: "admin", title: "Get tenant admin consent where required", detail: "Application permissions, and tenants that block user consent, need an admin to grant consent through the admin-consent URL.", owner: "you", agent: "Generate the admin-consent URL and a one-page explainer for IT", human: "Send it to the customer's admin", activeMinutes: 15, waitDays: [1, 14], requiredFor: ["app"], sources: [3] },
    ],
    launchToday: ["Composio-managed Outlook works today for many consumer and business accounts.", "Start Partner Program enrollment now: business verification is the long pole and runs in parallel with your build.", "Ship sign-in plus User.Read first. Those scopes are exempt from the unverified-publisher block."],
    rejections: ["Publisher verification fails: the Partner One ID is a location ID, not the CPP account ID", "The signed-in user lacks roles in Entra or Partner Center", "App registered under a personal Microsoft account"],
    blockers: [
      { problem: "“Need admin approval” on the consent screen", fix: "The tenant blocks user consent or the app is unverified. Finish publisher verification and send the customer's admin your admin-consent URL." },
      { problem: "AADSTS errors about unverified publisher", fix: "Multitenant apps registered after Nov 2020 that request more than basic scopes need a verified publisher before users in other tenants can consent." },
    ],
    uncertain: ["Microsoft doesn't publish how long Partner Center business verification takes. The 1–10 day range is our estimate.", "Whether a given customer tenant needs admin consent depends on that tenant's own policy."],
    probes: P("outlook"),
    sources: [
      { title: "Microsoft Learn: Publisher verification overview", url: "https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview" },
      { title: "Microsoft Q&A: Verifying multitenant apps (MPN/business account)", url: "https://learn.microsoft.com/en-us/answers/questions/1838827/what-is-the-process-of-getting-app-verified-for-mu" },
      { title: "Microsoft Learn: Consent experience", url: "https://learn.microsoft.com/en-us/entra/identity-platform/application-consent-experience" },
      { title: "Microsoft Learn: Grant tenant-wide admin consent", url: "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent" },
      { title: "Microsoft Learn: Mark an app as publisher verified", url: "https://learn.microsoft.com/en-us/entra/identity-platform/mark-app-as-publisher-verified" },
      { title: "Microsoft Docs: Configure publisher domain", url: "https://github.com/MicrosoftDocs/entra-docs/blob/cd4a283704560f4a5ceee11d7915083aefc06cc5/docs/identity-platform/howto-configure-publisher-domain.md" },
      { title: "Composio: Outlook toolkit FAQ", url: "https://docs.composio.dev/toolkits/outlook" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── Gmail / Google ─────────────────────────────
  {
    slug: "gmail", name: "Gmail (Google)", domain: "google.com", category: "Email & calendar",
    summary: "Sign-in is instant. Reading or sending Gmail uses restricted scopes: Google verification plus an annual third-party CASA security assessment. Expect around 6+ weeks. Until then you're capped at 100 test users whose tokens expire every 7 days.",
    console: "https://console.cloud.google.com/auth/overview", appType: "Google Cloud OAuth client (Web application)",
    composio: { managed: "available", slug: "gmail", note: "Composio-managed Gmail skips verification and CASA for you. Users see “Composio” on the consent screen, not your app. Bring your own once you want your own brand there.", evidence: "tested" },
    capabilities: [
      { id: "signin", label: "Sign in with Google", scopes: ["openid", "email", "profile"], tier: "instant", why: "Basic identity scopes don't need verification, even in testing mode", default: true, sources: [1] },
      { id: "calendar", label: "Read/write Calendar", scopes: ["https://www.googleapis.com/auth/calendar.events"], tier: "review", why: "Sensitive scope: brand verification plus sensitive-scope verification (about 10 business days)", sources: [2, 3] },
      { id: "read", label: "Read email", scopes: ["https://www.googleapis.com/auth/gmail.readonly"], tier: "restricted", why: "Restricted scope: verification plus a CASA assessment every 12 months", default: true, sources: [0, 2, 4] },
      { id: "send", label: "Send email only", scopes: ["https://www.googleapis.com/auth/gmail.send"], tier: "review", why: "gmail.send is classed as sensitive, not restricted: no CASA needed", sources: [3] },
    ],
    steps: [
      { id: "project", title: "Create a Google Cloud project and enable the Gmail API", detail: "One project per environment. Enable the Gmail and/or Calendar API, or calls fail with “API has not been used in project”.", owner: "both", agent: "Write the gcloud commands and enable the APIs", human: "Sign in and create the project", activeMinutes: 10, link: "https://console.cloud.google.com", sources: [6] },
      { id: "consent", title: "Configure branding, audience and data access", detail: "External user type. Add an app name, logo, support email, authorized domains and privacy policy URL. List the exact scopes.", owner: "both", agent: "Draft the privacy policy, including Google's Limited Use disclosure", human: "Publish it on your verified domain", activeMinutes: 45, sources: [1, 5] },
      { id: "client", title: "Create the OAuth client (Web)", detail: "Credentials → Create OAuth client → Web application. Add redirect URIs (Composio BYO: " + COMPOSIO_CB + ").", owner: "agent", agent: "Add the exact redirect URIs and test the flow in Testing mode", activeMinutes: 10, sources: [6] },
      { id: "domain", title: "Verify domain ownership in Search Console", detail: "Every authorized domain on the consent screen must be verified by a project Owner or Editor.", owner: "both", agent: "Produce the DNS TXT record", human: "Add it at your DNS provider", activeMinutes: 15, waitDays: [0, 1], requiredFor: ["calendar", "read", "send"], sources: [5] },
      { id: "brand", title: "Submit for brand verification", detail: "Google checks the name, logo, domains and homepage. About 2–3 business days.", owner: "you", agent: "Pre-check the homepage, privacy link and logo against the requirements", human: "Click Submit for verification", activeMinutes: 10, waitDays: [2, 3], after: ["domain"], requiredFor: ["calendar", "read", "send"], sources: [2] },
      { id: "video", title: "Record the scope-justification demo video", detail: "An unlisted YouTube video showing the OAuth flow with the client ID visible, and how each scope is used.", owner: "both", agent: "Write the shot list and the justification text for each scope", human: "Record the screen and upload it", activeMinutes: 60, requiredFor: ["calendar", "read", "send"], sources: [0, 3] },
      { id: "scopes", title: "Sensitive/restricted scope verification", detail: "Sensitive: about 10 business days. Restricted: about 6 weeks including the security assessment.", owner: "you", agent: "Draft replies to reviewer emails", human: "Submit and respond within the reply window", activeMinutes: 30, waitDays: [10, 15], after: ["brand", "video"], requiredFor: ["calendar", "read", "send"], sources: [2] },
      { id: "casa", title: "CASA security assessment (restricted scopes)", detail: "A Google-empanelled assessor tests your app against the CASA (OWASP ASVS-based) framework. You get a Letter of Validation, and you redo it every 12 months.", owner: "both", agent: "Run the self-scan and fix findings; assemble the evidence pack", human: "Pick an assessor, pay any fee, sign off", activeMinutes: 960, waitDays: [21, 42], after: ["scopes"], requiredFor: ["read"], cost: "Assessor fees vary; some tiers are free or low-cost", sources: [0, 4, 7] },
    ],
    launchToday: ["Composio-managed Gmail: real users today, with no verification on your side.", "Or stay in Testing mode: up to 100 test users. Refresh tokens expire after 7 days, so plan for weekly reconnects.", "Ship gmail.send (sensitive) or sign-in first. Add gmail.readonly once CASA is done.", "Submit brand verification today. It takes 2–3 days and unblocks everything after it."],
    rejections: ["Requesting gmail.readonly or full mail access when gmail.send or metadata would do", "The demo video doesn't show the consent screen with the client ID, or doesn't show each scope in use", "Privacy policy missing the Limited Use disclosure, or not on the verified domain", "Homepage doesn't explain the app, or sits behind a login", "Requesting a new restricted scope later re-triggers review"],
    blockers: [
      { problem: "“Google hasn't verified this app” / app blocked", fix: "Stay under 100 test users in Testing mode, or submit for verification. For Workspace customers, their admin can trust your app in the Admin console." },
      { problem: "Users disconnected after a week", fix: "Testing-mode refresh tokens expire in 7 days. Publish to production (verification) or use Composio-managed auth." },
      { problem: "Verification email asks for more information", fix: "Reply in the same thread, and change only what they asked for. Unrelated edits can restart review." },
    ],
    uncertain: ["CASA assessor cost varies by tier and assessor, and Google doesn't publish it.", "Timelines are Google's estimates. Real waits vary with how many review rounds you need."],
    probes: P("gmail"),
    sources: [
      { title: "Google: Restricted scope verification", url: "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification" },
      { title: "Google: OAuth app state overview (testing, 100 users)", url: "https://developers.google.com/identity/protocols/oauth2/production-readiness/overview" },
      { title: "Google Cloud Help: Verification FAQ (2–3 days / 10 days / 6 weeks)", url: "https://support.google.com/cloud/answer/13463817?hl=en" },
      { title: "Google: Choose Gmail API scopes", url: "https://developers.google.com/workspace/gmail/api/auth/scopes" },
      { title: "Google Cloud Help: Annual recertification (CASA)", url: "https://support.google.com/cloud/answer/13463816?hl=en" },
      { title: "Google Cloud Help: Verification requirements", url: "https://support.google.com/cloud/answer/13464321" },
      { title: "Google: Using OAuth 2.0 for web server apps", url: "https://developers.google.com/identity/protocols/oauth2/web-server" },
      { title: "Google Cloud Help: Security assessment", url: "https://support.google.com/cloud/answer/13465431?hl=en" },
      { title: "Composio: Gmail toolkit FAQ", url: "https://docs.composio.dev/toolkits/gmail" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── Salesforce ─────────────────────────────
  {
    slug: "salesforce", name: "Salesforce", domain: "salesforce.com", category: "CRM",
    summary: "Changed in 2026: since Spring '26 you can't create new Connected Apps (unless Support enables it). Build an External Client App instead. Selling through AppExchange adds a paid security review that takes weeks.",
    console: "https://developer.salesforce.com/signup", appType: "External Client App (ECA)",
    composio: { managed: "available", slug: "salesforce", note: "Composio-managed works for connecting customer orgs. Some customer admins restrict uninstalled apps, which blocks any app, managed or yours.", evidence: "tested" },
    capabilities: [
      { id: "api", label: "Read & write CRM data via API", scopes: ["api", "refresh_token"], tier: "self_serve", why: "Create an ECA in your Developer Edition org. Customer orgs can authorize it", default: true, sources: [0, 1] },
      { id: "appexchange", label: "Listed on AppExchange / ISV distribution", scopes: [], tier: "restricted", why: "Partner Program, packaging, and a paid security review", sources: [2, 3] },
    ],
    steps: [
      { id: "org", title: "Get a free Developer Edition org", detail: "Your ECA lives here.", owner: "you", human: "Sign up and verify your email", activeMinutes: 15, link: "https://developer.salesforce.com/signup", sources: [0] },
      { id: "eca", title: "Create an External Client App", detail: "Setup → External Client App Manager → New. Enable OAuth, the scopes (api, refresh_token) and the callback URL (Composio BYO: " + COMPOSIO_CB + "). Connected Apps can't be created by default since Spring '26.", owner: "both", agent: "Prepare the settings and policies (PKCE on, refresh token policy)", human: "Create it in Setup and copy the consumer key and secret", activeMinutes: 20, sources: [0, 1] },
      { id: "policies", title: "Plan for 2026 OAuth security changes", detail: "Refresh-token idle TTL is capped at 30 days (production from Nov 4, 2026). Username-password and user-agent flows retire Feb 20, 2027.", owner: "agent", agent: "Use the web-server flow with PKCE and refresh proactively", activeMinutes: 30, sources: [4] },
      { id: "partner", title: "Join the Salesforce Partner Program (AppExchange)", detail: "Needed to package and list your app.", owner: "you", human: "Enroll your company and accept the agreements", activeMinutes: 60, waitDays: [1, 7], requiredFor: ["appexchange"], sources: [3] },
      { id: "package", title: "Package the ECA in a 2GP managed package", detail: "AppExchange guidance requires ECAs for new integrations, packaged for distribution.", owner: "agent", agent: "Set up the packaging and the scanner runs", activeMinutes: 480, after: ["partner"], requiredFor: ["appexchange"], sources: [2] },
      { id: "review", title: "AppExchange security review", detail: "Salesforce's Product Security team tests the solution and your external endpoints. A failed review means fix and resubmit.", owner: "both", agent: "Run Code Analyzer/Checkmarx and DAST scans; write the false-positive docs", human: "Pay the review fee and submit", activeMinutes: 960, waitDays: [28, 70], after: ["package"], requiredFor: ["appexchange"], cost: "Security review fee (paid; check current Partner pricing)", sources: [3], evidence: "sourced" },
    ],
    launchToday: ["Use Composio-managed Salesforce to connect customer orgs today.", "Or create your own ECA in a Developer org today. Customer orgs can authorize it straight away (subject to their admin policies)."],
    rejections: ["Security review: scanner findings with no false-positive documentation", "Insecure external endpoints (TLS, auth) found by DAST", "Using legacy flows (username-password) that are being retired"],
    blockers: [
      { problem: "“New Connected App” is missing or blocked", fix: "Expected since Spring '26. Create an External Client App, or ask Salesforce Support to enable Connected App creation." },
      { problem: "OAUTH_APPROVAL_ERROR_GENERIC / app blocked in the customer org", fix: "The customer's admin restricts uninstalled apps. They need to install or allow your app, or approve it under Connected Apps OAuth Usage." },
      { problem: "Customers get logged out after a month", fix: "Refresh tokens now expire after 30 days idle. Refresh on a schedule." },
    ],
    uncertain: ["The current security review fee and turnaround aren't on the cited pages. Both are estimates.", "Discovery advertises a dynamic client registration endpoint. Whether it's usable for third-party apps is untested."],
    probes: P("salesforce"),
    sources: [
      { title: "Salesforce Help: New Connected Apps can no longer be created (Spring '26)", url: "https://help.salesforce.com/s/articleView?id=005228017&language=en_US&type=1" },
      { title: "Salesforce: Spring '26 architect highlights", url: "https://www.salesforce.com/blog/spring-26-release-architect-highlights" },
      { title: "Salesforce Help: CA/ECA AppExchange security review guidance", url: "https://help.salesforce.com/s/articleView?id=005318040&language=en_US&type=1" },
      { title: "ISVforce Guide: AppExchange security review", url: "https://developer.salesforce.com/docs/atlas.en-us.packagingGuide.meta/packagingGuide/appexchange_security_review_overview.htm" },
      { title: "Salesforce Help: CA & ECA security requirement updates (2026)", url: "https://help.salesforce.com/s/articleView?id=005461287&language=es_MX&type=1" },
      { title: "Composio: Salesforce toolkit", url: "https://docs.composio.dev/toolkits/salesforce" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── Instagram (Meta) ─────────────────────────────
  {
    slug: "instagram", name: "Instagram (Meta)", domain: "instagram.com", category: "Social",
    summary: "Works for your own accounts on day one (Standard Access). Serving other businesses needs Advanced Access: Business Verification first, then App Review with a screencast for every permission. Only Business and Creator accounts are supported.",
    console: "https://developers.facebook.com/apps", appType: "Meta app with Instagram API (Instagram Login)",
    composio: { managed: "available", slug: "instagram", note: "Composio-managed works for basic flows. Composio notes that comment management needs permissions Meta must approve on the app, so some actions need your own app.", evidence: "tested" },
    capabilities: [
      { id: "own", label: "Manage accounts you own", scopes: ["instagram_business_basic", "instagram_business_content_publish"], tier: "self_serve", why: "Standard Access: works for people with a role on the app", sources: [0, 1] },
      { id: "publish", label: "Publish for customers' accounts", scopes: ["instagram_business_basic", "instagram_business_content_publish"], tier: "restricted", why: "Advanced Access = App Review + Business Verification", default: true, sources: [0, 1] },
      { id: "comments", label: "Manage comments / DMs", scopes: ["instagram_business_manage_comments", "instagram_business_manage_messages"], tier: "restricted", why: "Each permission is reviewed with its own screencast", sources: [0, 3] },
    ],
    steps: [
      { id: "app", title: "Create a Meta app (Business type) and add Instagram", detail: "developers.facebook.com/apps → Create app → add the Instagram product (Instagram Login). Add redirect URIs (Composio BYO: " + COMPOSIO_CB + ").", owner: "both", agent: "Configure the product, redirect URIs and webhooks", human: "Create it with a Meta developer account", activeMinutes: 20, link: "https://developers.facebook.com/apps", sources: [1] },
      { id: "testers", title: "Add test users and a Business/Creator account", detail: "Standard Access only works for accounts with a role on the app.", owner: "you", human: "Switch the test IG account to Business or Creator and accept the tester invite", activeMinutes: 15, sources: [1, 4] },
      { id: "bizver", title: "Business Verification (Meta Business Manager)", detail: "Legal name, address, phone and a matching document or domain. Do this first: App Review won't succeed without it.", owner: "you", agent: "Collect and check the documents for name/address mismatches", human: "Upload legal docs and confirm the phone or email", activeMinutes: 45, waitDays: [2, 14], requiredFor: ["publish", "comments"], sources: [1, 3] },
      { id: "privacy", title: "Privacy policy, data deletion URL, app icon, Live mode", detail: "Needed before you can submit.", owner: "agent", agent: "Draft the privacy policy and a data-deletion callback/instructions page", activeMinutes: 60, requiredFor: ["publish", "comments"], sources: [3] },
      { id: "screencast", title: "Record a screencast for each permission", detail: "Show the full user journey: connect the account, grant the permission, then use it in your UI.", owner: "both", agent: "Write the shot list, reviewer test steps and usage notes for each permission", human: "Record the screencasts", activeMinutes: 120, requiredFor: ["publish", "comments"], sources: [3] },
      { id: "review", title: "Submit App Review for Advanced Access", detail: "Request only what you use. Every extra permission needs its own justification.", owner: "both", agent: "Draft the justifications", human: "Submit and respond to rejections", activeMinutes: 30, waitDays: [5, 21], after: ["bizver", "privacy", "screencast"], requiredFor: ["publish", "comments"], sources: [0] },
    ],
    launchToday: ["Ship for your own and your team's accounts today with Standard Access.", "Start Business Verification immediately. It gates App Review and is the slowest document step."],
    rejections: ["The screencast doesn't show the permission being used in your UI", "App Review submitted before Business Verification passed", "Requesting permissions the product doesn't use", "The reviewer can't log in: missing test credentials or steps", "Personal Instagram accounts used in the demo"],
    blockers: [
      { problem: "Permissions work for you but not for customers", fix: "You only have Standard Access. Get Advanced Access (Business Verification + App Review)." },
      { problem: "A customer's account can't connect", fix: "It must be a Business or Creator account. Personal accounts aren't supported." },
    ],
    uncertain: ["Meta doesn't publish review times. The 5–21 day range comes from developer reports."],
    probes: P("instagram"),
    sources: [
      { title: "Meta: App Review for Instagram API", url: "https://developers.facebook.com/docs/instagram-platform/app-review" },
      { title: "Meta: Instagram Platform overview (Standard vs Advanced Access)", url: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/overview" },
      { title: "Meta: Business Login for Instagram", url: "https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login" },
      { title: "UGC API: Meta App Review for content publishing (screencasts, sequence)", url: "https://ugcapi.dev/guides/meta-app-review-content-publish/" },
      { title: "Composio: Instagram toolkit FAQ", url: "https://docs.composio.dev/toolkits/instagram" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── LinkedIn ─────────────────────────────
  {
    slug: "linkedin", name: "LinkedIn", domain: "linkedin.com", category: "Social",
    summary: "Sign-in and posting as the member are self-serve and instant. Anything company-page or marketing related is partner-gated: you apply, LinkedIn vets you, and approval isn't guaranteed.",
    console: "https://www.linkedin.com/developers/apps", appType: "LinkedIn developer app",
    composio: { managed: "available", slug: "linkedin", note: "Composio-managed works for the standard scopes. LinkedIn won't combine some scopes in one app (e.g. w_member_social with r_organization_admin), so those need your own app.", evidence: "tested" },
    capabilities: [
      { id: "signin", label: "Sign In with LinkedIn (OIDC)", scopes: ["openid", "profile", "email"], tier: "instant", why: "Self-serve product, added automatically to new apps", default: true, sources: [0, 3] },
      { id: "share", label: "Post as the member", scopes: ["w_member_social"], tier: "instant", why: "“Share on LinkedIn” is self-serve", default: true, sources: [0, 3] },
      { id: "pages", label: "Manage company pages", scopes: ["w_organization_social", "r_organization_social", "rw_organization_admin"], tier: "partner", why: "Community Management API: access request plus vetting, development tier first", sources: [1, 2] },
      { id: "ads", label: "Ads & marketing data", scopes: ["r_ads", "rw_ads", "r_ads_reporting"], tier: "partner", why: "Advertising API needs approval", sources: [0, 2] },
    ],
    steps: [
      { id: "page", title: "Create (or pick) a LinkedIn Company Page", detail: "Every app must be associated with a company page, and a page super admin has to verify the association.", owner: "you", human: "Create the page or ask its super admin to verify the app", activeMinutes: 15, waitDays: [0, 2], sources: [1, 4] },
      { id: "app", title: "Create the developer app", detail: "Add the self-serve products (Sign In with LinkedIn using OIDC, Share on LinkedIn) and redirect URLs (Composio BYO: " + COMPOSIO_CB + ").", owner: "both", agent: "Configure the products and redirect URLs", human: "Create it while signed in", activeMinutes: 10, link: "https://www.linkedin.com/developers/apps", sources: [0] },
      { id: "cmapp", title: "Create a separate app just for Community Management", detail: "Community Management has to be the only product on its app. The request button is greyed out if other products are attached.", owner: "both", agent: "Set up the second app", human: "Create it and verify it with the page", activeMinutes: 15, requiredFor: ["pages"], sources: [5] },
      { id: "request", title: "Submit the access request form", detail: "Use a company email (personal email addresses fail vetting). Describe a supported use case that complies with the Marketing API terms.", owner: "both", agent: "Draft the use-case description against the API terms", human: "Submit as the legal entity", activeMinutes: 45, waitDays: [7, 30], after: ["cmapp"], requiredFor: ["pages", "ads"], sources: [1] },
      { id: "standard", title: "Build on the development tier, then request the Standard tier", detail: "The Standard tier needs a fully integrated app and a second review (screencast and test access).", owner: "both", agent: "Build against the dev tier; prepare the review materials", human: "Submit the upgrade request", activeMinutes: 480, waitDays: [14, 45], after: ["request"], requiredFor: ["pages"], sources: [1] },
    ],
    launchToday: ["Ship sign-in plus posting as the member today. Both are self-serve.", "Apply for Community Management on a separate app now if you'll ever need company pages. Vetting is slow and uncertain."],
    rejections: ["Personal email or an unverified company page on the access request", "Use case not supported by the Marketing API terms (e.g. scraping, automating member outreach)", "The app has other products attached (Community Management must be alone)", "Requesting Standard tier before the integration is complete"],
    blockers: [
      { problem: "The Community Management request button is greyed out", fix: "Remove other products, or create a new app that only has Community Management." },
      { problem: "Rejected during vetting", fix: "File a vetting appeal through the LinkedIn contact form (Form Type: Vetting Appeal) with your client ID." },
    ],
    uncertain: ["LinkedIn doesn't publish vetting times. The ranges shown are estimates."],
    probes: P("linkedin"),
    sources: [
      { title: "Microsoft Learn: Getting access to LinkedIn APIs", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access" },
      { title: "Microsoft Learn: Community Management app review", url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2026-09" },
      { title: "Microsoft Learn: Increasing access (Marketing APIs)", url: "https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-10" },
      { title: "LinkedIn Help: Self-serve products enabled on new apps", url: "https://www.linkedin.com/help/lms/answer/a522935" },
      { title: "Microsoft Learn: Community Management migration guide (page/admin requirements)", url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide?view=li-lms-2026-09" },
      { title: "Microsoft Learn: LinkedIn API partner support (greyed-out button, appeals)", url: "https://learn.microsoft.com/en-us/linkedin/shared/linkedin-api-partner-support-guide" },
      { title: "Composio: LinkedIn toolkit FAQ (scope combinations)", url: "https://docs.composio.dev/toolkits/linkedin" },
    ],
    verifiedAt: V,
  },

  // ───────────────────────────── X (Twitter) ─────────────────────────────
  {
    slug: "twitter", name: "X (Twitter)", domain: "x.com", category: "Social",
    summary: "There's no approval queue. Money is the gate: since Feb 2026 the X API is pay-per-use, with no free tier. Composio dropped its managed X app, so you have to bring your own.",
    console: "https://console.x.com", appType: "X developer app (OAuth 2.0 with PKCE)",
    composio: { managed: "not_available", slug: "twitter", note: "Composio removed managed Twitter credentials in Feb 2026. You need your own developer app and credits.", evidence: "tested" },
    capabilities: [
      { id: "read", label: "Read posts & users", scopes: ["tweet.read", "users.read", "offline.access"], tier: "paid", why: "About $0.005 per post read and $0.01 per user read", sources: [0, 2] },
      { id: "post", label: "Post on behalf of users", scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"], tier: "paid", why: "About $0.015 per post, more if it contains a link", default: true, sources: [0, 3] },
      { id: "dm", label: "Read/send DMs", scopes: ["dm.read", "dm.write"], tier: "paid", why: "Billed per DM event", sources: [0] },
    ],
    steps: [
      { id: "account", title: "Sign up for a developer account in the Developer Console", detail: "console.x.com. Accept the developer terms and describe your use case.", owner: "you", human: "Sign up with the X account that will own the app", activeMinutes: 15, link: "https://console.x.com", sources: [1] },
      { id: "credits", title: "Add a payment method and buy credits", detail: "Prepaid credits are deducted per request, and calls fail at zero. Set a spending limit and auto-recharge. New accounts can earn up to $70 in one-time free credits.", owner: "you", human: "Add a card, buy credits and set a cap", activeMinutes: 10, cost: "Pay-per-use; no minimum", sources: [0, 4] },
      { id: "app", title: "Create the app, set Read+Write, OAuth 2.0", detail: "User authentication settings: type Web App, callback URL (Composio BYO: " + COMPOSIO_CB + "), website URL. Posting needs a user-context token, not the app bearer token.", owner: "both", agent: "Configure user auth settings and the callback; test PKCE", human: "Create it in the console", activeMinutes: 15, sources: [1, 3] },
      { id: "budget", title: "Model your per-user cost", detail: "Agents that read timelines can burn credits fast. Cache reads and dedupe.", owner: "agent", agent: "Estimate monthly cost from expected calls per user", activeMinutes: 30, sources: [0] },
    ],
    launchToday: ["Live the same day: there's no review. Budget for credits first.", "Composio can't do this one for you. Bring your own app."],
    rejections: ["Use cases flagged as LLM-generated spam or automation abuse can be restricted (X tightened self-serve rules in 2026)"],
    blockers: [
      { problem: "403 when posting", fix: "You're using the app-only bearer token. Posting needs an OAuth 2.0 user token with tweet.write, and the app set to Read and Write." },
      { problem: "Requests suddenly fail", fix: "Your credit balance hit zero or the spending cap. Top up or turn on auto-recharge." },
    ],
    uncertain: ["X changes prices and rules often. Recheck the pricing page before launch."],
    probes: P("twitter"),
    sources: [
      { title: "X Docs: Pay-per-usage pricing and credits", url: "https://docs.x.com/x-api/getting-started/pricing" },
      { title: "X Docs: Developer Console", url: "https://docs.x.com/fundamentals/developer-portal" },
      { title: "X Docs: Changelog (Pay-per-use launch Feb 6, 2026)", url: "https://docs.x.com/changelog" },
      { title: "Outstand: X API pricing 2026 (post costs)", url: "https://www.outstand.so/blog/x-api-pricing" },
      { title: "X Docs: Overview (free credit incentives)", url: "https://docs.x.com/" },
      { title: "Composio: Twitter toolkit FAQ (managed credentials removed)", url: "https://docs.composio.dev/toolkits/twitter" },
    ],
    verifiedAt: V,
  },
];
