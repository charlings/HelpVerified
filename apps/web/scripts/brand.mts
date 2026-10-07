/**
 * Builds transparent logo assets and favicons from the supplied gradient logo (white background).
 * Usage: pnpm --filter web brand
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "../../specs/frontend/brandfiles/HelpVerified Gradient Logo.png");
const brandDir = resolve(root, "src/assets/brand");
const faviconDir = resolve(root, "public/favicon");

// The wordmark starts at x≈675 in the 2058px source; everything left of this is the "H" mark.
const MARK_MAX_X = 640;
const THEME_COLOR = "#0158E1";
const ALPHA_FLOOR = 8 / 255;

/** GIMP-style "colour to alpha" against white: removes the background without leaving a halo. */
async function whiteToAlpha(input: sharp.Sharp): Promise<sharp.Sharp> {
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const alpha = Math.max(255 - r, 255 - g, 255 - b) / 255;
    // The source's "white" has JPEG-like noise (values 248–255); treat it as fully transparent so trim works.
    if (alpha < ALPHA_FLOOR) {
      data[i + 3] = 0;
      continue;
    }
    data[i] = Math.round(255 - (255 - r) / alpha);
    data[i + 1] = Math.round(255 - (255 - g) / alpha);
    data[i + 2] = Math.round(255 - (255 - b) / alpha);
    data[i + 3] = Math.round(alpha * 255);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function trimmed(img: sharp.Sharp): Promise<Buffer> {
  return await img
    .png()
    .toBuffer()
    .then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer());
}

async function square(mark: Buffer, size: number, padding: number, background?: string): Promise<Buffer> {
  const inner = Math.round(size * (1 - padding * 2));
  const resized = await sharp(mark)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

/** ICO container with embedded PNG images (supported by all current browsers). */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  await mkdir(brandDir, { recursive: true });
  await mkdir(faviconDir, { recursive: true });

  const meta = await sharp(source).metadata();
  const full = await trimmed(await whiteToAlpha(sharp(source)));
  const mark = await trimmed(
    await whiteToAlpha(sharp(source).extract({ left: 0, top: 0, width: MARK_MAX_X, height: meta.height! })),
  );

  await writeFile(resolve(brandDir, "logo-full.png"), full);
  await writeFile(resolve(brandDir, "logo-mark.png"), mark);

  const sizes = [16, 32, 48, 192, 512] as const;
  const pngs = new Map<number, Buffer>();
  for (const size of sizes) pngs.set(size, await square(mark, size, size <= 32 ? 0.02 : 0.08));

  await writeFile(resolve(faviconDir, "favicon-16.png"), pngs.get(16)!);
  await writeFile(resolve(faviconDir, "favicon-32.png"), pngs.get(32)!);
  await writeFile(resolve(faviconDir, "icon-192.png"), pngs.get(192)!);
  await writeFile(resolve(faviconDir, "icon-512.png"), pngs.get(512)!);
  // Apple touch icons render on a solid background; white matches the logo's original canvas.
  await writeFile(resolve(faviconDir, "apple-touch-icon.png"), await square(mark, 180, 0.12, "#ffffff"));
  await writeFile(
    resolve(faviconDir, "favicon.ico"),
    ico([16, 32, 48].map((size) => ({ size, data: pngs.get(size)! }))),
  );
  await writeFile(
    resolve(faviconDir, "site.webmanifest"),
    JSON.stringify(
      {
        name: "HelpVerified",
        short_name: "HelpVerified",
        icons: [
          { src: "/favicon/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/favicon/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        theme_color: THEME_COLOR,
        background_color: "#ffffff",
        display: "standalone",
      },
      null,
      2,
    ) + "\n",
  );

  const fullMeta = await sharp(full).metadata();
  const markMeta = await sharp(mark).metadata();
  console.log(`logo-full.png ${fullMeta.width}x${fullMeta.height}`);
  console.log(`logo-mark.png ${markMeta.width}x${markMeta.height}`);
  console.log(`favicons written to ${faviconDir}`);
}

await main();
