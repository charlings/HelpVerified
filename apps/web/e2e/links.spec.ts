import { expect, test } from "@playwright/test";
import { routes } from "../src/config/routes";

/*
 * M9 / spec acceptance: no broken links and no missing images on the public site. Starts at the home
 * page and follows every internal link it finds (workspace links lead to sign-in, which is fine).
 */

const MAX_PAGES = 60;

test("public site: every internal link resolves and every image loads", async ({ page, baseURL }) => {
  test.setTimeout(600_000);
  const origin = new URL(baseURL!).origin;
  const queue: string[] = [routes.home];
  const seen = new Set<string>(queue);
  const problems: string[] = [];

  while (queue.length > 0 && seen.size <= MAX_PAGES) {
    const path = queue.shift()!;
    const response = await page.goto(path);
    const status = response?.status() ?? 0;
    if (status >= 400) {
      problems.push(`${path}: HTTP ${status}`);
      continue;
    }
    // Workspace links redirect anonymous visitors to sign in; that's expected, not followed further.
    if (new URL(page.url()).pathname !== path.split("?")[0]) continue;

    await page.waitForLoadState("load");
    const broken = await page.evaluate(() =>
      [...document.images]
        .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute("loading") !== "lazy")
        .map((img) => img.currentSrc || img.src),
    );
    for (const src of broken) problems.push(`${path}: image failed to load ${src}`);

    const links = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href),
    );
    for (const href of links) {
      const url = new URL(href);
      if (url.origin !== origin || url.protocol.startsWith("mailto") || url.protocol.startsWith("tel")) continue;
      const next = `${url.pathname}${url.search}`;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  expect(problems, `checked ${seen.size} pages`).toEqual([]);
  expect(seen.size, "pages discovered").toBeGreaterThan(15);
});
