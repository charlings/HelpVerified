"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/Button";
import { isNavGroup, type NavGroup, type NavLink } from "@/config/nav";
import { isActive } from "@/lib/active-link";
import { cn } from "@/lib/cn";

type MobileNavProps = {
  entries: readonly (NavLink | NavGroup)[];
  actions: { signIn: NavLink; getStarted: NavLink };
  className?: string;
};

const linkClass =
  "flex min-h-11 items-center rounded-sm px-3 text-base font-semibold text-navy-900 hover:bg-blue-50 aria-[current=page]:text-blue-600";

export function MobileNav({ entries, actions, className }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const current = (href: string) => (isActive(pathname, href) ? "page" : undefined);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full text-navy-900 hover:bg-blue-50",
          className,
        )}
        aria-label="Open menu"
      >
        <Menu aria-hidden="true" className="size-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy-900/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-lg"
        >
          <div className="flex h-16 items-center justify-between border-b border-border px-4">
            <Dialog.Title className="font-display text-lg font-bold text-navy-900">Menu</Dialog.Title>
            <Dialog.Close
              className="inline-flex size-11 items-center justify-center rounded-full text-navy-900 hover:bg-blue-50"
              aria-label="Close menu"
            >
              <X aria-hidden="true" className="size-6" />
            </Dialog.Close>
          </div>

          <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 py-4">
            <ul className="grid gap-1">
              {entries.map((entry) =>
                isNavGroup(entry) ? (
                  <li key={entry.label}>
                    <details className="group" open={entry.items.some((i) => isActive(pathname, i.href))}>
                      <summary className={cn(linkClass, "cursor-pointer list-none justify-between")}>
                        {entry.label}
                        <ChevronDown
                          aria-hidden="true"
                          className="size-5 transition-transform duration-(--duration-fast) group-open:rotate-180"
                        />
                      </summary>
                      <ul className="mt-1 grid gap-1 border-l border-border pl-3">
                        {entry.items.map((item) => (
                          <li key={item.href}>
                            <Dialog.Close asChild>
                              <Link
                                href={item.href}
                                aria-current={current(item.href)}
                                className={cn(linkClass, "font-medium")}
                              >
                                {item.label}
                              </Link>
                            </Dialog.Close>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ) : (
                  <li key={entry.href}>
                    <Dialog.Close asChild>
                      <Link href={entry.href} aria-current={current(entry.href)} className={linkClass}>
                        {entry.label}
                      </Link>
                    </Dialog.Close>
                  </li>
                ),
              )}
            </ul>
          </nav>

          <div className="grid gap-2 border-t border-border p-4">
            <Dialog.Close asChild>
              <Link href={actions.getStarted.href} className={buttonVariants({ size: "lg" })}>
                {actions.getStarted.label}
              </Link>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Link href={actions.signIn.href} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                {actions.signIn.label}
              </Link>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
