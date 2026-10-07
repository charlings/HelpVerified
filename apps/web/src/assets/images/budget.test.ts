// @vitest-environment node
/**
 * Spec requirement 10 / acceptance: each optimised photo at 1600 px is ≤ 300 KB, in every format the
 * image script produces, and every width the asset map relies on exists.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageWidths, images } from "./index";

const publicImages = join(__dirname, "..", "..", "..", "public", "images");
const WIDTHS = imageWidths;
const FORMATS = ["avif", "webp", "jpg"] as const;
const BUDGET_1600 = 300 * 1024;

// `src` is the base path of the variants, e.g. /images/nanny.
const names = Object.values(images).map((img) => img.src.split("/").pop()!);

describe.each(names)("%s", (name) => {
  it.each(FORMATS)("%s exists at every width", (format) => {
    for (const w of WIDTHS)
      expect(existsSync(join(publicImages, `${name}-${w}.${format}`)), `${name}-${w}.${format}`).toBe(true);
  });

  it.each(FORMATS)("%s at 1600 px is within 300 KB", (format) => {
    expect(statSync(join(publicImages, `${name}-1600.${format}`)).size).toBeLessThanOrEqual(BUDGET_1600);
  });
});
