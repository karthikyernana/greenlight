/* Hand-written structure for the 10 curated providers: gates, personalisation rules, alternatives, keywords and key facts.
   `find` is a phrase looked up in the fetched source; the sentence around it becomes the fact's verbatim quote.
   A fact whose phrase is not on the page is written as Uncertain, never silently kept as Sourced. */
import type { ReviewTier, GateKind, Condition } from "../lib/graph/schema";

export type OFact = { id: string; claim: string; url: string; find?: string; to?: string; status?: "tested" | "sourced" };
export type OGate = {
  id: string; kind: GateKind; label: string; plain: string; steps: string[]; caps: string[];
  skip?: { when: Condition; reason: string; facts?: string[]; warn?: string }[]; needsBusiness?: boolean; cap?: number; facts?: string[];
};
export type Overlay = {
  facts: OFact[];
  capTier?: Record<string, ReviewTier>;
  scopeTier?: Record<string, ReviewTier>;
  capFacts?: Record<string, string[]>;
  keywords?: Record<string, string[]>;
  addCaps?: { id: string; label: string; scopes: string[]; tier: ReviewTier; why: string; facts?: string[] }[];
  gates: OGate[];
  stepFacts?: Record<string, string[]>;
  stepSkip?: Record<string, { when: Condition; reason: string; facts?: string[] }[]>;
  alternatives?: { id: string; replace: string[]; with: string[]; label: string; tradeoff: string; facts?: string[] }[];
  composioFacts?: string[];
};

const G_SCOPES = "https://developers.google.com/workspace/gmail/api/auth/scopes";
const G_FAQ = "https://support.google.com/cloud/answer/13463817?hl=en";
const G_UNVERIFIED = "https://support.google.com/cloud/answer/7454865";
const G_CASA = "https://support.google.com/cloud/answer/13465431?hl=en";
const team = { audience: "team" as const };
const small = { audience: "public" as const, scale: "small" as const };
const comp = (slug: string) => `https://docs.composio.dev/toolkits/${slug}`;
const managedFact = (slug: string, yes = true): OFact => ({
  id: "composio-managed", claim: yes ? "Composio runs a managed OAuth app for this toolkit" : "Composio has no managed OAuth app for this toolkit",
  url: comp(slug), find: yes ? "Composio-managed OAuth available" : "Composio-managed OAuth not available", status: "tested",
});

