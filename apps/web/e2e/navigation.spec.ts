import { expect, test } from "@playwright/test";
import { routes } from "../src/config/routes";
import { roleForPath, signInAs } from "./helpers/session";

test.describe("marketing header — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Services menu is fully keyboard operable", async ({ page }) => {
    await page.goto(routes.about);
    const header = page.getByRole("navigation", { name: "Main" });
    const trigger = header.getByRole("button", { name: "Services" });

    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // logo
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const allServices = header.getByRole("link", { name: "All services" });
    await expect(allServices).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(allServices).toBeFocused();
    for (const name of ["Nannies", "Drivers", "Cleaners"]) {
      await page.keyboard.press("Tab");
      await expect(header.getByRole("link", { name })).toBeFocused();
    }

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("current page is marked in the header", async ({ page }) => {
    await page.goto(routes.pricing);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("marketing header — mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("drawer traps focus, closes on Escape and returns focus", async ({ page }) => {
    await page.goto(routes.home);
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus escaped the drawer after ${i + 1} tabs`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("choosing a link navigates and closes the drawer", async ({ page }) => {
    await page.goto(routes.home);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(routes.pricing);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("app shell per viewport", () => {
  const nested = routes.family.request("00000000-0000-0000-0000-000000000001");

  test.beforeEach(async ({ context }) => {
    await signInAs(context, "family");
  });

  test("1280px: sidebar with active section, no bottom tabs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(nested);
    const nav = page.getByRole("navigation", { name: "Family navigation" });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator('aside[aria-label="Workspace sidebar"]')).toBeVisible();
    expect((await page.locator('aside[aria-label="Workspace sidebar"]').boundingBox())?.width).toBeGreaterThan(200);
  });

  test("768px: icon rail with labels, no bottom tabs", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(nested);
    const nav = page.getByRole("navigation", { name: "Family navigation" });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Requests" })).toBeVisible();
    expect((await page.locator('aside[aria-label="Workspace sidebar"]').boundingBox())?.width).toBeLessThan(100);
  });

  test("375px: bottom tabs, no sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(nested);
    await expect(page.locator('aside[aria-label="Workspace sidebar"]')).toBeHidden();
    const tabs = page.getByRole("navigation", { name: "Family navigation" });
    await expect(tabs.getByRole("link")).toHaveCount(5);
    await expect(tabs.getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
  });

  test("375px: page content is not hidden behind the tab bar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 500 });
    await page.goto(routes.family.home);
    // The dashboard loads its data after first paint; measure the finished page.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastText = page.locator("main p").last();
    const textBox = await lastText.boundingBox();
    const tabsBox = await page.getByRole("navigation", { name: "Family navigation" }).boundingBox();
    expect(textBox!.y + textBox!.height).toBeLessThanOrEqual(tabsBox!.y);
  });

  test("375px: agency overflow lives in the More sheet", async ({ page, context }) => {
    await signInAs(context, "agency_admin");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(routes.agency.billing);
    const tabs = page.getByRole("navigation", { name: "Agency navigation" });
    await expect(tabs.getByRole("link")).toHaveCount(4);
    await tabs.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link", { name: "Billing" })).toHaveAttribute("aria-current", "page");
    await sheet.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(routes.agency.settings);
  });

  test("each role sees only its own navigation", async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const expected = {
      [routes.family.home]: ["Family navigation", ["Dashboard", "Requests", "Placements", "Payments", "Settings"]],
      [routes.agency.home]: [
        "Agency navigation",
        ["Dashboard", "Workers", "Requests", "Placements", "Billing", "Settings"],
      ],
      [routes.admin.home]: ["Admin navigation", ["Overview", "Agencies", "Workers", "Placements", "Audit log"]],
    } as const;
    for (const [path, [name, labels]] of Object.entries(expected)) {
      await signInAs(context, roleForPath(path)!);
      await page.goto(path);
      const links = page.getByRole("navigation", { name }).getByRole("link");
      await expect(links).toHaveText([...labels]);
    }
  });
});

test.describe("landmarks", () => {
  const cases: [string, string, { banner: number; contentinfo: number }][] = [
    ["marketing", routes.about, { banner: 1, contentinfo: 1 }],
    ["404", "/no-such-page", { banner: 1, contentinfo: 1 }],
    ["auth", routes.auth.login, { banner: 1, contentinfo: 1 }],
    ["app", routes.agency.workers, { banner: 1, contentinfo: 0 }],
  ];
  for (const [label, path, counts] of cases) {
    test(`${label} page has one main, one h1 and the right header/footer`, async ({ page, context }) => {
      const role = roleForPath(path);
      if (role) await signInAs(context, role);
      await page.goto(path);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(counts.banner);
      await expect(page.getByRole("contentinfo")).toHaveCount(counts.contentinfo);
    });
  }
});
