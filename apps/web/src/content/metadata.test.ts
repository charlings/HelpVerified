import { describe, expect, it } from "vitest";
import { pageMeta } from "./metadata";
import { publicRoutes } from "@/config/routes";

describe("page metadata", () => {
  it("covers every public route exactly once", () => {
    expect(
      Object.values(pageMeta)
        .map((m) => m.path)
        .sort(),
    ).toEqual([...publicRoutes].sort());
  });

  it.each(Object.entries(pageMeta))("%s has a search-friendly description", (_key, meta) => {
    expect(meta.description.length).toBeGreaterThanOrEqual(50);
    expect(meta.description.length).toBeLessThanOrEqual(160);
  });

  it("has unique titles", () => {
    const titles = Object.values(pageMeta).map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
