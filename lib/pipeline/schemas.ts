import { z } from "zod";

/* What each model stage must return. Lenient on shape (defaults, coercion), strict on the enums the rules engine reads. */

/** Models sometimes return {"a": {...}, "b": {...}} or a single object where a list belongs. */
function list<T extends z.ZodType>(item: T, min = 0, max = 50): z.ZodArray<T> {
  const fix = (v: unknown) => (v == null ? [] : Array.isArray(v) ? v : typeof v === "object" ? (Object.values(v as object).every((x) => x && typeof x === "object") ? Object.values(v as object) : [v]) : typeof v === "string" ? [v] : v);
  return z.preprocess((v) => { const a = fix(v); return Array.isArray(a) ? a.slice(0, max) : a; }, z.array(item).min(min)) as unknown as z.ZodArray<T>;
}

const tier = z.enum(["none", "sensitive", "restricted", "partner", "paid"]).catch("sensitive");
const quoted = { claim: z.string().default(""), quote: z.string().default(""), url: z.string().default("") };

export const ScoutOut = z.object({
  name: z.string().default(""),
  domain: z.string().default(""),
  console: z.string().default(""),
  docUrls: list(z.string()).default([]),
  hasOAuth: z.boolean().default(true),
});
export type ScoutOut = z.infer<typeof ScoutOut>;

export const ScopesOut = z.object({
  capabilities: list(z.object({
    id: z.string(),
    label: z.string(),
    keywords: list(z.string()).default([]),
    default: z.boolean().default(false),
    scopes: list(z.object({ name: z.string(), tier })).default([]),
    tier,
    why: z.string().default(""),
    evidence: z.object(quoted).default({ claim: "", quote: "", url: "" }),
  }), 1, 6),
});
export type ScopesOut = z.infer<typeof ScopesOut>;

const cond = z.object({ audience: z.enum(["team", "public"]).optional().catch(undefined), scale: z.enum(["small", "large"]).optional().catch(undefined), business: z.boolean().optional().catch(undefined) });

export const GatesOut = z.object({
  gates: list(z.object({
    id: z.string(),
    kind: z.enum(["app_review", "brand_verification", "security_assessment", "business_verification", "publisher_verification", "install_cap", "partner_program", "payment", "admin_approval", "marketplace_listing"]).catch("app_review"),
    label: z.string(),
    plain: z.string().default(""),
    forTiers: list(tier).default(["sensitive", "restricted"]),
    needsBusiness: z.boolean().default(false),
    skip: list(z.object({ when: cond, reason: z.string(), ...quoted })).default([]),
    evidence: z.object(quoted).default({ claim: "", quote: "", url: "" }),
  }), 0, 6).default([]),
  steps: list(z.object({
    id: z.string(),
    title: z.string(),
    detail: z.string().default(""),
    owner: z.enum(["agent", "you", "both"]).catch("both"),
    agent: z.string().default(""),
    human: z.string().default(""),
    effortMin: z.coerce.number().default(15),
    waitDays: z.array(z.coerce.number()).default([0, 0]),
    dependsOn: list(z.string()).default([]),
    gate: z.string().default(""), // "" = base step
    evidence: z.object(quoted).default({ claim: "", quote: "", url: "" }),
  }), 1, 10),
  summary: z.string().default(""),
});
export type GatesOut = z.infer<typeof GatesOut>;

export const CriticOut = z.object({
  issues: list(z.object({ factId: z.string(), problem: z.string(), query: z.string().default("") }), 0, 8).default([]),
});
export type CriticOut = z.infer<typeof CriticOut>;

export const RecheckOut = z.object({
  verdict: z.enum(["confirmed", "corrected", "unsupported"]).catch("unsupported"),
  claim: z.string().default(""),
  quote: z.string().default(""),
  url: z.string().default(""),
  tier: tier.optional(),
  waitDays: z.array(z.coerce.number()).optional(),
});
export type RecheckOut = z.infer<typeof RecheckOut>;
