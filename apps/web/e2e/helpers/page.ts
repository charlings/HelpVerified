import { expect, type Page } from "@playwright/test";

/**
 * Waits for a workspace page to finish loading: one h1 and no loading regions. Detail pages show a
 * skeleton (no h1) until their data arrives, and with two workers on a busy laptop that has taken
 * longer than the 10 s assertion default, so this allows 30 s. A real hang still fails.
 */
export async function waitForPage(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
}
