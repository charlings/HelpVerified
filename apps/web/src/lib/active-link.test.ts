import { describe, expect, it } from "vitest";
import { isActive } from "./active-link";

describe("isActive", () => {
  it("matches workspace homes exactly", () => {
    expect(isActive("/family", "/family", { exact: true })).toBe(true);
    expect(isActive("/family/requests", "/family", { exact: true })).toBe(false);
  });

  it("matches nested pages by prefix", () => {
    expect(isActive("/family/requests/new", "/family/requests")).toBe(true);
    expect(isActive("/agency/workers/123", "/agency/workers")).toBe(true);
  });

  it("respects segment boundaries", () => {
    expect(isActive("/agency-x", "/agency")).toBe(false);
    expect(isActive("/services-old", "/services")).toBe(false);
  });

  it("treats the home page as exact", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/about", "/")).toBe(false);
  });

  it("ignores trailing slashes, query strings and hashes", () => {
    expect(isActive("/pricing/", "/pricing")).toBe(true);
    expect(isActive("/pricing?plan=a#faq", "/pricing")).toBe(true);
  });
});
