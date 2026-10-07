# Bundles

What each page ships, why, and the budgets CI enforces. Measured in M9 (2026-10-06) from `next build` ("First Load JS", compressed). Re-measure with `pnpm build` and check with `pnpm bundle:check <build log>`.

## Budgets

| Group | Budget | Heaviest today | Why it differs |
| --- | --- | --- | --- |
| Content pages (home, services, how it works, for agencies, pricing, about, legal, errors) | **130 kB** | 120 kB (styleguide); home 109 kB | No form libraries; Home is the Lighthouse target |
| Pages with forms (contact, sign in, sign up, agency onboarding, password, verify email) and all workspaces (`/family`, `/agency`, `/admin`, `/demo`) | **185 kB** | 174 kB (new request, sign in) | React Hook Form + zod (~50 kB) and TanStack Query |

The shared chunk loaded by every page is 103 kB (React, Next runtime). CI fails if a route goes over its budget (`scripts/bundle-budget.mts`, job `web`). Raise a budget only with a note here explaining what the extra weight buys.

Change from the M9 plan: the plan proposed 150 kB for marketing and 200 kB for workspaces. Grouping by what a page does is tighter for both, and puts the contact page (a form, 159 kB) with the other form pages.

## What changed in M9

The app's `package.json` now declares `"sideEffects": ["*.css", "**/features/auth/client.ts"]`. Without it, webpack kept everything a feature's `index.ts` re-exports, so importing two labels from `@/features/workers` also shipped the add-worker form schema (zod) and more. `features/auth/client.ts` is listed because it wires the API client when it loads; the stylesheet import is the only other side-effect import in `src`.

| Route | Before | After |
| --- | --- | --- |
| `/admin/workers` | 187 kB | 140 kB |
| `/admin/workers/[id]` | 187 kB | 155 kB |
| `/agency/requests/[id]` | 188 kB | 154 kB |
| `/family/requests/[id]` | 187 kB | 154 kB |
| `/family/workers/[id]` | 157 kB | 135 kB |
| `/family`, `/agency`, settings pages | 161–170 kB | 156–164 kB |

## All routes (after)

| Route | First load |
| --- | --- |
| `/`, `/about`, `/how-it-works`, `/for-agencies`, `/pricing`, `/services/[slug]` | 109 kB |
| `/services` | 118 kB |
| `/privacy`, `/terms`, `/_not-found`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image` | 103 kB |
| `/403` | 106 kB |
| `/styleguide` (dev and tests only) | 120 kB |
| `/contact` | 159 kB |
| `/login`, `/signup`, `/signup/agency` | 171–174 kB |
| `/forgot-password`, `/reset-password`, `/verify-email` | 164–166 kB |
| `/family`, `/family/settings` | 161–164 kB |
| `/family/requests`, `/family/requests/new`, `/family/requests/[id]` | 139 / 174 / 154 kB |
| `/family/placements`, `/family/placements/[id]`, `/family/payments`, callback | 133–154 kB |
| `/family/workers/[id]` | 135 kB |
| `/agency`, `/agency/settings` | 162–163 kB |
| `/agency/workers`, `/new`, `/[id]` | 140 / 173 / 157 kB |
| `/agency/requests`, `/[id]`, `/placements`, `/[id]`, `/billing` | 134–154 kB |
| `/admin`, `/admin/agencies`, `/[id]`, `/audit-log` | 137–153 kB |
| `/admin/workers`, `/[id]`, `/admin/placements`, `/[id]` | 140–155 kB |
| `/demo/checkout` | 141 kB |

## Rules that keep this down

- Route files import screens directly; feature `index.ts` files never re-export screens (M3).
- Feature barrels can re-export anything else: unused exports are now dropped. Keep new top-level side effects out of feature modules, or add the file to `sideEffects`.
- Images go through the asset map and `next/image`; photos are ≤ 300 KB at 1600 px (`src/assets/images/budget.test.ts`).
