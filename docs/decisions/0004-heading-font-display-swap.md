# 0004 — Keep `font-display: swap` for the heading font

- **Status:** Accepted
- **Date:** 2026-10-05
- **Decided by:** Claude Code, delegated by the owner ("make the fallback call on the font")

## Context

Lighthouse on Home and Services reported the hero `<h1>` as the largest contentful paint (LCP), with about 1.3 s of render delay that lined up with the Plus Jakarta Sans download. The M3 report raised `font-display: optional` as a possible fix: the browser uses the web font only if it arrives within ~100 ms, otherwise the page keeps the fallback for that view, so the heading never waits for the font.

The cost of `optional` is brand consistency: on a first visit over a slow connection (common for the target audience on mobile networks), headings would show in the fallback font for the whole page view.

Both options use `next/font`'s size-adjusted fallback, so neither causes layout shift.

## Measurement

Same machine, same production build settings, Lighthouse mobile defaults.

| Setting | Home performance | Home LCP | Services performance | Services LCP |
| --- | --- | --- | --- | --- |
| `swap` (2 runs) | 86, 90 | 3.3 s | 88, 79 | 3.5 s |
| `optional` (3 runs) | 79, 79, 86 | 3.4–3.9 s | 87, 81, 84 | 2.1–3.4 s |

`optional` produced no consistent improvement. Run-to-run variation (CPU benchmark 735–1393 across these runs) is larger than any difference between the two settings.

## Decision

Keep `display: "swap"` for Plus Jakarta Sans (headings). Inter (body) also stays `swap` and is not preloaded, so the heading font downloads first.

## Consequences

- Headings always end up in the brand font; first paint uses the size-matched fallback and swaps without layout shift.
- The remaining LCP delay is not caused by the font. The next candidates to investigate, if the CI Lighthouse job also reports < 90, are hydration cost (header navigation and reveal components) and the hero image on Services.
- Revisit if real-user data (field LCP) shows headings waiting on the font.
