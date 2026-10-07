import { expect, test } from "@playwright/test";
import { routes } from "../src/config/routes";
import { pageMeta } from "../src/content/metadata";

test.describe("services page", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("chips track the section in view", async ({ page }) => {
    await page.goto(routes.services);
    const chips = page.getByRole("navigation", { name: "Services on this page" });
    // Scroll until the Driver section's top has passed under the sticky header and chips (~149px tall at 1280).
    await page.evaluate(() => {
      const top = document.getElementById("driver")!.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: "instant" });
    });
    await expect(chips.getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "true");
    await expect(chips.getByRole("link", { name: "Nannies" })).not.toHaveAttribute("aria-current");
  });

  test("activating a chip moves focus to that section's heading", async ({ page }) => {
    await page.goto(routes.services);
    await page
      .getByRole("navigation", { name: "Services on this page" })
      .getByRole("link", { name: "Cleaners" })
      .click();
    await expect(page.getByRole("heading", { level: 2, name: "Cleaners" })).toBeFocused();
    await expect(page).toHaveURL(/#cleaner$/);
  });

  test("with reduced motion, revealed content is visible without scrolling", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(routes.services);
    const hidden = await page.$$eval(
      "[data-reveal]",
      (els) => els.filter((el) => getComputedStyle(el).opacity !== "1").length,
    );
    expect(hidden).toBe(0);
  });

  test("without reduced motion, content below the fold starts hidden and reveals on scroll", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(routes.services);
    const last = page.locator("[data-reveal]").last();
    await expect(last).toHaveAttribute("data-visible", "false");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute("data-visible", "true");
  });
});

test.describe("contact form (mock API)", () => {
  test("empty submit shows field errors and focuses the first", async ({ page }) => {
    await page.goto(routes.contact);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByLabel("Your name")).toBeFocused();
  });

  async function fill(page: import("@playwright/test").Page) {
    await page.getByLabel("Your name").fill("Ada Obi");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("What's this about?").selectOption("family");
    await page.getByLabel("Message").fill("I'd like help finding a live-in nanny in Ikeja.");
  }

  test("valid submit shows the success message", async ({ page }) => {
    await page.goto(routes.contact);
    await fill(page);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("heading", { name: /your message is on its way/ })).toBeFocused();
  });

  test("?mock_error=RATE_LIMITED shows the rate-limit message", async ({ page }) => {
    await page.goto(`${routes.contact}?mock_error=RATE_LIMITED`);
    await fill(page);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Your message wasn't sent" })).toContainText(
      "Too many attempts",
    );
  });
});

test.describe("metadata and demo mode", () => {
  for (const [key, meta] of Object.entries(pageMeta)) {
    test(`${key}: description and canonical`, async ({ page }) => {
      await page.goto(meta.path);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", meta.description);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${meta.path === "/" ? "/?" : meta.path}$`),
      );
      await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    });
  }

  test("Open Graph image is a PNG", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });

  test("demo mode pill is visible while mocking", async ({ page }) => {
    await page.goto(routes.home);
    await expect(page.getByText("Demo mode · data is not real")).toBeVisible();
  });

  test("no testimonials section while there are none", async ({ page }) => {
    await page.goto(routes.home);
    await expect(page.getByRole("heading", { name: "In their words" })).toHaveCount(0);
  });
});
