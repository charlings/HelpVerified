import { describe, expect, it } from "vitest";
import { env, isMocking } from "./env";

describe("env", () => {
  it("falls back to local defaults and strips trailing slashes", () => {
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe("http://localhost:8000/api/v1");
    expect(env.NEXT_PUBLIC_SITE_URL).not.toMatch(/\/$/);
  });

  it("enables mocking by default in Phase 1", () => {
    expect(isMocking).toBe(true);
  });
});
