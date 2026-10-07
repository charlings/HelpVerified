"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { routes, type Role } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { restoreSession, useSession } from "../client";
import { loginUrl } from "../redirects";

type RoleGuardProps = {
  role: Role;
  children: React.ReactNode;
};

/**
 * Client-side gate for a workspace. Restores the session, then sends anonymous users to sign in
 * (returning them here afterwards) and the wrong role to /403. middleware.ts is only the fast path;
 * the API remains the authority on every request.
 */
export function RoleGuard({ role, children }: RoleGuardProps) {
  const { status, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.replace(loginUrl(pathname));
    else if (status === "authenticated" && user && user.role !== role) router.replace(routes.forbidden);
  }, [status, user, role, router, pathname]);

  if (status !== "authenticated" || user?.role !== role) return <WorkspaceSkeleton />;
  return children;
}

function WorkspaceSkeleton() {
  return (
    <div className="min-h-dvh bg-slate-50 md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="hidden bg-navy-900 md:block" />
      {/* Even this moment has a main landmark (the skip link's target) and one h1 (M9). */}
      <main id="main" tabIndex={-1} className="p-6 outline-none">
        <h1 className="sr-only">{authCopy.guard.heading}</h1>
        <div role="status" aria-busy="true">
          <span className="sr-only">{authCopy.guard.loading}</span>
          <div aria-hidden="true" className="grid gap-4">
            <div className="h-10 w-1/3 animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none" />
            <div className="h-32 animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none" />
            <div className="h-32 animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none" />
          </div>
        </div>
      </main>
    </div>
  );
}
