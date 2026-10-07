import { Inter, Plus_Jakarta_Sans } from "next/font/google";

// swap, not optional: measured in ADR 0004 — optional did not improve LCP and would show the fallback on first visits.
export const fontDisplay = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

// Not preloaded: the hero heading (the largest paint) uses the display font, so it gets the bandwidth first.
// Body text renders in the size-matched fallback and swaps when Inter arrives.
export const fontBody = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
  preload: false,
});
