import { describe, expect, it } from "vitest";
import { homeForRole, publicRoutes, routes, serviceSlugs } from "./routes";

function collectPaths(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "function") return [String((node as (arg: string) => string)("sample"))];
  if (node && typeof node === "object") return Object.values(node).flatMap(collectPaths);
  return [];
}

describe("routes", () => {
  const paths = collectPaths(routes);

  it("defines every path starting with a slash", () => {
    for (const path of paths) expect(path).toMatch(/^\//);
  });

  it("has no duplicate paths", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("builds service detail paths for each slug", () => {
    expect(serviceSlugs.map(routes.service)).toEqual(["/services/nanny", "/services/driver", "/services/cleaner"]);
  });

  it("maps every role to its workspace home", () => {
    expect(homeForRole).toEqual({ family: "/family", agency_admin: "/agency", super_admin: "/admin" });
  });

  it("keeps private workspaces out of the public route list", () => {
    for (const path of publicRoutes) expect(path).not.toMatch(/^\/(family|agency|admin)/);
  });
});
