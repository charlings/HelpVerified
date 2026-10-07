import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { appNav } from "@/config/nav";
import { homeForRole, type Role } from "@/config/routes";
import { AppNavList } from "./AppNavList";
import { BottomTabs } from "./BottomTabs";

// Bottom tab bar height (56px) plus breathing room, so the last content never hides behind it.
const PHONE_BOTTOM_PADDING = "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0";

/**
 * The logo mark sits on a white tile because the full-colour logo must not be placed on navy
 * and no white variant has been approved yet (see docs/placeholders.md).
 */
function MarkTile({ size }: { size: number }) {
  return (
    <span className="inline-flex rounded-md bg-white p-1.5 shadow-sm">
      <Logo variant="mark" height={size} />
    </span>
  );
}

type AppShellProps = {
  role: Role;
  /** Account controls (name, sign out) supplied by the auth feature; components never import features. */
  account?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({ role, account, children }: AppShellProps) {
  const nav = appNav[role];
  const home = homeForRole[role];

  return (
    <div className="min-h-dvh bg-slate-50 md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Workspace sidebar" className="sticky top-0 hidden h-dvh flex-col bg-navy-900 py-5 md:flex">
        <Link
          href={home}
          aria-label={`HelpVerified ${nav.workspaceLabel.toLowerCase()} home`}
          className="mx-auto flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-md lg:mx-4 lg:justify-start"
        >
          <MarkTile size={28} />
          <span className="hidden font-display text-base font-bold text-white lg:inline">
            {nav.workspaceLabel} workspace
          </span>
        </Link>
        <nav aria-label={`${nav.workspaceLabel} navigation`} className="mt-8 flex-1 overflow-y-auto">
          <div className="hidden lg:block">
            <AppNavList items={nav.items} variant="sidebar" />
          </div>
          <div className="lg:hidden">
            <AppNavList items={nav.items} variant="rail" />
          </div>
        </nav>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white px-4 sm:px-6">
          <Link
            href={home}
            aria-label={`HelpVerified ${nav.workspaceLabel.toLowerCase()} home`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm md:hidden"
          >
            <Logo variant="mark" height={32} />
          </Link>
          <p className="font-display text-base font-bold text-navy-900">
            <span className="md:hidden">{nav.workspaceLabel}</span>
            <span className="hidden md:inline lg:hidden">{nav.workspaceLabel} workspace</span>
          </p>
          {account}
        </header>
        <main id="main" tabIndex={-1} className={`flex-1 outline-none ${PHONE_BOTTOM_PADDING}`}>
          {children}
        </main>
      </div>

      <BottomTabs nav={nav} className="md:hidden" />
    </div>
  );
}
