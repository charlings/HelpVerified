"use client";

import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavGroup, type NavGroup, type NavLink } from "@/config/nav";
import { isActive } from "@/lib/active-link";
import { cn } from "@/lib/cn";

type DesktopNavProps = {
  entries: readonly (NavLink | NavGroup)[];
  className?: string;
};

const itemClass =
  "inline-flex h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold text-navy-900 transition-colors duration-(--duration-fast) hover:bg-blue-50 data-[active]:text-blue-600 data-[state=open]:bg-blue-50";

// Hover-to-open is disabled: menus open on click/Enter only, which is predictable for touch and keyboard users.
const preventHover = (event: { preventDefault: () => void }) => event.preventDefault();

export function DesktopNav({ entries, className }: DesktopNavProps) {
  const pathname = usePathname();

  return (
    <NavigationMenu.Root aria-label="Main" className={cn("relative", className)}>
      <NavigationMenu.List className="flex items-center gap-1">
        {entries.map((entry) =>
          isNavGroup(entry) ? (
            <NavigationMenu.Item key={entry.label} className="relative">
              <NavigationMenu.Trigger
                className={cn(itemClass, "group")}
                data-active={entry.items.some((i) => isActive(pathname, i.href)) ? "" : undefined}
                onPointerMove={preventHover}
                onPointerLeave={preventHover}
              >
                {entry.label}
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform duration-(--duration-fast) group-data-[state=open]:rotate-180"
                />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content
                onPointerMove={preventHover}
                onPointerLeave={preventHover}
                className="absolute top-full left-0 mt-2 w-64 rounded-md border border-border bg-white p-2 shadow-lg"
              >
                <ul className="grid gap-1">
                  {entry.items.map((item) => (
                    <li key={item.href}>
                      <NavigationMenu.Link asChild active={isActive(pathname, item.href)}>
                        <Link
                          href={item.href}
                          className="block rounded-sm px-3 py-2 text-sm font-medium text-navy-900 hover:bg-blue-50 data-[active]:text-blue-600"
                        >
                          {item.label}
                        </Link>
                      </NavigationMenu.Link>
                    </li>
                  ))}
                </ul>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          ) : (
            <NavigationMenu.Item key={entry.href}>
              <NavigationMenu.Link asChild active={isActive(pathname, entry.href)}>
                <Link href={entry.href} className={itemClass}>
                  {entry.label}
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          ),
        )}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}
