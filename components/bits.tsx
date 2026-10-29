"use client";
import type { Evidence, Owner, Tier } from "@/lib/types";
import { TIER_META } from "@/lib/plan";

const DIFF_TONE: Record<string, string> = { Easy: "tone-go", Moderate: "tone-wait", Hard: "tone-hard", Gated: "tone-stop" };

export function DiffPill({ label }: { label: string }) {
  return <span className={`pill ${DIFF_TONE[label] || "tone-mute"}`}><span className="dot" />{label}</span>;
}

const TIER_TONE: Record<Tier, string> = { instant: "tone-go", self_serve: "tone-go", review: "tone-wait", restricted: "tone-hard", partner: "tone-stop", paid: "tone-info" };
export function TierPill({ tier }: { tier: Tier }) {
  return <span className={`pill ${TIER_TONE[tier]}`} title={TIER_META[tier].blurb}>{TIER_META[tier].label}</span>;
}

const EV: Record<Evidence, { label: string; cls: string; tip: string }> = {
  tested: { label: "Tested", cls: "tone-go", tip: "We ran a live, public probe against the provider" },
  sourced: { label: "Sourced", cls: "tone-info", tip: "Backed by a cited document" },
  uncertain: { label: "Uncertain", cls: "tone-wait", tip: "Not confirmed by a source; treat as an estimate" },
};
export function EvidenceBadge({ e, small }: { e: Evidence; small?: boolean }) {
  const m = EV[e];
  return (
    <span className={`pill ${m.cls} ${small ? "!px-1.5 !py-0 !text-[10.5px]" : ""}`} title={m.tip}>
      {e === "tested" ? "✓" : e === "sourced" ? "§" : "?"} {m.label}
    </span>
  );
}

export function OwnerBadge({ o }: { o: Owner }) {
  if (o === "agent") return <span className="pill tone-go">⚙ Agent can do it</span>;
  if (o === "you") return <span className="pill tone-mute">● Needs you</span>;
  return <span className="pill tone-info">⚙ + ● Agent preps, you finish</span>;
}

export function ComposioBadge({ managed }: { managed: "available" | "not_available" | "unknown" }) {
  if (managed === "available") return <span className="pill tone-go" title="Composio provides a managed OAuth app for this toolkit">Composio-managed ✓</span>;
  if (managed === "not_available") return <span className="pill tone-wait" title="Composio lists this toolkit but you must bring your own OAuth app">Bring your own app</span>;
  return <span className="pill tone-mute">Composio: unknown</span>;
}

export function Md({ text, className = "" }: { text: string; className?: string }) {
  // tiny, safe inline markdown: **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span className={`md ${className}`}>
      {parts.map((p, i) =>
        p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>
      )}
    </span>
  );
}

export function AppLogo({ slug, name, size = 32 }: { slug: string; name: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border hairline bg-white" style={{ width: size, height: size }}>
      <span className="absolute font-semibold text-ink-3" style={{ fontSize: size * 0.42 }}>{name.charAt(0)}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://logos.composio.dev/api/${slug}`} alt="" className="relative h-[68%] w-[68%] object-contain"
        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    </span>
  );
}
