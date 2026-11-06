import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };

/** The 1200x630 share card used for `/` and every campaign page. */
export function ogCard(title: string, signatureCount: number | null) {
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
        {signatureCount !== null && (
          <div style={{ fontSize: 40, marginTop: 28, color: "#a3a3a3" }}>{`${signatureCount.toLocaleString("en-US")} signatures`}</div>
        )}
      </div>
    ),
    ogSize,
  );
}
