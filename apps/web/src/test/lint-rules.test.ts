// @vitest-environment node
/**
 * M9: the spec says lint must fail on a path literal, a raw hex colour, an image path outside the asset
 * map and a cross-feature deep import (plus the route-file and layering rules). This runs the real
 * ESLint config over small fixtures at realistic paths and checks each rule fires — and that clean
 * code passes, so the rules aren't simply failing everything.
 */
import { join } from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const cwd = join(__dirname, "..", "..");
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd });
});

async function ruleIds(file: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: join(cwd, file) });
  return result!.messages.filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe("lint rules from the spec fail where they should", () => {
  it.each([
    ["a path literal in href", "src/features/demo/Bad.tsx", `export const A = () => <a href="/about">About</a>;`],
    [
      "a path literal in router.push",
      "src/features/demo/bad.ts",
      `export const go = (r: { push(p: string): void }) => r.push("/family");`,
    ],
    ["a raw hex colour", "src/features/demo/bad.ts", `export const colour = "#0158e1";`],
    ["a raw image path", "src/features/demo/Bad.tsx", `export const I = () => <img src="/images/photo.jpg" alt="" />;`],
  ])(
    "no-restricted-syntax: %s",
    async (_label, file, code) => {
      expect(await ruleIds(file, code)).toContain("no-restricted-syntax");
    },
    60_000,
  );

  it("a cross-feature deep import", async () => {
    const ids = await ruleIds("src/features/admin/bad.ts", `export { workersApi } from "@/features/workers/api";`);
    expect(ids).toContain("no-restricted-imports");
  }, 60_000);

  it("shared components importing a feature", async () => {
    const ids = await ruleIds("src/components/ui/Bad.tsx", `export { workersApi } from "@/features/workers";`);
    expect(ids).toContain("import/no-restricted-paths");
  }, 60_000);

  it.each([
    [
      "fetch in a route file",
      `export default async function Page() { await fetch("x"); return null; }`,
      "no-restricted-globals",
    ],
    [
      "react-query in a route file",
      `import { useQuery } from "@tanstack/react-query"; export const q = useQuery;`,
      "no-restricted-imports",
    ],
    [
      "a deep feature import in a route file",
      `export { workersApi } from "@/features/workers/api";`,
      "no-restricted-imports",
    ],
  ])(
    "route files stay thin: %s",
    async (_label, code, rule) => {
      expect(await ruleIds("src/app/(app)/demo/page.tsx", code)).toContain(rule);
    },
    60_000,
  );
});

describe("clean code passes", () => {
  it("routes, tokens and the asset map", async () => {
    const code = `import Link from "next/link";
import { routes } from "@/config/routes";
export const A = () => <Link href={routes.about} className="text-blue-600">About</Link>;`;
    expect(await ruleIds("src/features/demo/Good.tsx", code)).toEqual([]);
  }, 60_000);

  it("a route file that renders a screen", async () => {
    const code = `import { AdminOverviewScreen } from "@/features/admin/screens/AdminOverviewScreen";
export default function Page() { return <AdminOverviewScreen />; }`;
    expect(await ruleIds("src/app/(app)/demo/page.tsx", code)).toEqual([]);
  }, 60_000);
});
