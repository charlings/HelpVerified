import { homeForRole, privatePrefixes, routes, type Role } from "@/config/routes";

/** Paths a `next` parameter may send the user back to after sign-in. */
const allowedPrefixes: readonly string[] = [...privatePrefixes, routes.auth.agencySignup];

/**
 * Returns `next` only when it is a same-origin path into the app; anything else (absolute URLs,
 * protocol-relative `//host`, backslash tricks, marketing pages) is rejected to prevent open redirects.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(next, "http://helpverified.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://helpverified.invalid") return null;
  const path = url.pathname;
  const allowed = allowedPrefixes.some((p) => path === p || path.startsWith(`${p}/`));
  return allowed ? `${path}${url.search}` : null;
}

/** Where to go after sign-in: a safe `next` the role may open, otherwise the role's home. */
export function destinationAfterLogin(role: Role, next: string | null | undefined): string {
  const target = safeNext(next);
  if (!target) return homeForRole[role];
  const home = homeForRole[role];
  const roleOwnsTarget =
    target.startsWith(home) || (role === "agency_admin" && target.startsWith(routes.auth.agencySignup));
  return roleOwnsTarget ? target : home;
}

export function loginUrl(next?: string, expired = false): string {
  const params = new URLSearchParams();
  if (expired) params.set("expired", "1");
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `${routes.auth.login}?${query}` : routes.auth.login;
}
