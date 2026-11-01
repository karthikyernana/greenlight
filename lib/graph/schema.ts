import { z } from "zod";

/* Requirement Graph, schema v1.
   provider → capability → scopes → review tier → gates → steps.
   Every claim the plan depends on is a Fact with a source URL, a verbatim quote, a checked date and a status. */

export const GRAPH_SCHEMA = "greenlight.graph/1";

export const FactStatus = z.enum(["tested", "sourced", "uncertain"]);
export type FactStatus = z.infer<typeof FactStatus>;

export const Fact = z.object({
  id: z.string(),
  claim: z.string(),
  url: z.string().default(""),
  title: z.string().default(""),
  quote: z.string().default(""), // verbatim from the fetched page; "" when none was found
  checked: z.string(), // YYYY-MM-DD
  status: FactStatus,
  note: z.string().optional(), // e.g. "downgraded: quote not found in source"
});
export type Fact = z.infer<typeof Fact>;

/** Review tier of a scope, worst-first: what the provider makes you go through before strangers can grant it. */
export const ReviewTier = z.enum(["none", "sensitive", "restricted", "partner", "paid"]);
export type ReviewTier = z.infer<typeof ReviewTier>;
export const TIER_RANK: Record<ReviewTier, number> = { none: 0, paid: 1, sensitive: 2, restricted: 3, partner: 4 };

/* Personalisation. Defaults are the honest worst case for "real users can connect". */
export const Audience = z.enum(["team", "public"]);
export const Scale = z.enum(["small", "large"]); // small = up to 100 users
export const Profile = z.object({ audience: Audience.default("public"), scale: Scale.default("large"), business: z.boolean().default(true) });
export type Profile = z.infer<typeof Profile>;
export const DEFAULT_PROFILE: Profile = { audience: "public", scale: "large", business: true };

/** All listed keys must match. */
export const Condition = z.object({ audience: Audience.optional(), scale: Scale.optional(), business: z.boolean().optional() });
export type Condition = z.infer<typeof Condition>;

export const Scope = z.object({ name: z.string(), tier: ReviewTier, facts: z.array(z.string()).default([]) });
export type Scope = z.infer<typeof Scope>;

export const Capability = z.object({
  id: z.string(),
  label: z.string(),
  keywords: z.array(z.string()).default([]), // words in a need sentence that select this capability
  scopes: z.array(Scope).default([]),
  tier: ReviewTier, // capability tier = worst scope tier (or explicit for non-scope access like "listed on marketplace")
  why: z.string().default(""),
  default: z.boolean().default(false),
  gates: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]), // extra steps this capability needs that are not part of a gate
  facts: z.array(z.string()).default([]),
});
export type Capability = z.infer<typeof Capability>;

export const GateKind = z.enum([
  "app_review", "brand_verification", "security_assessment", "business_verification", "publisher_verification",
  "install_cap", "partner_program", "payment", "admin_approval", "marketplace_listing",
]);
export type GateKind = z.infer<typeof GateKind>;

export const Skip = z.object({ when: Condition, reason: z.string(), facts: z.array(z.string()).default([]), warn: z.string().optional() });
export type Skip = z.infer<typeof Skip>;

export const Gate = z.object({
  id: z.string(),
  kind: GateKind,
  label: z.string(),
  plain: z.string().default(""), // one line, no jargon
  steps: z.array(z.string()).default([]),
  skip: z.array(Skip).default([]), // first matching condition removes the gate
  needsBusiness: z.boolean().default(false), // individuals cannot pass it
  cap: z.number().optional(), // e.g. install cap before listing
  facts: z.array(z.string()).default([]),
});
export type Gate = z.infer<typeof Gate>;

export const Owner = z.enum(["agent", "you", "both"]);
export const GStep = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string().default(""),
  owner: Owner,
  agent: z.string().default(""),
  human: z.string().default(""),
  effortMin: z.number().default(10),
  wait: z.tuple([z.number(), z.number()]).default([0, 0]),
  dependsOn: z.array(z.string()).default([]),
  base: z.boolean().default(false), // needed whatever the capability (registration etc.)
  skip: z.array(Skip).default([]),
  link: z.string().optional(),
  cost: z.string().optional(),
  facts: z.array(z.string()).default([]),
});
export type GStep = z.infer<typeof GStep>;

/** "Instead of these capabilities, use those": the engine prices the swap and shows it only if it saves time. */
export const Alternative = z.object({
  id: z.string(),
  replace: z.array(z.string()), // capability ids
  with: z.array(z.string()), // capability ids
  label: z.string(),
  tradeoff: z.string(),
  facts: z.array(z.string()).default([]),
});
export type Alternative = z.infer<typeof Alternative>;

export const Probe = z.object({ label: z.string(), url: z.string(), result: z.string(), ok: z.boolean(), at: z.string() });

export const ProviderGraph = z.object({
  schema: z.literal(GRAPH_SCHEMA).default(GRAPH_SCHEMA),
  version: z.number().default(1),
  slug: z.string(),
  name: z.string(),
  domain: z.string(),
  category: z.string().default(""),
  console: z.string().optional(),
  appType: z.string().default(""),
  summary: z.string().default(""),
  composio: z.object({ managed: z.enum(["available", "not_available", "unknown"]), slug: z.string().optional(), note: z.string().default(""), facts: z.array(z.string()).default([]) }),
  capabilities: z.array(Capability).min(1),
  gates: z.array(Gate).default([]),
  steps: z.array(GStep).min(1),
  alternatives: z.array(Alternative).default([]),
  facts: z.array(Fact).default([]),
  context: z.object({
    launchToday: z.array(z.string()).default([]),
    rejections: z.array(z.string()).default([]),
    blockers: z.array(z.object({ problem: z.string(), fix: z.string() })).default([]),
    uncertain: z.array(z.string()).default([]),
  }).default({ launchToday: [], rejections: [], blockers: [], uncertain: [] }),
  probes: z.array(Probe).default([]),
  checks: z.array(z.object({ claim: z.string(), status: z.enum(["confirmed", "corrected", "unverifiable"]), note: z.string(), url: z.string(), at: z.string() })).default([]),
  origin: z.enum(["curated", "generated"]).default("curated"),
  verifiedAt: z.string(),
  model: z.string().optional(),
  traceId: z.string().optional(),
});
export type ProviderGraph = z.infer<typeof ProviderGraph>;

export type Need = { caps: string[]; profile: Profile };
