import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * M9 decision 1: a Firefox smoke run, recorded in the report but not part of CI.
 * `pnpm exec playwright test -c playwright.firefox.config.ts` (after `playwright install firefox`).
 */
export default defineConfig({
  ...base,
  workers: 1,
  testMatch: ["auth.spec.ts", "journey.spec.ts"],
  grep: /lands on their workspace|sign up → verify|replacement:/,
  projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }],
});
