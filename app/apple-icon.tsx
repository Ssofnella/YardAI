import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 96,
          fontWeight: 700,
        }}
      >
        Y
      </div>
    ),
    size,
  );
}
