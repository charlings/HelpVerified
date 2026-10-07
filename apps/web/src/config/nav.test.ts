import { describe, expect, it } from "vitest";
import { appNav, footerNav, headerActions, isNavGroup, marketingNav } from "./nav";
import { publicRoutes, routes } from "./routes";

function allStaticPaths(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object" && typeof node !== "function")
    return Object.values(node).flatMap(allStaticPaths);
  return [];
}

const knownPaths = new Set([...allStaticPaths(routes), ...publicRoutes]);

describe("navigation config", () => {
  it("only links to paths defined in routes", () => {
    const hrefs = [
      ...marketingNav.flatMap((e) => (isNavGroup(e) ? e.items.map((i) => i.href) : [e.href])),
      ...footerNav.flatMap((g) => g.items.map((i) => i.href)),
      ...Object.values(headerActions).map((a) => a.href),
      ...Object.values(appNav).flatMap((n) => n.items.map((i) => i.href)),
    ];
    for (const href of hrefs) expect(knownPaths, href).toContain(href);
  });

  it.each(Object.entries(appNav))("%s fits the phone tab bar", (_role, nav) => {
    expect(nav.primaryCount).toBeLessThanOrEqual(5);
    const overflow = nav.items.length - nav.primaryCount;
    // Either everything fits, or one slot is used by "More" for at least one overflow item.
    expect(overflow === 0 || (overflow > 0 && nav.primaryCount <= 4)).toBe(true);
  });

  it.each(Object.entries(appNav))("%s has exactly one exact-match home item, first", (_role, nav) => {
    expect(nav.items.filter((i) => i.exact)).toHaveLength(1);
    expect(nav.items[0]?.exact).toBe(true);
  });
});
