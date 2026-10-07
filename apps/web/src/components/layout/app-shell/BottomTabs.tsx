"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Ellipsis, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { appIcons } from "@/components/navigation/icons";
import type { AppNav } from "@/config/nav";
import { isActive } from "@/lib/active-link";
import { cn } from "@/lib/cn";

const tabClass =
  "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-xs font-semibold transition-colors duration-(--duration-fast)";

export function BottomTabs({ nav, className }: { nav: AppNav; className?: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  const primary = nav.items.slice(0, nav.primaryCount);
  const overflow = nav.items.slice(nav.primaryCount);
  const activeIn = (items: typeof nav.items) => items.some((i) => isActive(pathname, i.href, { exact: i.exact }));
  const slots = primary.length + (overflow.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label={`${nav.workspaceLabel} navigation`}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
        {primary.map((item) => {
          const Icon = appIcons[item.icon];
          const active = isActive(pathname, item.href, { exact: item.exact });
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active ? "text-blue-600" : "text-slate-600 hover:text-navy-900")}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}

        {overflow.length > 0 ? (
          <li>
            <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
              <Dialog.Trigger
                className={cn(tabClass, activeIn(overflow) ? "text-blue-600" : "text-slate-600 hover:text-navy-900")}
              >
                <Ellipsis aria-hidden="true" className="size-5" />
                <span>More</span>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-navy-900/40" />
                <Dialog.Content
                  aria-describedby={undefined}
                  className="fixed inset-x-0 bottom-0 z-50 rounded-t-lg bg-white pb-[env(safe-area-inset-bottom)] shadow-lg"
                >
                  <div className="flex items-center justify-between px-4 pt-3">
                    <Dialog.Title className="font-display text-lg font-bold text-navy-900">More</Dialog.Title>
                    <Dialog.Close
                      aria-label="Close"
                      className="inline-flex size-11 items-center justify-center rounded-full text-navy-900 hover:bg-blue-50"
                    >
                      <X aria-hidden="true" className="size-6" />
                    </Dialog.Close>
                  </div>
                  <ul className="grid gap-1 px-2 pt-1 pb-4">
                    {overflow.map((item) => {
                      const Icon = appIcons[item.icon];
                      const active = isActive(pathname, item.href, { exact: item.exact });
                      return (
                        <li key={item.href}>
                          <Dialog.Close asChild>
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "flex min-h-12 items-center gap-3 rounded-sm px-3 text-base font-semibold hover:bg-blue-50",
                                active ? "text-blue-600" : "text-navy-900",
                              )}
                            >
                              <Icon aria-hidden="true" className="size-5" />
                              {item.label}
                            </Link>
                          </Dialog.Close>
                        </li>
                      );
                    })}
                  </ul>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