export const overlays: Record<string, Overlay> = {
  gmail: {
    facts: [
      managedFact("gmail"),
      { id: "g-restricted", claim: "gmail.readonly, gmail.compose and gmail.metadata are restricted scopes", url: G_SCOPES, find: "Restricted scopes Scope code Description", to: "but not the email body." },
      { id: "g-send-sensitive", claim: "gmail.send is a sensitive scope, not restricted", url: G_SCOPES, find: "auth/gmail.send Send email on your behalf" },
      { id: "g-addon-sensitive", claim: "Add-on scopes that read the open message are sensitive", url: G_SCOPES, find: "gmail.addons.current.message.readonly View your email messages when the add-on is running" },
      { id: "g-brand-days", claim: "Brand verification takes 2–3 business days", url: G_FAQ, find: "2-3 Business days" },
      { id: "g-sensitive-days", claim: "Sensitive scope verification takes about 10 business days", url: G_FAQ, find: "10 Business days" },
      { id: "g-restricted-weeks", claim: "Restricted scope verification, including the security assessment, takes about 6 weeks", url: G_FAQ, find: "deleting user data upon user request. 6 weeks" },
      { id: "g-casa-annual", claim: "Restricted scopes need an annual third-party security assessment (CASA)", url: G_CASA, find: "annual security assessment" },
      { id: "g-internal", claim: "Internal apps used only inside your Workspace organisation skip verification", url: G_UNVERIFIED, find: "Internal apps: if your app is an internal web app" },
      { id: "g-cap100", claim: "Unverified apps show a warning screen and are limited to 100 new users", url: G_UNVERIFIED, find: "limited to 100 new users until it is verified" },
      { id: "g-cap-lifetime", claim: "The 100-user cap applies over the project's lifetime and cannot be reset", url: G_FAQ, find: "the user cap applies over the entire lifetime of the project" },
    ],
    scopeTier: {
      "https://www.googleapis.com/auth/gmail.readonly": "restricted",
      "https://www.googleapis.com/auth/gmail.send": "sensitive",
      "https://www.googleapis.com/auth/calendar.events": "sensitive",
      openid: "none", email: "none", profile: "none",
    },
    capFacts: { read: ["g-restricted"], send: ["g-send-sensitive"], calendar: ["g-sensitive-days"] },
    keywords: {
      signin: ["sign in", "sign-in", "login", "log in"],
      calendar: ["calendar", "meeting", "schedule", "events"],
      read: ["read", "triage", "inbox", "summari", "search", "classif", "monitor", "parse"],
      send: ["send", "reply to", "replies", "respond", "outreach"],
      draft: ["drafts replies", "draft replies", "draft", "compose"],
      addon: ["add-on", "addon", "open email"],
    },
    addCaps: [
      { id: "draft", label: "Draft replies", scopes: ["https://www.googleapis.com/auth/gmail.compose"], tier: "restricted", why: "gmail.compose is restricted: verification plus CASA", facts: ["g-restricted"] },
      { id: "addon", label: "Read the open email (add-on)", scopes: ["https://www.googleapis.com/auth/gmail.addons.current.message.readonly"], tier: "sensitive", why: "Add-on scopes only see the message the user has open; sensitive, not restricted", facts: ["g-addon-sensitive"] },
    ],
    gates: [
      {
        id: "brand", kind: "brand_verification", label: "Brand verification", plain: "Google checks your app name, logo and domain.", steps: ["domain", "brand"], caps: ["calendar", "read", "send", "draft", "addon"], facts: ["g-brand-days"],
        skip: [
          { when: team, reason: "Internal apps for one Workspace organisation skip verification", facts: ["g-internal"] },
          { when: small, reason: "Up to 100 users can use an unverified app", facts: ["g-cap100"], warn: "Users see an “unverified app” screen, and the 100-user cap is for the project's lifetime." },
        ],
      },
      {
        id: "scope-review", kind: "app_review", label: "Scope verification", plain: "Google reviews why you need each sensitive or restricted scope.", steps: ["video", "scopes"], caps: ["calendar", "read", "send", "draft", "addon"], facts: ["g-sensitive-days", "g-restricted-weeks"],
        skip: [
          { when: team, reason: "Internal apps for one Workspace organisation skip verification", facts: ["g-internal"] },
          { when: small, reason: "Up to 100 users can use an unverified app", facts: ["g-cap100", "g-cap-lifetime"], warn: "Users see an “unverified app” screen, and the 100-user cap is for the project's lifetime." },
        ],
      },
      {
        id: "casa", kind: "security_assessment", label: "CASA security assessment", plain: "An approved lab tests your app's security. Repeats every year.", steps: ["casa"], caps: ["read", "draft"], facts: ["g-casa-annual", "g-restricted-weeks"],
        skip: [
          { when: team, reason: "Internal apps for one Workspace organisation skip verification", facts: ["g-internal"] },
          { when: small, reason: "Up to 100 users can use an unverified app", facts: ["g-cap100"], warn: "Users see an “unverified app” screen, and the 100-user cap is for the project's lifetime." },
        ],
      },
    ],
    stepFacts: { brand: ["g-brand-days"], scopes: ["g-sensitive-days", "g-restricted-weeks"], casa: ["g-casa-annual", "g-restricted-weeks"] },
    alternatives: [
      { id: "send-not-draft", replace: ["draft"], with: ["send"], label: "Send replies with gmail.send instead of saving drafts", tradeoff: "Users can't review a draft before it goes out.", facts: ["g-send-sensitive", "g-restricted"] },
      { id: "addon-not-read", replace: ["read"], with: ["addon"], label: "Build a Gmail add-on that reads only the open email", tradeoff: "No background triage: the agent sees a message only while the user has it open.", facts: ["g-addon-sensitive"] },
    ],
    composioFacts: ["composio-managed"],
  },

  outlook: {
    facts: [
      managedFact("outlook"),
      { id: "ms-nov2020", claim: "Users in other tenants can't consent to unverified multitenant apps asking for more than sign-in", url: "https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview", find: "users can't consent to most newly registered multitenant apps that aren't publisher verified" },
      { id: "ms-other-tenants", claim: "The block applies only to users in tenants other than the one where the app is registered", url: "https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview", find: "which request consent from users in tenants that aren't the tenant where the app is registered" },
      { id: "ms-cpp", claim: "Publisher verification needs a verified Microsoft AI Cloud Partner Program account", url: "https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview", find: "Verifying an app includes using a Microsoft AI Cloud Partner Program" },
      { id: "ms-partnerid", claim: "You verify by entering your Partner One ID on the app registration", url: "https://learn.microsoft.com/en-us/entra/identity-platform/mark-app-as-publisher-verified", find: "Enter your Partner One ID and select Verify and save" },
      { id: "ms-admin", claim: "Application permissions need tenant-wide admin consent", url: "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent", find: "application permissions" },
    ],
    capFacts: { read: ["ms-nov2020"], send: ["ms-nov2020"], app: ["ms-admin"] },
    keywords: {
      signin: ["sign in", "login", "profile"],
      read: ["read", "triage", "inbox", "calendar", "summari", "search"],
      send: ["send", "reply", "draft", "compose"],
      app: ["org-wide", "all mailboxes", "background", "daemon", "no user present"],
    },
    gates: [
      {
        id: "publisher", kind: "publisher_verification", label: "Publisher verification", plain: "Microsoft confirms your company is real before other organisations' users can consent.", steps: ["domain", "partner", "verify"], caps: ["read", "send", "app"], needsBusiness: true, facts: ["ms-nov2020", "ms-cpp", "ms-partnerid"],
        skip: [{ when: team, reason: "Users in your own tenant aren't blocked by the unverified-publisher rule", facts: ["ms-other-tenants"] }],
      },
      { id: "admin", kind: "admin_approval", label: "Tenant admin consent", plain: "Each customer's IT admin has to approve org-wide access.", steps: ["admin"], caps: ["app"], facts: ["ms-admin"] },
    ],
    stepFacts: { verify: ["ms-partnerid"], partner: ["ms-cpp"], admin: ["ms-admin"] },
    alternatives: [
      { id: "delegated-not-app", replace: ["app"], with: ["read"], label: "Use delegated Mail.Read (acts as the signed-in user) instead of application permissions", tradeoff: "The agent only sees mailboxes of users who connected, not the whole org.", facts: ["ms-admin"] },
    ],
    composioFacts: ["composio-managed"],
  },

  slack: {
    facts: [
      managedFact("slack"),
      { id: "sl-10", claim: "Marketplace submissions need at least 10 active workspace installs, held through the whole review", url: "https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement", find: "at least 10 installations on active workspaces" },
      { id: "sl-review-time", claim: "Preliminary review takes up to 10 business days; functional review up to 10 weeks", url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide", find: "the preliminary part of the review takes up to 10 business days" },
      { id: "sl-unlisted", claim: "Unlisted distributed apps are not reviewed; only Marketplace apps are", url: "https://docs.slack.dev/app-management/distribution/", find: "Unlike unlisted distributed apps, apps listed in the Slack Marketplace are reviewed" },
      { id: "sl-llm", claim: "Marketplace apps may not use Slack data to train LLMs", url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements", find: "use Slack data to train Large Language Models" },
    ],
    capFacts: { post: ["sl-unlisted"], marketplace: ["sl-10", "sl-review-time"] },
    keywords: { signin: ["sign in", "login"], post: ["post", "message", "read", "channel", "notify", "summari", "reply", "triage"], marketplace: ["marketplace", "listed", "directory"] },
    gates: [
      { id: "marketplace", kind: "marketplace_listing", label: "Slack Marketplace review", plain: "10 active installs, then a two-stage review.", steps: ["installs", "submit"], caps: ["marketplace"], cap: 10, facts: ["sl-10", "sl-review-time"] },
    ],
    stepFacts: { installs: ["sl-10"], submit: ["sl-review-time"], distribute: ["sl-unlisted"] },
    stepSkip: { distribute: [{ when: team, reason: "An app installed only in your own workspace doesn't need public distribution", facts: ["sl-unlisted"] }] },
    composioFacts: ["composio-managed"],
  },

  hubspot: {
    facts: [
      managedFact("hubspot"),
      { id: "hs-caps", claim: "Unlisted Marketplace apps install in up to 25 accounts; private apps in up to 10 allowlisted accounts", url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot", find: "Privately distributed OAuth apps: can be installed in up to 10 allowlisted accounts" },
      { id: "hs-unlimited", claim: "Listed Marketplace apps have no install limit", url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot", find: "Marketplace OAuth app after being listed" },
      { id: "hs-3", claim: "Listing needs at least three active, unique installs", url: "https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements", find: "your app must have at least three active, unique installs" },
    ],
    capFacts: { crm: ["hs-caps"], scale: ["hs-unlimited", "hs-3"] },
    keywords: { crm: ["crm", "contact", "deal", "record", "read", "write", "update"], scale: ["many customers", "more than 25", "scale"], certified: ["certified", "badge"] },
    gates: [
      { id: "listing", kind: "install_cap", label: "Install cap until listed", plain: "25 customer accounts until the app is listed on the Marketplace.", steps: ["installs", "listing"], caps: ["scale"], cap: 25, facts: ["hs-caps", "hs-3"],
        skip: [{ when: team, reason: "Your own HubSpot account is well inside the install cap", facts: ["hs-caps"] }] },
      { id: "cert", kind: "marketplace_listing", label: "Certification", plain: "60 installs and 6 months listed.", steps: ["cert"], caps: ["certified"] },
    ],
    stepFacts: { installs: ["hs-3"], listing: ["hs-3"] },
    composioFacts: ["composio-managed"],
  },

  salesforce: {
    facts: [
      managedFact("salesforce"),
      { id: "sf-connected", claim: "Spring '26 restricts creating new Connected Apps; External Client Apps replace them", url: "https://www.salesforce.com/blog/spring-26-release-architect-highlights", find: "restricting Connected Apps creation" },
    ],
    capFacts: { api: ["sf-connected"] },
    keywords: { api: ["crm", "read", "write", "record", "opportunit", "account", "lead", "api"], appexchange: ["appexchange", "listed", "isv", "distribute"] },
    gates: [
      { id: "secreview", kind: "security_assessment", label: "AppExchange security review", plain: "Salesforce's security team tests your app before listing. Paid.", steps: ["partner", "package", "review"], caps: ["appexchange"], needsBusiness: true },
    ],
    stepFacts: { eca: ["sf-connected"] },
    composioFacts: ["composio-managed"],
  },

  instagram: {
    facts: [
      managedFact("instagram"),
      { id: "ig-advanced", claim: "Publishing to accounts you don't own needs Advanced Access: App Review plus Business Verification", url: "https://ugcapi.dev/guides/meta-app-review-content-publish/", find: "That means App Review and Business Verification" },
      { id: "ig-standard", claim: "Standard Access works for accounts that have a role on your app", url: "https://ugcapi.dev/guides/meta-app-review-content-publish/", find: "Meta apps start with Standard Access, which works for accounts that have a role on your app" },
    ],
    capFacts: { publish: ["ig-advanced"], comments: ["ig-advanced"], own: ["ig-standard"] },
    keywords: { own: ["my own account", "our account", "own account"], publish: ["post", "publish", "schedule", "upload", "content"], comments: ["comment", "dm", "message", "reply", "inbox"] },
    gates: [
      { id: "bizver", kind: "business_verification", label: "Business verification", plain: "Meta checks your legal business documents.", steps: ["bizver"], caps: ["publish", "comments"], needsBusiness: true, facts: ["ig-advanced"],
        skip: [{ when: team, reason: "Standard Access covers accounts with a role on your app", facts: ["ig-standard"] }] },
      { id: "review", kind: "app_review", label: "Meta App Review", plain: "Meta reviews a screencast of each permission in use.", steps: ["privacy", "screencast", "review"], caps: ["publish", "comments"], facts: ["ig-advanced"],
        skip: [{ when: team, reason: "Standard Access covers accounts with a role on your app", facts: ["ig-standard"] }] },
    ],
    stepFacts: { review: ["ig-advanced"], bizver: ["ig-advanced"], testers: ["ig-standard"] },
    composioFacts: ["composio-managed"],
  },

  linkedin: {
    facts: [
      managedFact("linkedin"),
      { id: "li-open", claim: "Open permissions are the only ones available without LinkedIn's approval", url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access", find: "Open Permissions are the only permissions that are available to all developers without special approval" },
      { id: "li-tiers", claim: "Community Management and Advertising APIs start at Development tier; Standard tier is a separate application", url: "https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-10", find: "All applications start with Development tier" },
      { id: "li-standard-req", claim: "Standard tier needs a fully integrated Community Management app", url: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2026-09", find: "you have fully integrated the Community Management APIs into your application" },
    ],
    capFacts: { signin: ["li-open"], share: ["li-open"], pages: ["li-tiers"], ads: ["li-tiers"] },
    keywords: { signin: ["sign in", "login"], share: ["post", "share", "publish"], pages: ["company page", "organization", "organisation", "page"], ads: ["ads", "campaign", "advertis"] },
    gates: [
      { id: "cm", kind: "partner_program", label: "Community Management API vetting", plain: "LinkedIn vets your company and use case, then a second review for full access.", steps: ["cmapp", "request", "standard"], caps: ["pages"], needsBusiness: true, facts: ["li-tiers", "li-standard-req"] },
      { id: "ads", kind: "partner_program", label: "Advertising API access", plain: "LinkedIn approves ad access separately.", steps: ["request"], caps: ["ads"], needsBusiness: true, facts: ["li-tiers"] },
    ],
    stepFacts: { standard: ["li-standard-req"], request: ["li-tiers"] },
    alternatives: [
      { id: "member-not-page", replace: ["pages"], with: ["share"], label: "Post as the member (w_member_social) instead of as the company page", tradeoff: "Posts appear on the person's profile, not the company page.", facts: ["li-open"] },
    ],
    composioFacts: ["composio-managed"],
  },

  twitter: {
    facts: [
      managedFact("twitter", false),
      { id: "x-per-request", claim: "X API charges per resource read and per request written, from prepaid credits", url: "https://docs.x.com/x-api/getting-started/pricing", find: "All prices are per resource fetched (reads) or per request (writes/actions)" },
      { id: "x-read-price", claim: "Reading a post costs $0.005", url: "https://docs.x.com/x-api/getting-started/pricing", find: "Posts: Read $0.005 per resource" },
    ],
    capFacts: { read: ["x-read-price", "x-per-request"], post: ["x-per-request"], dm: ["x-per-request"] },
    keywords: { read: ["read", "monitor", "search", "timeline", "mention"], post: ["post", "tweet", "publish", "reply"], dm: ["dm", "direct message"] },
    gates: [
      { id: "credits", kind: "payment", label: "Prepaid credits", plain: "No review, but every call is billed.", steps: ["credits"], caps: ["read", "post", "dm"], facts: ["x-per-request"] },
    ],
    stepFacts: { credits: ["x-per-request"] },
    composioFacts: ["composio-managed"],
  },

  github: {
    facts: [
      managedFact("github"),
      { id: "gh-prefer", claim: "GitHub prefers GitHub Apps over OAuth apps (fine-grained permissions, short-lived tokens)", url: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps", find: "GitHub Apps are preferred to OAuth apps" },
    ],
    capFacts: { identity: [], repos: [] },
    keywords: { identity: ["sign in", "login", "profile"], repos: ["repo", "issue", "pull request", "pr", "code", "commit", "review"], org: ["org", "organization", "organisation", "company"], marketplace: ["marketplace", "listed", "sell"] },
    gates: [
      { id: "org", kind: "admin_approval", label: "Org owner approval", plain: "Orgs that restrict apps need an owner to approve yours.", steps: ["org-approve"], caps: ["org"] },
      { id: "mkt", kind: "marketplace_listing", label: "Marketplace listing review", plain: "Optional: only to be listed or to sell.", steps: ["mkt"], caps: ["marketplace"] },
    ],
    stepFacts: { choose: ["gh-prefer"] },
    composioFacts: ["composio-managed"],
  },

  notion: {
    facts: [
      managedFact("notion"),
      { id: "nt-scope", claim: "A public connection's installation scope (Any workspace or Selected workspaces) is chosen at creation", url: "https://developers.notion.com/guides/get-started/public-connections", find: "you also choose its installation scope" },
      { id: "nt-eligible", claim: "Only Any-workspace public connections can be listed on the Marketplace", url: "https://developers.notion.com/guides/get-started/marketplace-listing", find: "Only public connections with an installation scope of Any workspace can be listed on the Marketplace" },
    ],
    capFacts: { content: ["nt-scope"], listing: ["nt-eligible"] },
    keywords: { content: ["page", "database", "doc", "note", "read", "write", "wiki"], email: ["email", "user info"], listing: ["marketplace", "listed", "gallery"] },
    gates: [
      { id: "listing", kind: "marketplace_listing", label: "Marketplace review", plain: "Optional: Notion reviews before listing.", steps: ["listing"], caps: ["listing"], facts: ["nt-eligible"] },
    ],
    stepFacts: { create: ["nt-scope"], listing: ["nt-eligible"] },
    composioFacts: ["composio-managed"],
  },
};
