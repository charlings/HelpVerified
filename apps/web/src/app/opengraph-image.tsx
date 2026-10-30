import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/config/site";

export const alt = `${site.name}: verified nannies, drivers and cleaners`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// next/og renders without CSS variables, so these mirror tokens.css (navy-900, blue-600, cyan-400, slate-600).
const colors = { navy: "#0A2249", blue: "#0158E1", cyan: "#00C2FD", body: "#475569", white: "#FFFFFF" };

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "src/assets/brand/logo-full.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: colors.white,
        padding: 72,
      }}
    >
      <img src={logoSrc} alt="" width={555} height={120} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: colors.navy, lineHeight: 1.1, maxWidth: 960 }}>
          Help you can trust, checked before they reach your door.
        </div>
        <div style={{ fontSize: 30, color: colors.body }}>Identity · Guarantor · References · Address</div>
      </div>
      <div
        style={{
          height: 16,
          borderRadius: 8,
          background: `linear-gradient(90deg, ${colors.blue}, ${colors.cyan})`,
        }}
      />
    </div>,
    size,
  );
}
