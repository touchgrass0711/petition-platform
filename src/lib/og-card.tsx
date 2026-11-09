import { ImageResponse } from "next/og";
import { milestoneLabel, type Milestone } from "@/lib/campaign";

export const ogSize = { width: 1200, height: 630 };

export type OgProgress = { count: number; goal: number; milestones?: Milestone[] };

/** "8,452 of 10,000 signed" plus the next milestone, or the over-goal percentage once the goal is passed. */
export function progressText({ count, goal, milestones = [] }: OgProgress) {
  const n = (v: number) => v.toLocaleString("en-US");
  const pct = goal > 0 ? Math.round((count / goal) * 100) : 0;
  const next = milestones.find((m) => m.count > count);
  return {
    headline: `${n(count)} of ${n(goal)} signed`,
    sub: count >= goal ? `Goal reached: ${pct}%` : next ? `Next: ${milestoneLabel(next)}` : `${pct}% of the goal`,
    fill: Math.min(100, Math.max(0, pct)),
  };
}

/** The 1200x630 share card used for `/` and every campaign page. */
export function ogCard(title: string, progress: OgProgress | null) {
  const p = progress && progressText(progress);
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: 80,
          background: "radial-gradient(80% 80% at 50% 0%, #262626, #0a0a0a)",
          color: "#fafafa",
        }}
      >
        <div style={{ fontSize: 28, color: "#a3a3a3", letterSpacing: 4, textTransform: "uppercase" }}>Petition</div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 16, letterSpacing: -2 }}>{title}</div>
        {p && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 40 }}>
              <span style={{ fontWeight: 700 }}>{p.headline}</span>
              <span style={{ color: "#a3a3a3" }}>{p.sub}</span>
            </div>
            <div style={{ display: "flex", marginTop: 20, height: 20, borderRadius: 10, background: "#404040" }}>
              <div style={{ width: `${p.fill}%`, height: "100%", borderRadius: 10, background: "#fafafa" }} />
            </div>
          </div>
        )}
      </div>
    ),
    ogSize,
  );
}
