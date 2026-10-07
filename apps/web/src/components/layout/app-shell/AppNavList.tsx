"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appIcons } from "@/components/navigation/icons";
import type { AppNavItem } from "@/config/nav";
import { isActive } from "@/lib/active-link";
import { cn } from "@/lib/cn";

type AppNavListProps = {
  items: readonly AppNavItem[];
  variant: "sidebar" | "rail";
};

const variants = {
  sidebar: {
    list: "grid gap-1",
    link: "flex min-h-11 items-center gap-3 border-l-4 px-4 text-sm font-semibold",
    icon: "size-5 shrink-0",
  },
  rail: {
    list: "grid gap-1",
    link: "flex min-h-14 flex-col items-center justify-center gap-1 border-l-4 px-1 text-xs font-semibold text-center",
    icon: "size-5 shrink-0",
  },
} as const;

export function AppNavList({ items, variant }: AppNavListProps) {
  const pathname = usePathname();
  const styles = variants[variant];

  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const Icon = appIcons[item.icon];
        const active = isActive(pathname, item.href, { exact: item.exact });
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                styles.link,
                "transition-colors duration-(--duration-fast)",
                active
                  ? "border-blue-600 bg-white/10 text-white"
                  : "border-transparent text-white/75 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className={styles.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
