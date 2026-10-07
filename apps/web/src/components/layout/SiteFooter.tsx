import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { footerNav } from "@/config/nav";
import { routes } from "@/config/routes";
import { site } from "@/config/site";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-slate-50">
      <div className="mx-auto grid w-full max-w-(--container-marketing) gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <Link
            href={routes.home}
            aria-label="HelpVerified home"
            className="inline-flex min-h-11 items-center rounded-sm"
          >
            <Logo height={32} />
          </Link>
          <p className="mt-4 max-w-xs text-sm">{site.description}</p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {footerNav.map((group) => (
            <div key={group.label}>
              <h2 className="font-display text-sm font-bold text-navy-900">{group.label}</h2>
              <ul className="mt-1 grid">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 min-w-11 items-center rounded-sm text-sm text-slate-600 hover:text-blue-600 hover:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto w-full max-w-(--container-marketing) px-4 py-6 text-sm sm:px-6">
          © {year} {site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
