import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { buttonVariants } from "@/components/ui/Button";
import { headerActions, marketingNav } from "@/config/nav";
import { routes } from "@/config/routes";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 w-full max-w-(--container-marketing) items-center gap-6 px-4 sm:px-6 lg:h-20">
        <Link
          href={routes.home}
          aria-label="HelpVerified home"
          className="inline-flex min-h-11 shrink-0 items-center rounded-sm"
        >
          <Logo height={40} priority className="[--logo-h:2rem] lg:[--logo-h:2.5rem]" />
        </Link>

        <DesktopNav entries={marketingNav} className="hidden flex-1 lg:flex" />

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link href={headerActions.signIn.href} className={buttonVariants({ variant: "ghost" })}>
            {headerActions.signIn.label}
          </Link>
          <Link href={headerActions.getStarted.href} className={buttonVariants()}>
            {headerActions.getStarted.label}
          </Link>
        </div>

        <MobileNav entries={marketingNav} actions={headerActions} className="ml-auto lg:hidden" />
      </div>
    </header>
  );
}
