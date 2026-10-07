import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { routes } from "@/config/routes";

type AuthLayoutProps = {
  /** Decorative promo panel shown beside the form on wide screens. */
  panel: React.ReactNode;
  legal: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Split card from the login reference: form on the left, promo panel on the right (≥1024px).
 * Below 1024px the panel collapses to a short gradient band and the form takes the full width.
 */
export function AuthLayout({ panel, legal, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh items-stretch justify-center bg-blue-50 lg:items-center lg:p-8">
      <div className="flex w-full max-w-[70rem] flex-col overflow-hidden bg-white lg:grid lg:min-h-[44rem] lg:grid-cols-2 lg:rounded-lg lg:shadow-lg">
        <div
          aria-hidden="true"
          className="flex h-[120px] items-center justify-center bg-(image:--gradient-panel) lg:hidden"
        >
          <span className="inline-flex rounded-md bg-white p-2 shadow-md">
            <Logo variant="mark" height={40} />
          </span>
        </div>

        <div className="flex flex-1 flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
          <header>
            <Link
              href={routes.home}
              aria-label="HelpVerified home"
              className="inline-flex min-h-11 items-center rounded-sm"
            >
              <Logo height={32} priority />
            </Link>
          </header>
          <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center py-10 outline-none">
            <div className="w-full max-w-(--container-auth-form)">{children}</div>
          </main>
          <footer className="text-sm">{legal}</footer>
        </div>

        {panel}
      </div>
    </div>
  );
}
