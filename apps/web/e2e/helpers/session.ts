import type { BrowserContext } from "@playwright/test";
import type { Role } from "../../src/config/routes";

const baseURL = "http://localhost:3100";

/**
 * Starts the browser signed in as a seeded demo user: the role hint for middleware plus the mock
 * refresh cookie the mock API exchanges for a session on first load (see src/mocks/db.ts).
 */
export async function signInAs(context: BrowserContext, role: Role) {
  await context.clearCookies();
  await context.addCookies([
    { name: "hv_role", value: role, url: baseURL },
    { name: "hv_mock_refresh", value: `demo-refresh-${role}`, url: baseURL },
  ]);
}

/** Signs in as a specific seeded user by their refresh token (see `refreshTokens` in src/mocks/db.ts). */
export async function signInWithToken(context: BrowserContext, role: Role, refreshToken: string) {
  await context.clearCookies();
  await context.addCookies([
    { name: "hv_role", value: role, url: baseURL },
    { name: "hv_mock_refresh", value: refreshToken, url: baseURL },
  ]);
}

export function roleForPath(path: string): Role | null {
  if (path.startsWith("/family")) return "family";
  if (path.startsWith("/agency")) return "agency_admin";
  if (path.startsWith("/admin")) return "super_admin";
  return null;
}
