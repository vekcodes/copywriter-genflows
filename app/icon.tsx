import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a1f35",
          borderRadius: 6,
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: 20,
          color: "#e67e22",
        }}
      >
        &gt;_
      </div>
    ),
    size,
  );
}
