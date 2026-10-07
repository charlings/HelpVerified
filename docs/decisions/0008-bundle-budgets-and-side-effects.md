# 0008 — Bundle budgets and side-effect-free modules

- **Status:** Accepted
- **Date:** 2026-10-06 (M9)
- **Decided by:** Owner, approving the M9 plan; budget grouping settled during the build

## Context

Feature `index.ts` barrels re-export shared pieces. Webpack treated every module as possibly having side effects, so importing two labels from `@/features/workers` also shipped its form schema (zod): admin worker pages were 187 kB against 140 kB for the agency equivalent.

## Decision

- `apps/web/package.json` declares `"sideEffects": ["*.css", "**/features/auth/client.ts"]`. Unused barrel exports are dropped. `features/auth/client.ts` stays listed because it wires the API client when it loads. A new module with top-level side effects must be added to the list.
- CI fails if a route's first-load JS exceeds its budget (`scripts/bundle-budget.mts`): **content pages ≤ 130 kB**, **pages with forms and the workspaces ≤ 185 kB**. Grouping by what a page does (rather than marketing vs workspace, as first planned at 150/200 kB) is tighter for both and puts the contact form with the other forms.

## Consequences

17 routes got smaller (largest drops 187 → 140 kB and 188 → 154 kB). Raising a budget needs a note in `docs/bundles.md` saying what the extra weight buys.
