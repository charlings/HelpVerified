import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs } from "./helpers/session";
import { waitForPage } from "./helpers/page";

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.beforeEach(async ({ context, page }) => {
  await signInAs(context, "agency_admin");
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("propose an available worker; a placed worker can't be chosen", async ({ page }) => {
  await page.goto(routes.agency.requests);
  await page.getByRole("link", { name: "Part-time family driver" }).click();
  await page.getByRole("button", { name: "Propose a worker" }).click();

  const dialog = page.getByRole("dialog", { name: "Propose a driver" });
  await expect(dialog.getByRole("radio", { name: /Chinedu Okeke/ })).toBeDisabled();
  await expect(dialog.getByText(/In a placement/)).toBeVisible();
  await expectNoAxeViolations(page);

  await dialog.getByRole("radio", { name: /Musa Ibrahim/ }).check();
  await dialog.getByLabel(/Note for the family/).fill("Nine years driving families.");
  await dialog.getByRole("button", { name: "Propose worker" }).click();
  await expect(dialog).toBeHidden();

  const proposals = page.getByRole("region", { name: "Your proposals" });
  await expect(proposals.getByText("Musa Ibrahim")).toBeVisible();
  await proposals.getByRole("button", { name: "Withdraw proposal for Musa Ibrahim" }).click();
  await expect(proposals.getByText("Withdrawn")).toBeVisible();
});

test("proposing a worker who was just placed elsewhere shows the conflict", async ({ page }) => {
  // Only the proposal POST fails, as if another family's accept landed first.
  await page.goto(
    `${routes.agency.request("r-bola-driver")}?mock_error=WORKER_UNAVAILABLE&mock_error_method=POST&mock_error_path=/proposals`,
  );
  await page.getByRole("button", { name: "Propose a worker" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose a driver" });
  await dialog.getByRole("radio", { name: /Musa Ibrahim/ }).check();
  await dialog.getByRole("button", { name: "Propose worker" }).click();
  await expect(dialog.getByRole("alert")).toContainText("This worker has just been placed with another family");
  await expect(dialog).toBeVisible();
});

test("end a placement with a reason; the timeline records it", async ({ page }) => {
  await page.goto(routes.agency.placements);
  await page.getByRole("link", { name: "Blessing Eze" }).click();
  await expect(page.getByText(/Trial ends in/)).toBeVisible();
  await page.getByRole("button", { name: "End placement" }).click();
  const dialog = page.getByRole("dialog", { name: "End this placement?" });
  await expectNoAxeViolations(page);
  await dialog.getByLabel("Reason").fill("The family is relocating abroad.");
  await dialog.getByRole("button", { name: "End placement" }).click();
  await expect(dialog).toBeHidden();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Placement ended")).toBeVisible();
  await expect(timeline.getByText(/relocating abroad/)).toBeVisible();
  await expect(page.getByRole("button", { name: "End placement" })).toHaveCount(0);
});

test("requests and placements become cards on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(routes.agency.requests);
  await expect(page.getByRole("list", { name: "Open requests" }).getByRole("listitem")).toHaveCount(3);
  await page.goto(routes.agency.placements);
  await expect(page.getByRole("list", { name: "Placements" }).getByRole("listitem")).toHaveCount(4);
});

test("an unknown request or placement is not found", async ({ page }) => {
  await page.goto(routes.agency.request("r-ifeoma-cleaner")); // another state
  await expect(page.getByRole("heading", { level: 1, name: "Request not found" })).toBeVisible();
  await page.goto(routes.agency.placement("p-nope"));
  await expect(page.getByRole("heading", { level: 1, name: "Placement not found" })).toBeVisible();
});

test.describe("accessibility", () => {
  for (const [name, path] of [
    ["requests", routes.agency.requests],
    ["request detail", routes.agency.request("r-ada-nanny")],
    ["placements", routes.agency.placements],
    ["placement on trial", routes.agency.placement("p-blessing")],
    ["placement awaiting payment", routes.agency.placement("p-grace")],
    ["ended placement", routes.agency.placement("p-musa")],
    ["billing", routes.agency.billing],
    ["settings", routes.agency.settings],
  ] as const) {
    test(`${name} has no axe violations at 375px and 1280px`, async ({ page }) => {
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await waitForPage(page);
        await expectNoAxeViolations(page);
      }
    });
  }
});
