import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size } = await context.params;
  const px = size === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f4a3e",
          color: "#f6f1e6",
          fontSize: Math.round(px * 0.46),
          fontWeight: 700,
        }}
      >
        Y
      </div>
    ),
    { width: px, height: px },
  );
}
