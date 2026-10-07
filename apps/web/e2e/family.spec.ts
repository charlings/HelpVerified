import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs } from "./helpers/session";
import { waitForPage } from "./helpers/page";

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function signInAsNewFamily(context: BrowserContext) {
  await context.clearCookies();
  await context.addCookies([
    { name: "hv_role", value: "family", url: "http://localhost:3100" },
    { name: "hv_mock_refresh", value: "demo-refresh-newfamily", url: "http://localhost:3100" },
  ]);
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("post a request in four steps", async ({ page, context }) => {
  await signInAsNewFamily(context);
  await page.goto(routes.family.requests);
  await expect(page.getByRole("heading", { name: "No requests yet" })).toBeVisible();
  await page.getByRole("link", { name: "Post a request" }).first().click();

  await page.getByRole("radio", { name: /^Nanny/ }).check();
  await page.getByRole("radio", { name: "Full-time", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Local government area").fill("Ikeja");
  await page.getByLabel("Start date").fill(inDays(10));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Title").fill("Nanny for a newborn");
  await page.getByLabel("What the role involves").fill("Weekday care for our three-month-old, 8am to 6pm.");
  await page.getByLabel("Monthly budget from (₦)").fill("80,000");
  await page.getByLabel("Monthly budget to (₦)").fill("120,000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Review" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Post request" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Nanny for a newborn" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No proposals yet" })).toBeVisible();
});

test("accept a proposal, pay at the demo checkout, and the trial starts", async ({ page, context }) => {
  await signInAs(context, "family");
  await page.goto(routes.family.request("r-ada-nanny"));
  const card = page.getByRole("article", { name: "Amaka" });
  await expect(card.getByText(/^Identity/)).toBeVisible();
  await card.getByRole("button", { name: "Accept Amaka" }).click();
  const dialog = page.getByRole("dialog", { name: "Accept Amaka?" });
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Accept and pay" }).click();

  await expect(page).toHaveURL(/\/demo\/checkout\?reference=HV-PF-/);
  await expect(page.getByText("No money moves")).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: /Pay .* \(demo\)/ }).click();

  await expect(page).toHaveURL(/\/family\/payments\/callback\?reference=/);
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "Go to your placement" }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Amaka Obi with Sunrise Domestic Staffing/ })).toBeVisible();
  await expect(page.getByText("Trial in progress")).toBeVisible();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Placement fee paid. Trial started")).toBeVisible();
});

test("leaving the checkout keeps the hold and lets the family return", async ({ page, context }) => {
  await signInAs(context, "family");
  await page.goto(routes.family.request("r-ada-nanny"));
  await page.getByRole("button", { name: "Accept Amaka" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept and pay" }).click();
  await page.getByRole("button", { name: "Cancel and go back" }).click();
  await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
  await page.getByRole("link", { name: "Return to checkout" }).click();
  await page.getByRole("button", { name: /Pay .* \(demo\)/ }).click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
});

test("accepting a worker who was just placed elsewhere shows the conflict", async ({ page, context }) => {
  await signInAs(context, "family");
  // Only the accept POST fails, as if another family's accept landed first.
  await page.goto(
    `${routes.family.request("r-ada-nanny")}?mock_error=WORKER_UNAVAILABLE&mock_error_method=POST&mock_error_path=/accept`,
  );
  await page.getByRole("button", { name: "Accept Amaka" }).click();
  const dialog = page.getByRole("dialog", { name: "Accept Amaka?" });
  await dialog.getByRole("button", { name: "Accept and pay" }).click();
  await expect(dialog.getByRole("alert")).toContainText("This worker has just been placed with another family");
});

test("a worker's public profile shows check dates but nothing private", async ({ page, context }) => {
  await signInAs(context, "family");
  await page.goto(routes.family.worker("w-amaka"));
  await expect(page.getByRole("heading", { level: 1, name: "Amaka" })).toBeVisible();
  await expect(page.getByText(/^Verified /)).toHaveCount(4);
  await expect(page.getByText("Obi")).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test.describe("accessibility", () => {
  for (const [name, path] of [
    ["requests", routes.family.requests],
    ["new request", routes.family.newRequest],
    ["request with a proposal", routes.family.request("r-ada-nanny")],
    ["matched request", routes.family.request("r-ada-nanny-2")],
  ] as const) {
    test(`${name} has no axe violations at 375px and 1280px`, async ({ page, context }) => {
      await signInAs(context, "family");
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await waitForPage(page);
        await expectNoAxeViolations(page);
      }
    });
  }
});
