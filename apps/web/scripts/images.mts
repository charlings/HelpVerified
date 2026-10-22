/**
 * Produces responsive variants of the supplied photos for src/assets/images/index.ts.
 * Originals live outside git (ADR 0002). Usage: bun --filter web images
 */
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const sourceDir = resolve(root, "../../specs/frontend/brandfiles");
const outDir = resolve(root, "public/images");

const WIDTHS = [640, 1024, 1600, 2400] as const;
const BUDGET_WIDTH = 1600;
const BUDGET_BYTES = 300 * 1024;

const sources: Record<string, string> = {
  cleaner: "Photo1.jpg",
  driver: "Photo2.jpg",
  nanny: "Photo3.jpg",
};

const encoders = {
  avif: (img: sharp.Sharp) => img.avif({ quality: 50, effort: 4 }),
  webp: (img: sharp.Sharp) => img.webp({ quality: 72 }),
  jpg: (img: sharp.Sharp) => img.jpeg({ quality: 74, mozjpeg: true, progressive: true }),
} as const;

async function main() {
  await mkdir(outDir, { recursive: true });
  const overBudget: string[] = [];

  for (const [key, file] of Object.entries(sources)) {
    const input = resolve(sourceDir, file);
    for (const width of WIDTHS) {
      for (const [ext, encode] of Object.entries(encoders)) {
        const output = resolve(outDir, `${key}-${width}.${ext}`);
        await encode(sharp(input).rotate().resize({ width, withoutEnlargement: true })).toFile(output);
        const { size } = await stat(output);
        if (width === BUDGET_WIDTH) {
          console.log(`${key}-${width}.${ext}  ${(size / 1024).toFixed(0)} KB`);
          if (size > BUDGET_BYTES) overBudget.push(`${key}-${width}.${ext}`);
        }
      }
    }
  }

  if (overBudget.length > 0) {
    console.error(`Over the ${BUDGET_BYTES / 1024} KB budget at ${BUDGET_WIDTH}px: ${overBudget.join(", ")}`);
    process.exit(1);
  }
  console.log("All 1600px variants within budget.");
}

await main();
