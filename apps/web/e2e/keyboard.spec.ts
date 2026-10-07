import { expect, test, type Locator, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs, signInWithToken } from "./helpers/session";
import { waitForPage } from "./helpers/page";

/*
 * M8 decision 6: each milestone's main flow by keyboard alone. Controls are reached with Tab (never
 * clicked or focused by script), operated with Enter/Space/arrows/typing, and every stop must show a
 * visible focus indicator.
 */

/** Presses Tab until `target` has focus (fails if it isn't reachable), checking the focus is visible. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) {
      const visible = await target.evaluate((el) => {
        const s = getComputedStyle(el);
        return (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none";
      });
      expect(visible, "focus indicator is visible").toBe(true);
      return;
    }
  }
  throw new Error(`Couldn't reach ${target} with Tab`);
}

async function expectFocused(locator: Locator) {
  await expect.poll(() => locator.evaluate((el) => el === document.activeElement)).toBe(true);
}

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  // Chromium date inputs take the digits month, day, year in en-US.
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${d.getFullYear()}`;
};

// Keyboard-only use is a desktop concern; the phone project (WebKit) doesn't Tab to links by default.
test.skip(({ browserName }) => browserName === "webkit", "keyboard flows run on desktop Chromium");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("M6: a family posts a request by keyboard", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInAs(context, "family");
  await page.goto(`${routes.family.newRequest}?role=nanny`);
  await waitForPage(page);

  // A radio group is one Tab stop; arrow keys move between its options (and select them).
  await tabTo(page, page.getByRole("radio", { name: /^Nanny/ }));
  // Tab stops on the group's checked option, or its first option if none is checked.
  await tabTo(page, page.locator('input[name="schedule"]:checked, input[name="schedule"]').first());
  const partTime = page.getByRole("radio", { name: "Part-time", exact: true });
  for (let i = 0; i < 3 && !(await partTime.isChecked()); i++) await page.keyboard.press("ArrowDown");
  await expect(partTime).toBeChecked();
  await tabTo(page, page.getByRole("button", { name: "Continue" }));
  await page.keyboard.press("Enter");

  await tabTo(page, page.getByLabel("Local government area"));
  await page.keyboard.type("Ikeja");
  await tabTo(page, page.getByLabel("Start date"));
  await page.keyboard.type(inDays(10));
  await tabTo(page, page.getByRole("button", { name: "Continue" }));
  await page.keyboard.press("Enter");

  await tabTo(page, page.getByLabel("Title"));
  await page.keyboard.type("Nanny for afternoons");
  await tabTo(page, page.getByLabel("What the role involves"));
  await page.keyboard.type("School pick-up and homework help, 2pm to 6pm on weekdays.");
  await tabTo(page, page.getByRole("button", { name: "Continue" }));
  await page.keyboard.press("Enter");

  await tabTo(page, page.getByRole("button", { name: "Post request" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Nanny for afternoons" })).toBeVisible();
});

test("M5: an agency proposes a worker by keyboard; Escape and success return focus", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInAs(context, "agency_admin");
  await page.goto(routes.agency.request("r-bola-driver"));
  await waitForPage(page);
  const open = page.getByRole("button", { name: "Propose a worker" });

  // Escape closes the dialog and focus goes back to the button that opened it.
  await tabTo(page, open);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expectFocused(open);

  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Propose a driver" });
  await tabTo(page, dialog.getByRole("radio", { name: /Musa Ibrahim/ }));
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("radio", { name: /Musa Ibrahim/ })).toBeChecked();
  await tabTo(page, dialog.getByRole("button", { name: "Propose worker" }));
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Your proposals" }).getByText("Musa Ibrahim")).toBeVisible();
  await expectFocused(open);
});

test("M6: a family accepts and pays by keyboard", async ({ page, context }) => {
  test.setTimeout(150_000);
  await signInAs(context, "family");
  await page.goto(routes.family.request("r-ada-nanny"));
  await waitForPage(page);

  await tabTo(page, page.getByRole("button", { name: "Accept Amaka" }));
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Accept Amaka?" });
  await tabTo(page, dialog.getByRole("button", { name: "Accept and pay" }));
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/demo\/checkout/);
  await tabTo(page, page.getByRole("button", { name: /Pay .* \(demo\)/ }));
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await tabTo(page, page.getByRole("link", { name: "Go to your placement" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Trial in progress")).toBeVisible();
});

test("M7: an admin approves an agency by keyboard; focus lands on the new status", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInWithToken(context, "super_admin", "demo-refresh-super_admin");
  await page.goto(routes.admin.agency("a-brighthands"));
  await waitForPage(page);

  await tabTo(page, page.getByRole("button", { name: "Approve" }));
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Approve Bright Hands Agency?" });
  await tabTo(page, dialog.getByRole("button", { name: "Approve" }));
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  // The Approve button no longer exists, so focus goes to the page title, not the body.
  await expectFocused(page.getByRole("heading", { level: 1, name: "Bright Hands Agency" }));
});

test("M4: sign in by keyboard (Enter submits)", async ({ page }) => {
  await page.goto(routes.auth.login);
  await tabTo(page, page.getByLabel("Email"));
  await page.keyboard.type("family@demo.hv");
  await tabTo(page, page.getByLabel("Password", { exact: true }));
  await page.keyboard.type("demo1234");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(routes.family.home);
});
