import { expect, test } from "@playwright/test";
import { routes } from "../src/config/routes";
import { roleForPath, signInAs } from "./helpers/session";

const SAMPLE_ID = "00000000-0000-0000-0000-000000000001";

const pages: [path: string, title: string][] = [
  [routes.home, "HelpVerified · Verified nannies, drivers and cleaners"],
  [routes.services, "Services · HelpVerified"],
  [routes.service("nanny"), "Verified nannies · HelpVerified"],
  [routes.service("driver"), "Verified drivers · HelpVerified"],
  [routes.service("cleaner"), "Verified cleaners · HelpVerified"],
  [routes.howItWorks, "How it works · HelpVerified"],
  [routes.forAgencies, "For agencies · HelpVerified"],
  [routes.pricing, "Pricing · HelpVerified"],
  [routes.about, "About · HelpVerified"],
  [routes.contact, "Contact · HelpVerified"],
  [routes.privacy, "Privacy policy · HelpVerified"],
  [routes.terms, "Terms of use · HelpVerified"],
  [routes.forbidden, "Access denied · HelpVerified"],
  [routes.auth.login, "Sign in · HelpVerified"],
  [routes.auth.signup, "Create an account · HelpVerified"],
  [routes.auth.agencySignup, "Register your agency · HelpVerified"],
  [routes.auth.googleSignup, "Finish signing up · HelpVerified"],
  [routes.auth.forgot, "Forgot password · HelpVerified"],
  [routes.auth.reset, "Reset password · HelpVerified"],
  [routes.auth.verifyEmail, "Verify your email · HelpVerified"],
  [routes.family.home, "Family dashboard · HelpVerified"],
  [routes.family.requests, "Requests · HelpVerified"],
  [routes.family.newRequest, "New request · HelpVerified"],
  [routes.family.request(SAMPLE_ID), "Request · HelpVerified"],
  [routes.family.worker(SAMPLE_ID), "Worker · HelpVerified"],
  [routes.family.placements, "Placements · HelpVerified"],
  [routes.family.placement(SAMPLE_ID), "Placement · HelpVerified"],
  [routes.family.payments, "Payments · HelpVerified"],
  [routes.family.paymentCallback, "Payment · HelpVerified"],
  [routes.demoCheckout, "Demo checkout · HelpVerified"],
  [routes.family.settings, "Settings · HelpVerified"],
  [routes.agency.home, "Agency dashboard · HelpVerified"],
  [routes.agency.workers, "Workers · HelpVerified"],
  [routes.agency.newWorker, "Add worker · HelpVerified"],
  [routes.agency.worker(SAMPLE_ID), "Worker · HelpVerified"],
  [routes.agency.requests, "Requests · HelpVerified"],
  [routes.agency.request(SAMPLE_ID), "Request · HelpVerified"],
  [routes.agency.placements, "Placements · HelpVerified"],
  [routes.agency.placement(SAMPLE_ID), "Placement · HelpVerified"],
  [routes.agency.billing, "Billing · HelpVerified"],
  [routes.agency.settings, "Settings · HelpVerified"],
  [routes.admin.home, "Admin overview · HelpVerified"],
  [routes.admin.agencies, "Agencies · HelpVerified"],
  [routes.admin.agency(SAMPLE_ID), "Agency · HelpVerified"],
  [routes.admin.workers, "Workers · HelpVerified"],
  [routes.admin.worker(SAMPLE_ID), "Worker · HelpVerified"],
  [routes.admin.placements, "Placements · HelpVerified"],
  [routes.admin.placement(SAMPLE_ID), "Placement · HelpVerified"],
  [routes.admin.audit, "Audit log · HelpVerified"],
  [routes.admin.alerts, "Alerts · HelpVerified"],
];

for (const [path, title] of pages) {
  // Titles, status codes and a single h1. Accessibility, widths and targets: audit.spec.ts (seeded data).
  test(`${path} renders with its title`, async ({ page, context }) => {
    const role = roleForPath(path);
    if (role) await signInAs(context, role);
    const response = await page.goto(path);
    expect(response?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // Spec: the Demo pill is visible whenever mocking is on — on every route, not just marketing.
    await expect(page.getByText("Demo mode · data is not real")).toBeVisible();
  });
}

test("unknown routes and unknown service slugs return 404", async ({ page }) => {
  expect((await page.goto("/definitely-not-a-page"))?.status()).toBe(404);
  expect((await page.goto(`${routes.services}/plumber`))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
});

test("app workspaces are marked noindex; marketing pages are not", async ({ page, context }) => {
  await signInAs(context, "family");
  await page.goto(routes.family.home);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // Let the session restore finish, or leaving mid-redirect interrupts the next navigation (WebKit).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.goto(routes.home);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("skip link moves focus target to main content", async ({ page, browserName }) => {
  // WebKit (Safari) doesn't Tab to links unless the user turns that on; keyboard checks run on Chromium.
  test.skip(browserName === "webkit", "Safari Tabs to links only with Option+Tab");
  await page.goto(routes.home);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(page.locator("#main")).toHaveCount(1);
});
