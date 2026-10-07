# Frontend sign-off (Phase 1)

Every acceptance item in `specs/frontend/project-helpverified-web.md`, with its result and the evidence that proves it. Verified 2026-10-06 at the end of M9 on Windows 11, Node 24, Chromium, WebKit (iPhone 13) and Firefox.

**Result:** 17 of 18 items met. One is **not yet proven**: Lighthouse performance ≥ 90, which ADR 0004 assigns to the CI job because this laptop can't measure it reliably (details under item 12).

## Acceptance items

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `pnpm install && pnpm --filter web dev` runs from a clean clone; lint, typecheck, unit tests and build pass in CI | **Met** (locally); CI not yet run | Fresh `git clone` of the committed repo (M9): `pnpm install --frozen-lockfile`, lint, typecheck, build and bundle budgets pass, and `next dev` serves `/`. This found and fixed a real problem: the type check needed `next-env.d.ts`, which only exists after a build, so `typecheck` now runs `next typegen` first. The CI workflow runs the same steps; it runs on the first push. |
| 2 | Lint fails on a path literal, raw hex, image path outside the asset map, cross-feature deep import | **Met** | `src/test/lint-rules.test.ts` (11 tests, including route-file rules and clean code passing) |
| 3 | No route file contains `fetch` or `useQuery` | **Met** | Enforced by lint on `src/app/**` (tested in `lint-rules.test.ts`); `pnpm lint` passes |
| 4 | Forcing each error code via `?mock_error=` shows the mapped message, never the raw code | **Met** | `src/lib/error-messages.test.ts` (every one of the 24 codes has its own message, none shows a code); `?mock_error` exercised end to end in `e2e/marketing.spec.ts`, `family.spec.ts`, `agency-requests.spec.ts`, unit tests in `api-client.test.ts` |
| 5 | Placement detail shows only the buttons in the mocked `allowed_actions` for each state × role | **Met** | `features/placements/state-machine.test.ts` (every state × role); placement screen tests for family, agency and admin; `mocks/handlers/family-placements.test.ts` |
| 6 | Favicons and manifest load; logo undistorted in header, footer and auth at all four widths | **Met** | `e2e/assets.spec.ts`: favicons/manifest served; logo proportions within 2% at 375/768/1280/1536 px on Home and Sign in (added M9) |
| 7 | Each optimised photo at 1600 px ≤ 300 KB; removing one from the map shows the placeholder | **Met** | `src/assets/images/budget.test.ts` (largest 96 KB); `components/shared/ResponsiveImage.test.tsx` (placeholder) |
| 8 | Every route renders with the correct title; link crawler finds no broken links | **Met** | `e2e/routes.spec.ts` (every route in `routes.ts`); `e2e/links.spec.ts` (crawls the public site, no broken links or images) |
| 9 | Services: reveal on scroll, chips track the section; reduced motion renders final state | **Met** | `e2e/marketing.spec.ts` |
| 10 | Every data screen tests loading, empty and error; every form tests field and form errors | **Met** | `src/test/states.test.tsx` (27 screens), `src/test/empty-states.test.tsx`, `src/test/forms.test.tsx`, screen tests; matrix in `docs/accessibility.md` |
| 11 | Zero axe violations on every route; keyboard-only pass completes each milestone's flows | **Met** | `e2e/audit.spec.ts` 49/49 routes (seeded data, 375 and 1280 px); `e2e/keyboard.spec.ts` (M4–M7 flows) |
| 12 | Lighthouse mobile on Home and Services: performance ≥ 90, accessibility 100, SEO 100 | **Not yet proven** (performance) | Accessibility **100** and SEO **100** on both pages. Performance locally on 2026-10-06: Home 60, Services 70, with total blocking time 1.1–1.9 s while the laptop had ~2 GB free; M3 measured 79–90 on the same code with more memory. ADR 0004: the CI `lighthouse` job (GitHub runner) is the measure. **Owner action:** push, then check that job. If it's below 90 there, it's a fix before B7, not a design change. |
| 13 | No horizontal scroll at 375/768/1280/1536 px | **Met** | `e2e/audit.spec.ts` checks every route at all four widths |
| 14 | Agency can't list a worker at 3/4 (disabled with reason; mock returns `WORKER_NOT_VERIFIED` if forced) | **Met** | `e2e/agency.spec.ts`, `features/workers/listing.test.ts`, `mocks/handlers/workers.test.ts` |
| 15 | Two accepts for the same worker: the second shows "This worker has just been placed with another family" | **Met** | `e2e/family.spec.ts` (forced conflict), `mocks/handlers/family-requests.test.ts` (rule against the mock). Real concurrency is tested in B4. |
| 16 | Journey: sign up → request → agency proposes → accept → mock pay → trial → confirm; replacement flow | **Met** | `e2e/journey.spec.ts` on Chromium, WebKit and Firefox |
| 17 | Non-admin on `/admin` gets 403; expired session lands on sign-in with `expired=1` | **Met** | `e2e/admin.spec.ts` (every admin route, family and agency), `e2e/auth.spec.ts`, `features/auth/redirects.test.ts` |
| 18 | "Demo mode" pill visible whenever mocking is on | **Met** | `e2e/routes.spec.ts` asserts it on every route (added M9); `e2e/marketing.spec.ts` |

## Test totals at sign-off

| Suite | Result |
| --- | --- |
| Lint, Stylelint, typecheck | Pass |
| Vitest | 484 / 484 |
| Playwright + axe, Chromium | 174 / 174 |
| Playwright, WebKit (iPhone 13) | 168 passed, 6 skipped (keyboard-only tests; Safari Tabs to links only with Option+Tab) |
| Firefox smoke | 7 / 7 |
| Accessibility audit | 49 / 49 routes |
| Bundle budgets | 51 / 51 routes within budget |

## Open owner decisions carried into Phase 2

From `CLAUDE.md`, unchanged by Phase 1 and all configurable: fee charged at accept (current) or at confirmation; trial length (14 days), replacement window (30 days), free replacements (1); brand fonts and a white logo; photo licences; Paystack test vs live for the demo. Real prices (placement fee, subscription) are demo values (`docs/placeholders.md`).

## Sign-off

- **Owner:** signed off ("Sign off")
- **Date:** 2026-10-06
- **Note:** signed off with item 12 (Lighthouse performance ≥ 90) still to be confirmed by the CI `lighthouse` job on the first push. Backend work is on hold until the owner says to start.

Backend work (B1) starts only after this section is filled in.
