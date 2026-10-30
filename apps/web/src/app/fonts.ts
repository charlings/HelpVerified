import localFont from "next/font/local";

// Self-hosted copies of the Google Fonts latin variable files (OFL, licences beside them), so the build never
// fetches from Google: next/font/google crashed CI builds when Google returned font URLs without an extension.

// swap, not optional: measured in ADR 0004 — optional did not improve LCP and would show the fallback on first visits.
export const fontDisplay = localFont({
  src: "../assets/fonts/plus-jakarta-sans-latin-wght.woff2",
  weight: "600 800",
  display: "swap",
  variable: "--font-jakarta",
});

// Not preloaded: the hero heading (the largest paint) uses the display font, so it gets the bandwidth first.
// Body text renders in the size-matched fallback and swaps when Inter arrives.
export const fontBody = localFont({
  src: "../assets/fonts/inter-latin-wght.woff2",
  weight: "400 600",
  display: "swap",
  variable: "--font-inter",
  preload: false,
});
