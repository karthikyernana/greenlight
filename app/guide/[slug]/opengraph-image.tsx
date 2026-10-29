import { ImageResponse } from "next/og";
import { getGuide } from "@/lib/library";
import { headline } from "@/lib/plan";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Greenlight OAuth approval guide";

const TONE: Record<string, [string, string]> = { Easy: ["#e3f1e8", "#1d7a4c"], Moderate: ["#fbf0d9", "#a46a00"], Hard: ["#fbe6da", "#b8501c"], Gated: ["#f8e0de", "#a8322d"] };

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  const name = g?.name || slug;
  const h = g ? headline(g) : null;
  const [bg, fg] = TONE[h?.difficulty.label || "Moderate"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f5f3ee", padding: 72, fontFamily: "serif", color: "#16150f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontFamily: "sans-serif" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#16150f", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 99, background: "#3ddc84" }} />
          </div>
          Greenlight · OAuth approval guide
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, letterSpacing: -2 }}>{name}</div>
          {h && (
            <div style={{ display: "flex", gap: 24, marginTop: 24, alignItems: "center", fontFamily: "sans-serif" }}>
              <div style={{ background: bg, color: fg, borderRadius: 999, padding: "10px 28px", fontSize: 34 }}>{h.difficulty.label}</div>
              <div style={{ fontSize: 40, display: "flex" }}>{`Time to full approval: ${h.wait}`}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 26, color: "#4a4840", fontFamily: "sans-serif", display: "flex" }}>{(() => { const t = g?.summary || "Scope-aware setup & approval guide"; return t.length > 140 ? t.slice(0, t.lastIndexOf(" ", 137)) + "…" : t; })()}</div>
      </div>
    ),
    size
  );
}
