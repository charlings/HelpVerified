import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs } from "./helpers/session";
import { waitForPage } from "./helpers/page";

/*
 * Cross-role journeys. The mock database lives in the tab's sessionStorage, so each journey stays in
 * one tab and signs in and out between the family and the agency, as two real people would.
 */

const PASSWORD = "demo1234";
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto(routes.auth.login);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the session (and role cookie) before navigating, or middleware sends us back here.
  await expect(page).not.toHaveURL(/\/login/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(routes.auth.login);
}

async function agencyProposesAmaka(page: Page, requestId: string) {
  await signIn(page, "agency@demo.hv");
  await expect(page).toHaveURL(routes.agency.home);
  await page.goto(routes.agency.request(requestId));
  await page.getByRole("button", { name: "Propose a worker" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose a nanny" });
  await dialog.getByRole("radio", { name: /Amaka Obi/ }).check();
  await dialog.getByRole("button", { name: "Propose worker" }).click();
  await expect(dialog).toBeHidden();
  await signOut(page);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("sign up → verify → request → agency proposes → accept → pay → trial → confirm", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `journey-${Date.now()}@example.com`;

  // A new family signs up and verifies their email.
  await page.goto(`${routes.auth.signup}?role=nanny`);
  await page.getByLabel("Full name").fill("Tolu Bakare");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: /Demo: open the link/ }).click();
  await page.getByRole("link", { name: /Demo: open the link/ }).click();
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await signIn(page, email, "password123");
  await expect(page).toHaveURL(routes.family.home);
  await expect(page.getByRole("heading", { name: "Find help you can trust" })).toBeVisible();

  // They post a request.
  await page.goto(`${routes.family.newRequest}?role=nanny`);
  await page.getByRole("radio", { name: "Full-time", exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Local government area").fill("Ikeja");
  await page.getByLabel("Start date").fill(inDays(7));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Title").fill("Nanny for twins");
  await page.getByLabel("What the role involves").fill("Weekday care for our two-year-old twins, 8am to 5pm.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Post request" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nanny for twins" })).toBeVisible();
  const requestId = page.url().split("/").pop()!;
  await signOut(page);

  // The agency sees it and proposes a verified nanny.
  await agencyProposesAmaka(page, requestId);

  // The family accepts, pays at the demo checkout, and the trial starts.
  await signIn(page, email, "password123");
  await expect(page.getByRole("region", { name: "Open requests" }).getByText("1 proposal to review")).toBeVisible();
  await page.goto(routes.family.request(requestId));
  await page.getByRole("button", { name: "Accept Amaka" }).click();
  await page.getByRole("dialog", { name: "Accept Amaka?" }).getByRole("button", { name: "Accept and pay" }).click();
  await page.getByRole("button", { name: /Pay .* \(demo\)/ }).click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await page.getByRole("link", { name: "Go to your placement" }).click();
  await expect(page.getByText("Trial in progress")).toBeVisible();
  await expectNoAxeViolations(page);

  // The trial goes well and the family confirms.
  await page.getByRole("button", { name: "Confirm placement" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm this placement?" });
  await confirm.getByRole("button", { name: "Confirm placement" }).click();
  await expect(confirm).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: "Timeline" })
      .getByText(/confirmed/i)
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Request a replacement" })).toBeVisible();

  // The payment is on record, and the dashboard shows the placement.
  await page.goto(routes.family.payments);
  await expect(page.getByRole("table", { name: "Payment history" }).getByText("Paid")).toBeVisible();
  await page.goto(routes.family.home);
  await expect(page.getByRole("region", { name: "Your placements" }).getByText("Amaka Obi")).toBeVisible();
});

test("replacement: end a trial, agency proposes again, accept without paying twice", async ({ page, context }) => {
  test.setTimeout(180_000);
  await signInAs(context, "family");
  await page.goto(routes.family.placement("p-blessing"));
  await page.getByRole("button", { name: "Request a replacement" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a replacement?" });
  await expectNoAxeViolations(page);
  await dialog.getByLabel("Reason").fill("Our baby needs someone experienced with newborns.");
  await dialog.getByRole("button", { name: "Request replacement" }).click();
  await expect(page).toHaveURL(/\/family\/requests\/r-/);
  const requestId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "No proposals yet" })).toBeVisible();
  await signOut(page);

  await agencyProposesAmaka(page, requestId);

  await signIn(page, "family@demo.hv");
  await page.goto(routes.family.request(requestId));
  await page.getByRole("button", { name: "Accept Amaka" }).click();
  const accept = page.getByRole("dialog", { name: "Accept Amaka?" });
  await accept.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page).toHaveURL(/\/family\/placements\/p-/);
  await expect(page.getByText("Trial in progress")).toBeVisible();
  // The fee covered one replacement, and it has now been used.
  await expect(page.getByText("1 of 1 free")).toBeVisible();
});

test.describe("accessibility", () => {
  for (const [name, path, role] of [
    ["dashboard", routes.family.home, "family"],
    ["payments", routes.family.payments, "family"],
    ["settings", routes.family.settings, "family"],
    ["placement on trial", routes.family.placement("p-blessing"), "family"],
  ] as const) {
    test(`${name} has no axe violations at 375px and 1280px`, async ({ page, context }) => {
      await signInAs(context, role);
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await waitForPage(page);
        await expectNoAxeViolations(page);
      }
    });
  }
});
