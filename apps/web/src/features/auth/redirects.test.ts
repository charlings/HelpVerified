import { describe, expect, it } from "vitest";
import { destinationAfterLogin, loginUrl, safeNext } from "./redirects";

describe("safeNext", () => {
  it.each([
    ["/family/requests", "/family/requests"],
    ["/agency/workers?listing_status=draft", "/agency/workers?listing_status=draft"],
    ["/signup/agency", "/signup/agency"],
  ])("accepts in-app path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    "https://evil.com/family",
    "//evil.com/family",
    "/\\evil.com",
    "javascript:alert(1)",
    "/about",
    "/familyx",
    "",
    null,
  ])("rejects %s", (input) => {
    expect(safeNext(input)).toBeNull();
  });
});

describe("destinationAfterLogin", () => {
  it("returns a safe next path the role can open", () => {
    expect(destinationAfterLogin("family", "/family/placements")).toBe("/family/placements");
  });

  it("falls back to the role home when next belongs to another role or is unsafe", () => {
    expect(destinationAfterLogin("family", "/agency/workers")).toBe("/family");
    expect(destinationAfterLogin("super_admin", "//evil.com")).toBe("/admin");
  });

  it("lets agency admins continue to onboarding", () => {
    expect(destinationAfterLogin("agency_admin", "/signup/agency")).toBe("/signup/agency");
  });
});

describe("loginUrl", () => {
  it("encodes expired and next", () => {
    expect(loginUrl("/family/requests", true)).toBe("/login?expired=1&next=%2Ffamily%2Frequests");
    expect(loginUrl()).toBe("/login");
  });
});
