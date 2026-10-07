# 0003 — M1 implementation choices

- **Status:** Accepted
- **Date:** 2026-10-04

Small decisions made while building M1 that differ from, or refine, the project skill.

## 1. Styleguide at `/styleguide`

The skill specified `app/_styleguide`. In the App Router, a folder starting with `_` is private and never routes. The page lives at `app/(dev)/styleguide` and returns 404 in production unless `ENABLE_STYLEGUIDE=true` (used by the Playwright run so axe can check it).

## 2. `ResponsiveImage` uses `<picture>`, not `next/image`

The image script already produces optimised AVIF/WebP/JPEG at four widths. Passing them through `next/image` would re-optimise at request time (extra cost on Vercel) and hide the variants we control. `ResponsiveImage` renders a `<picture>` with `srcset`/`sizes` inside a fixed aspect-ratio box. The logo still uses `next/image`, since it's a static import with known dimensions.

## 3. `danger-700` token added

`danger-600` (#DC2626) on `danger-50` (#FEF2F2) measures 4.41:1, below WCAG AA for small text. The unit test `src/styles/tokens.test.ts` caught it. `danger-700` (#B91C1C) is used for text on `danger-50` (badges, alerts). `danger-600` remains for borders and error text on white (4.83:1). The skill's design-system reference was updated to match.

## 4. Lint enforcement with built-in rules

The plan named `eslint-plugin-boundaries`. Instead, `import/no-restricted-paths` and `no-restricted-imports` (both already available through `eslint-config-next`) enforce the same boundaries, matching the skill's frontend reference and avoiding an extra plugin.

## 5. Tailwind default palette removed

`tokens.css` starts with `--color-*: initial`, so only brand tokens exist as colour utilities (`bg-blue-600` is the brand blue, not Tailwind's). An off-brand colour class simply does not compile to anything.
