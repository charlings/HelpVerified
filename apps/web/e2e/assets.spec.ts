import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { imageWidths, images } from "../src/assets/images";
import { routes } from "../src/config/routes";

test("favicons, manifest, robots and sitemap are served", async ({ request }) => {
  for (const path of [
    "/favicon/favicon.ico",
    "/favicon/favicon-16.png",
    "/favicon/favicon-32.png",
    "/favicon/apple-touch-icon.png",
    "/favicon/icon-192.png",
    "/favicon/icon-512.png",
    "/favicon/site.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
  ]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const robots = await (await request.get("/robots.txt")).text();
  for (const prefix of [routes.family.home, routes.agency.home, routes.admin.home]) {
    expect(robots).toContain(`Disallow: ${prefix}`);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(routes.services);
  expect(sitemap).not.toContain(routes.family.home);
});

test("the logo keeps its proportions in the header, footer and auth layout at all four widths", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of [routes.home, routes.auth.login]) {
    for (const width of [375, 768, 1280, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const logos = page.locator('img[alt="HelpVerified"]');
      // Each layout shows a different logo (header, mobile band, footer), so wait for a visible one.
      await expect(logos.filter({ visible: true }).first()).toBeVisible();
      const ratios = await logos.evaluateAll((imgs) =>
        (imgs as HTMLImageElement[])
          .filter((img) => img.getBoundingClientRect().width > 0 && img.naturalWidth > 0)
          .map((img) => {
            const box = img.getBoundingClientRect();
            return { drawn: box.width / box.height, natural: img.naturalWidth / img.naturalHeight };
          }),
      );
      expect(ratios.length, `${path} at ${width}px`).toBeGreaterThan(0);
      for (const r of ratios) expect(Math.abs(r.drawn / r.natural - 1), `${path} at ${width}px`).toBeLessThan(0.02);
    }
  }
});

test("every image variant in the asset map exists", async ({ request }) => {
  for (const entry of Object.values(images)) {
    for (const width of imageWidths) {
      for (const ext of ["avif", "webp", "jpg"]) {
        const path = `${entry.src}-${width}.${ext}`;
        expect((await request.get(path)).status(), path).toBe(200);
      }
    }
  }
});

test("styleguide renders tokens with contrast ratios and passes axe", async ({ page }) => {
  await page.goto(routes.styleguide);
  await expect(page.getByRole("heading", { level: 1, name: "Styleguide" })).toBeVisible();
  await expect(page.getByText(/On white: 6\.0\d:1 \(AA\)/).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "HelpVerified" }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
