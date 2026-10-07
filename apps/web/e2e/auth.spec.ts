import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs } from "./helpers/session";

const PASSWORD = "demo1234";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function openDemoInbox(page: Page) {
  await page.getByRole("button", { name: /Demo: open the link/ }).click();
  await page.getByRole("link", { name: /Demo: open the link/ }).click();
}

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe("sign in", () => {
  for (const [email, home, nav] of [
    ["family@demo.hv", routes.family.home, "Family navigation"],
    ["agency@demo.hv", routes.agency.home, "Agency navigation"],
    ["admin@demo.hv", routes.admin.home, "Admin navigation"],
  ] as const) {
    test(`${email} lands on their workspace`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(routes.auth.login);
      await signIn(page, email);
      await expect(page).toHaveURL(home);
      await expect(page.getByRole("navigation", { name: nav })).toBeVisible();
    });
  }

  test("wrong password shows an error; the sixth attempt is rate-limited", async ({ page }) => {
    await page.goto(routes.auth.login);
    await signIn(page, "family@demo.hv", "wrong-password");
    await expect(page.getByRole("alert").filter({ hasText: "don't match our records" })).toBeFocused();
    for (let i = 0; i < 4; i++) await signIn(page, "family@demo.hv", "wrong-password");
    await signIn(page, "family@demo.hv");
    await expect(page.getByRole("alert").filter({ hasText: "Too many attempts" })).toBeVisible();
  });

  test("keyboard-only sign-in", async ({ page }) => {
    await page.goto(routes.auth.login);
    await page.getByLabel("Email").focus();
    await page.keyboard.type("family@demo.hv");
    await page.keyboard.press("Tab");
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(routes.family.home);
  });

  test("Google button explains it isn't live in demo mode", async ({ page }) => {
    await page.goto(routes.auth.login);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.getByText(/Google sign-in becomes available/)).toBeVisible();
  });
});

test.describe("guards", () => {
  test("signed out → sign in → back to the page you asked for", async ({ page }) => {
    await page.goto(routes.family.requests);
    await expect(page).toHaveURL(/\/login\?next=%2Ffamily%2Frequests$/);
    await signIn(page, "family@demo.hv");
    await expect(page).toHaveURL(routes.family.requests);
  });

  test("the wrong role gets 403", async ({ page, context }) => {
    await signInAs(context, "family");
    await page.goto(routes.agency.home);
    await expect(page).toHaveURL(routes.forbidden);
  });

  test("a stale role cookie is corrected once the session restores", async ({ page, context }) => {
    await signInAs(context, "family");
    await context.addCookies([{ name: "hv_role", value: "agency_admin", url: "http://localhost:3100" }]);
    await page.goto(routes.agency.home);
    await expect(page).toHaveURL(routes.forbidden);
  });

  test("session-expired banner", async ({ page }) => {
    await page.goto(`${routes.auth.login}?expired=1`);
    await expect(page.getByText("Your session has expired")).toBeVisible();
  });

  test("sign out ends the session", async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInAs(context, "family");
    await page.goto(routes.family.home);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(routes.auth.login);
    await page.goto(routes.family.home);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("sign up and recovery", () => {
  test("family: sign up → verify by email → sign in", async ({ page }) => {
    const email = `family-${Date.now()}@example.com`;
    await page.goto(`${routes.auth.signup}?role=nanny`);
    await expect(page.getByRole("radio", { name: /Hire help/ })).toBeChecked();
    await page.getByLabel("Full name").fill("Ngozi Ade");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expectNoAxeViolations(page);

    await openDemoInbox(page);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.getByRole("link", { name: "Continue" }).click();
    await signIn(page, email, "password123");
    await expect(page).toHaveURL(routes.family.home);
  });

  test("forgot → reset → sign in with the new password; the link can't be reused", async ({ page }) => {
    await page.goto(routes.auth.forgot);
    await page.getByLabel("Email").fill("family@demo.hv");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await openDemoInbox(page);
    await page.waitForURL(/\/reset-password\?token=/);
    const resetUrl = page.url();

    await page.getByLabel("New password", { exact: true }).fill("brand-new-pass");
    await page.getByLabel("Confirm new password").fill("brand-new-pass");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    await page.goto(resetUrl);
    await page.getByLabel("New password", { exact: true }).fill("another-pass1");
    await page.getByLabel("Confirm new password").fill("another-pass1");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: /expired or has already been used/ })).toBeVisible();

    await page.goto(routes.auth.login);
    await signIn(page, "family@demo.hv", "brand-new-pass");
    await expect(page).toHaveURL(routes.family.home);
  });

  test("agency: sign up → verify → sign in → onboarding → pending review", async ({ page }) => {
    const email = `agency-${Date.now()}@example.com`;
    await page.goto(`${routes.auth.signup}?role=agency`);
    await page.getByLabel("Full name").fill("Kemi Adeyemi");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await openDemoInbox(page);
    await page.getByRole("link", { name: "Continue" }).click();
    await signIn(page, email, "password123");
    await expect(page).toHaveURL(routes.auth.agencySignup);

    await page.getByLabel("Registered business name").fill("Bright Hands Agency");
    await page.getByLabel("CAC registration number").fill("RC 7654321");
    await page.getByLabel("Business email").fill("office@brighthands.demo");
    await page.getByLabel("Business phone").fill("0805 123 4567");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Office address").fill("4 Admiralty Way");
    await page.getByLabel("State").selectOption("Lagos");
    await page.getByLabel("Local government area").fill("Eti-Osa");
    await page.getByRole("checkbox", { name: "Nannies" }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Review" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  });
});

test.describe("auth screens are accessible", () => {
  for (const path of [
    routes.auth.login,
    `${routes.auth.login}?expired=1`,
    routes.auth.signup,
    routes.auth.forgot,
    routes.auth.reset,
    `${routes.auth.reset}?token=abc`,
    routes.auth.verifyEmail,
  ]) {
    test(`${path} has no axe violations at 375px and 1280px`, async ({ page }) => {
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expectNoAxeViolations(page);
      }
    });
  }
});
