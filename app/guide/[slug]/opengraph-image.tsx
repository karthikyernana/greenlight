import { ImageResponse } from "next/og";
import { getGuide } from "@/lib/library";
import { headline, verdict, defaultSelection, gateLabel } from "@/lib/plan";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Greenlight: OAuth approval runway";

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  const name = g?.name || slug;
  const h = g ? headline(g) : null;
  const v = g ? verdict(g, defaultSelection(g)) : null;
  const cell = (label: string, value: string, hot = false) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, borderLeft: "2px solid #dcdcd5", paddingLeft: 24 }}>
      <div style={{ fontSize: 22, letterSpacing: 2, color: "#66665f", display: "flex" }}>{label}</div>
      <div style={{ fontSize: 64, fontWeight: 700, color: hot ? "#c03a00" : "#0f0f0d", display: "flex" }}>{value}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f5f5f2", padding: 64, color: "#0f0f0d", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28 }}>
          <div style={{ width: 18, height: 30, background: "#0f0f0d", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4 }}>
            <div style={{ width: 9, height: 9, borderRadius: 99, background: "#ff4f00" }} />
          </div>
          GREENLIGHT · OAUTH APPROVAL RUNWAY
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: -3 }}>{name}</div>
          {v && <div style={{ fontSize: 34, marginTop: 8, display: "flex" }}>{`${v.lead} ${v.pole || ""}`.slice(0, 110)}</div>}
        </div>
        {h && g && (
          <div style={{ display: "flex", borderTop: "3px solid #0f0f0d", paddingTop: 20 }}>
            {cell("DIFFICULTY", h.difficulty.label)}
            {cell("WAIT", h.wait, h.sch.daysMax >= 14)}
            {cell("GATE", gateLabel(g).length > 18 ? gateLabel(g).slice(0, 17) + "…" : gateLabel(g))}
          </div>
        )}
      </div>
    ),
    size
  );
}
