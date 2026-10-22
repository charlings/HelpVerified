import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs } from "./helpers/session";
import { waitForPage } from "./helpers/page";

/*
 * The mock database lives in the tab's sessionStorage, so cross-role checks stay in one tab and sign
 * in and out, as in journey.spec.ts.
 */

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function signIn(page: Page, email: string) {
  await page.goto(routes.auth.login);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(routes.auth.login);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("approve a pending agency; the agency sees it", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "pending@demo.hv");
  await expect(page.getByText("Your agency is waiting for approval")).toBeVisible();
  await signOut(page);

  await signIn(page, "admin@demo.hv");
  await page.getByRole("link", { name: /Agencies awaiting approval/ }).click();
  await expect(page).toHaveURL(/status=pending/);
  await page.getByRole("link", { name: "Bright Hands Agency" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve Bright Hands Agency?" });
  await expectNoAxeViolations(page);
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "History" }).getByText(/Approved agency/)).toBeVisible();
  await signOut(page);

  await signIn(page, "pending@demo.hv");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Your agency is waiting for approval")).toHaveCount(0);
  // Approved, but listing still needs an active subscription.
  await expect(page.getByText("Your subscription isn't active")).toBeVisible();
});

test("suspend an agency: its proposal disappears for the family, their trial continues", async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, "admin@demo.hv");
  await page.goto(routes.admin.agency("a-sunrise"));
  await page.getByRole("button", { name: "Suspend" }).click();
  const dialog = page.getByRole("dialog", { name: "Suspend Sunrise Domestic Staffing?" });
  await dialog.getByLabel("Reason").fill("Complaints under investigation.");
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Reinstate" })).toBeVisible();
  await signOut(page);

  await signIn(page, "family@demo.hv");
  await page.goto(routes.family.request("r-ada-nanny"));
  await expect(page.getByRole("heading", { name: "No proposals yet" })).toBeVisible();
  await page.goto(routes.family.placement("p-blessing"));
  await expect(page.getByText("Trial in progress")).toBeVisible();
  await signOut(page);

  await signIn(page, "agency@demo.hv");
  await expect(page.getByText("Complaints under investigation.")).toBeVisible();
});

test("flag a verified check: the worker is delisted and the agency sees why", async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page, "admin@demo.hv");
  await page.goto(routes.admin.workers);
  await page.getByRole("link", { name: "Amaka Obi" }).click();
  await page
    .getByRole("button", { name: /^View / })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Flag address" }).click();
  const dialog = page.getByRole("dialog", { name: "Flag Amaka Obi's address check?" });
  await expectNoAxeViolations(page);
  await dialog.getByLabel("Reason").fill("Utility bill is for a different street.");
  await dialog.getByRole("button", { name: "Flag check" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("3 of 4 verified")).toBeVisible();

  // Both the document view and the flag are in the audit log.
  await page.goto(routes.admin.audit);
  const log = page.getByRole("table", { name: "Audit log" });
  await expect(log.getByText("Flagged a check")).toBeVisible();
  await expect(log.getByText("Viewed a document")).toBeVisible();
  await signOut(page);

  await signIn(page, "agency@demo.hv");
  await page.goto(routes.agency.worker("w-amaka"));
  await expect(page.getByText("Flagged by HelpVerified")).toBeVisible();
  await expect(page.getByText("Utility bill is for a different street.", { exact: false })).toBeVisible();
});

test("an admin ends a placement with a reason", async ({ page, context }) => {
  await signInAs(context, "super_admin");
  await page.goto(routes.admin.placements);
  await page.getByRole("link", { name: "Blessing Eze" }).click();
  await page.getByRole("button", { name: "End placement" }).click();
  const dialog = page.getByRole("dialog", { name: "End this placement?" });
  await dialog.getByLabel("Reason").fill("Safeguarding concern reported to us.");
  await dialog.getByRole("button", { name: "End placement" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Ended by HelpVerified")).toBeVisible();
});

test.describe("only super admins", () => {
  for (const role of ["family", "agency_admin"] as const) {
    test(`${role} gets the 403 page on every admin route`, async ({ page, context }) => {
      await signInAs(context, role);
      for (const path of [
        routes.admin.home,
        routes.admin.agencies,
        routes.admin.agency("a-sunrise"),
        routes.admin.workers,
        routes.admin.placements,
        routes.admin.audit,
        routes.admin.alerts,
      ]) {
        await page.goto(path);
        await expect(page).toHaveURL(routes.forbidden);
      }
    });
  }
});

test.describe("accessibility", () => {
  for (const [name, path] of [
    ["overview", routes.admin.home],
    ["agencies", routes.admin.agencies],
    ["pending agency", routes.admin.agency("a-brighthands")],
    ["suspended agency", routes.admin.agency("a-harbour")],
    ["workers", routes.admin.workers],
    ["worker review", routes.admin.worker("w-amaka")],
    ["placements", routes.admin.placements],
    ["placement", routes.admin.placement("p-blessing")],
    ["audit log", routes.admin.audit],
    ["alerts", routes.admin.alerts],
  ] as const) {
    test(`${name} has no axe violations at 375px and 1280px`, async ({ page, context }) => {
      await signInAs(context, "super_admin");
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await waitForPage(page);
        await expectNoAxeViolations(page);
      }
    });
  }
});
