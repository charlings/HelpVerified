import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, routes, type Role } from "@/config/routes";

/**
 * Fast-path redirect for workspaces using the non-sensitive `hv_role` hint cookie.
 * Not a security boundary: RoleGuard re-checks after the session restores, and the API checks every request.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const role = request.cookies.get("hv_role")?.value as Role | undefined;
  const workspace = (Object.entries(homeForRole) as [Role, string][]).find(
    ([, home]) => pathname === home || pathname.startsWith(`${home}/`),
  );
  if (!workspace) return NextResponse.next();

  if (!role || !(role in homeForRole)) {
    const url = new URL(routes.auth.login, request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (role !== workspace[0]) return NextResponse.redirect(new URL(routes.forbidden, request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/family/:path*", "/agency/:path*", "/admin/:path*"],
};
