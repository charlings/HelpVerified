import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { routes } from "../src/config/routes";
import { signInAs } from "./helpers/session";
import { waitForPage } from "./helpers/page";

const pdf = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% demo evidence\n"),
});

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.beforeEach(async ({ context, page }) => {
  await signInAs(context, "agency_admin");
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("add a worker, complete all four checks with uploads, then list them", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(routes.agency.newWorker);

  await page.getByLabel("Full name").fill("Kola Adeyemi");
  await page.getByLabel("Role", { exact: true }).selectOption("driver");
  await page.getByLabel("Years of experience").fill("4");
  await page.getByLabel("Local government area").fill("Yaba");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/National Identification Number/).fill("22233344455");
  await page.getByRole("checkbox", { name: /has agreed/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Review" })).toBeVisible();
  await page.getByRole("button", { name: "Add worker" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Kola Adeyemi" })).toBeVisible();
  await expect(page.getByText("0 of 4 checks verified")).toBeVisible();
  await expect(page.getByRole("button", { name: "List worker" })).toBeDisabled();

  for (const label of ["Identity", "Guarantor", "References", "Address"]) {
    const card = page.getByRole("region", { name: label });
    await card.getByLabel(new RegExp(`Upload ${label.toLowerCase()} evidence`)).setInputFiles(pdf(`${label}.pdf`));
    await expect(card.getByText("In review")).toBeVisible();
    await expect(card.getByRole("button", { name: `View ${label} document 1` })).toBeVisible();
    await card.getByRole("button", { name: `Verify ${label.toLowerCase()}` }).click();
    await expect(card.getByText("Verified", { exact: true })).toBeVisible();
  }

  await expect(page.getByText("4 of 4 checks verified")).toBeVisible();
  await page.getByRole("button", { name: "List worker" }).click();
  await expect(page.getByRole("button", { name: "Delist worker" })).toBeVisible();
  await expect(page.getByText("Listed", { exact: true }).first()).toBeVisible();
});

test("cannot list at 3 of 4: the button is disabled and says why", async ({ page }) => {
  await page.goto(routes.agency.worker("w-joy"));
  const list = page.getByRole("button", { name: "List worker" });
  await expect(list).toBeDisabled();
  await expect(page.getByText("Can't list yet: 1 check still to verify: Address.")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("uploaded evidence opens in the in-app viewer", async ({ page }) => {
  await page.goto(routes.agency.worker("w-tobi"));
  const card = page.getByRole("region", { name: "Identity" });
  await card.getByLabel(/Upload identity evidence/).setInputFiles({
    name: "id.png",
    mimeType: "image/png",
    // 1×1 transparent PNG
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await card.getByRole("button", { name: "View Identity document 1" }).click();
  const viewer = page.getByRole("dialog", { name: "Identity document 1" });
  await expect(viewer.getByRole("img", { name: "Identity document 1" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("rejecting a check asks for a reason and shows it", async ({ page }) => {
  await page.goto(routes.agency.worker("w-joy"));
  const card = page.getByRole("region", { name: "Address" });
  await card.getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog", { name: "Reject the address check" });
  await dialog.getByRole("button", { name: "Reject check" }).click();
  await expect(dialog.getByText(/Explain why/)).toBeVisible();
  await dialog.getByLabel("Reason").fill("The utility bill is older than three months.");
  await dialog.getByRole("button", { name: "Reject check" }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByText("The utility bill is older than three months.")).toBeVisible();
});

test("another agency's worker is not found", async ({ page }) => {
  await page.goto(routes.agency.worker("w-zainab"));
  await expect(page.getByRole("heading", { level: 1, name: "Worker not found" })).toBeVisible();
});

test("the workers table becomes cards on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(routes.agency.workers);
  await expect(page.getByRole("table")).toBeHidden();
  const cards = page.getByRole("list", { name: "Workers" });
  await expect(cards.getByRole("listitem")).toHaveCount(10);
  await expect(cards.getByRole("link", { name: "Joy Nwosu" })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("filters live in the URL", async ({ page }) => {
  await page.goto(routes.agency.workers);
  await page.getByLabel("Listing").selectOption("draft");
  await expect(page).toHaveURL(/listing_status=draft/);
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(4); // header + 3 drafts
});

test.describe("accessibility", () => {
  for (const [name, path] of [
    ["dashboard", routes.agency.home],
    ["workers", routes.agency.workers],
    ["add worker", routes.agency.newWorker],
    ["worker with a rejected check", routes.agency.worker("w-emeka")],
    ["listed worker", routes.agency.worker("w-amaka")],
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

test("an agency admin without a registered agency is sent to register", async ({ page, context }) => {
  await signInAs(context, "agency_admin");
  await context.clearCookies();
  await context.addCookies([
    { name: "hv_role", value: "agency_admin", url: "http://localhost:3100" },
    { name: "hv_mock_refresh", value: "demo-refresh-newagency", url: "http://localhost:3100" },
  ]);
  await page.goto(routes.agency.home);
  await expect(page.getByRole("heading", { name: "Register your agency to get started" })).toBeVisible();
});
