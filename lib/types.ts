import { z } from "zod";

export const Evidence = z.enum(["tested", "sourced", "uncertain"]);
export type Evidence = z.infer<typeof Evidence>;

/** Access tier of a capability. Drives difficulty. */
export const Tier = z.enum(["instant", "self_serve", "review", "restricted", "partner", "paid"]);
export type Tier = z.infer<typeof Tier>;

export const Owner = z.enum(["agent", "you", "both"]);
export type Owner = z.infer<typeof Owner>;

export const Source = z.object({ title: z.string(), url: z.string() });
export type Source = z.infer<typeof Source>;

export const Capability = z.object({
  id: z.string(),
  label: z.string(), // "Read email"
  scopes: z.array(z.string()).default([]),
  tier: Tier,
  why: z.string(), // one line: why this tier
  default: z.boolean().default(false),
  evidence: Evidence.default("sourced"),
  sources: z.array(z.number()).default([]), // indexes into guide.sources
});
export type Capability = z.infer<typeof Capability>;

export const Step = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  owner: Owner,
  agent: z.string().default(""), // what an agent can do here
  human: z.string().default(""), // what only a human can do
  activeMinutes: z.number().default(10), // hands-on effort
  waitDays: z.tuple([z.number(), z.number()]).default([0, 0]), // provider-side waiting [min,max]
  after: z.array(z.string()).default([]), // step ids that must finish first
  requiredFor: z.array(z.string()).default([]), // capability ids; empty = always
  link: z.string().optional(),
  cost: z.string().optional(),
  evidence: Evidence.default("sourced"),
  sources: z.array(z.number()).default([]),
});
export type Step = z.infer<typeof Step>;

export const Probe = z.object({
  label: z.string(),
  url: z.string(),
  result: z.string(),
  ok: z.boolean(),
  at: z.string(), // ISO date
});
export type Probe = z.infer<typeof Probe>;

export const Guide = z.object({
  slug: z.string(),
  name: z.string(),
  domain: z.string(),
  category: z.string().default(""),
  summary: z.string(), // the one-sentence verdict
  console: z.string().optional(), // where to register the app
  appType: z.string().default(""), // e.g. "OAuth app or GitHub App"
  gate: z.string().optional(), // short gate label for the board, e.g. "CASA security assessment"
  composio: z.object({
    managed: z.enum(["available", "not_available", "unknown"]),
    slug: z.string().optional(),
    note: z.string().default(""),
    evidence: Evidence.default("tested"),
  }),
  capabilities: z.array(Capability).min(1),
  steps: z.array(Step).min(1),
  launchToday: z.array(z.string()).default([]),
  rejections: z.array(z.string()).default([]),
  blockers: z.array(z.object({ problem: z.string(), fix: z.string() })).default([]),
  uncertain: z.array(z.string()).default([]),
  probes: z.array(Probe).default([]),
  sources: z.array(Source).default([]),
  verifiedAt: z.string(), // YYYY-MM-DD
  /** Re-verification of specific claims against live sources (v2). */
  checks: z.array(z.object({ claim: z.string(), status: z.enum(["confirmed", "corrected", "unverifiable"]), note: z.string(), url: z.string(), at: z.string() })).default([]),
  origin: z.enum(["curated", "generated"]).default("curated"),
  model: z.string().optional(),
});
export type Guide = z.infer<typeof Guide>;

export type IndexEntry = {
  slug: string;
  name: string;
  composioSlug?: string;
  managed: "available" | "not_available" | "unknown";
  category?: string;
  curated?: boolean;
  generated?: boolean;
  /** publishing state: curated (hand-researched), verified (agent-generated, passed every check), draft */
  status?: "curated" | "verified" | "draft";
  /** stored in the shared store (generated once, reused) */
  stored?: boolean;
  domain?: string;
  // headline for the board
  difficulty?: string;
  wait?: string;
  maxWait?: string;
  waitDays?: number; // default-selection max days (sort key)
  worstDays?: number;
  gate?: string;
  tags?: string[];
};
