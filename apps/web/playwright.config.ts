import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Each worker runs a Chromium with axe; more than 3 at once exhausts memory on the dev laptop and tests time out.
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  // Workspace pages make several mock calls with 300–800 ms simulated latency each; 5 s is too tight under load.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // A separate build folder, so a developer's `pnpm dev` (.next) isn't overwritten while tests run.
    env: { ENABLE_STYLEGUIDE: "true", NEXT_PUBLIC_SITE_URL: baseURL, NEXT_DIST_DIR: ".next-e2e" },
  },
});
