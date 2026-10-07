"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/animation/useReducedMotion";
import type { ServiceSlug } from "@/config/routes";
import { cn } from "@/lib/cn";

type ServiceChipsProps = {
  items: readonly { slug: ServiceSlug; label: string }[];
};

/**
 * In-page anchors that stick below the header. A rAF-throttled scroll-spy marks the chip for the section in view.
 * Activating a chip scrolls to the section and moves focus to its heading.
 */
export function ServiceChips({ items }: ServiceChipsProps) {
  const [current, setCurrent] = useState<ServiceSlug | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.slug))
      .filter((el): el is HTMLElement => el !== null);

    // The current section is the last one whose top has scrolled past the bottom of the sticky chips.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 1;
      let active: ServiceSlug | null = null;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) active = section.id as ServiceSlug;
      }
      setCurrent(active);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  function goTo(event: React.MouseEvent<HTMLAnchorElement>, slug: ServiceSlug) {
    const section = document.getElementById(slug);
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    history.replaceState(null, "", `#${slug}`);
    setCurrent(slug);
  }

  return (
    <nav
      ref={navRef}
      aria-label="Services on this page"
      className="sticky top-16 z-30 border-b border-border bg-white/95 backdrop-blur lg:top-20"
    >
      <ul className="mx-auto flex w-full max-w-(--container-marketing) gap-2 overflow-x-auto px-4 py-3 sm:px-6">
        {items.map((item) => (
          <li key={item.slug}>
            <a
              href={`#${item.slug}`}
              onClick={(e) => goTo(e, item.slug)}
              aria-current={current === item.slug ? "true" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold whitespace-nowrap transition-colors duration-(--duration-fast)",
                current === item.slug
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-border bg-white text-navy-900 hover:bg-blue-50",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
