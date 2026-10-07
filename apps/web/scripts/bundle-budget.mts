/**
 * Bundle budgets (M9). Reads the route table printed by `next build` and fails if a route's
 * "First Load JS" is over its budget. Usage: `pnpm build > build.log; pnpm bundle:check build.log`.
 *
 * Budgets are by what the page does, not where it sits: content pages carry no form libraries;
 * pages with forms and the signed-in workspaces carry React Hook Form, zod and TanStack Query.
 * See docs/bundles.md before raising a number.
 */
import { readFileSync } from "node:fs";

const CONTENT_KB = 130;
const APP_KB = 185;

// Pages with forms outside the workspaces.
const formPages = new Set([
  "/contact",
  "/login",
  "/signup",
  "/signup/agency",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);
const isApp = (route: string) => formPages.has(route) || /^\/(family|agency|admin|demo)(\/|$)/.test(route);

const file = process.argv[2];
if (!file) {
  console.error("Usage: bundle-budget <next build log>");
  process.exit(2);
}

const rows = [...readFileSync(file, "utf8").matchAll(/^\S\s+[○ƒ●]\s+(\/\S*)\s+[\d.]+ k?B\s+([\d.]+) (kB|MB)/gm)].map(
  (m) => ({
    route: m[1]!,
    kb: Number(m[2]) * (m[3] === "MB" ? 1024 : 1),
  }),
);
if (rows.length === 0) {
  console.error("No route table found in the build log.");
  process.exit(2);
}

const over = rows.map((r) => ({ ...r, budget: isApp(r.route) ? APP_KB : CONTENT_KB })).filter((r) => r.kb > r.budget);

const widest = [...rows].sort((a, b) => b.kb - a.kb).slice(0, 5);
console.log(`Checked ${rows.length} routes. Heaviest: ${widest.map((r) => `${r.route} ${r.kb} kB`).join(", ")}`);
if (over.length > 0) {
  for (const r of over) console.error(`Over budget: ${r.route} ${r.kb} kB (budget ${r.budget} kB)`);
  process.exit(1);
}
console.log(`All within budget (content ≤ ${CONTENT_KB} kB, forms and workspaces ≤ ${APP_KB} kB).`);
