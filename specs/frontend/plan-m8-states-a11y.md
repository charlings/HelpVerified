# Plan: M8 — States and accessibility pass

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 18–20, 22; acceptance checklist items for states, forms, axe, keyboard and widths; milestone M8)
**Status:** Approved 2026-10-06 · Built 2026-10-06 (Stages A and B) · Signed off 2026-10-06

## Objective

Every page and state in the app meets the accessibility checklist (skill `frontend.md` §10) and the states requirements, and this is checked by machines rather than by memory:

- zero axe violations on every route, using real seeded data, at 375 and 1280 px;
- no horizontal scroll at 375, 768, 1280 and 1536 px;
- every interactive target at least 44 × 44 px (with the standard exceptions below);
- every data view has tested loading, empty and error states; every form has tested field and form errors, moves focus to the first problem, and disables its submit while pending;
- each milestone's main flow completes by keyboard alone.

No new features. Out of scope: cross-browser (WebKit, Firefox) and bundle analysis (M9), Lighthouse targets (unchanged; CI job and ADR 0004).

## What I found while planning

| Area | Finding | Fix |
| --- | --- | --- |
| Touch targets | Desktop menu triggers are 40 px tall (`DesktopNav`); the toast close button is 36 px (`Toast`) | Raise both to the 44 px token |
| Forms | Forms built on React Hook Form focus the first error. The hand-built dialogs (`ReasonDialog` for end, cancel, suspend, reject, flag; `RejectDialog` for checks) show the error but leave focus on the button | Focus the field with the error |
| Loading | Detail pages show only a skeleton while loading, with no `h1`: a screen-reader user lands on an untitled page, and the e2e tests had to wait for the heading | Loading states render the page header (title and back link) with the skeleton below |
| Route coverage | The route-wide axe test misses four routes added since M6 (`/admin/workers/{id}`, `/admin/placements/{id}`, `/family/payments/callback`, `/demo/checkout`), uses a dummy ID (so detail pages show "not found" instead of data) and runs at one width | New audit spec below |
| Unchecked | No automated check of horizontal scroll at all four widths, touch-target size, or keyboard-only flows beyond sign-in | New audit spec and keyboard spec |

The audit spec will almost certainly find more; each finding is fixed in this milestone and listed in the report.

## Decisions needing approval

1. **One audit spec drives the pass** (`e2e/audit.spec.ts`). For every route in `routes.ts`, signed in as the right role and using **seeded IDs** (real data, not the not-found state), it checks: one `h1`; axe with zero violations at 375 and 1280 px; no horizontal scroll at 375, 768, 1280 and 1536 px; every visible interactive target ≥ 44 × 44 px. The current `routes.spec.ts` keeps titles, status codes and 404s; its axe loop moves to the audit spec.
2. **Touch-target exceptions** follow WCAG 2.5.5 and are written into the test, not decided per case: links inside a sentence; a checkbox or radio whose whole label row is the target (measured as the label); controls the browser draws (date picker internals). Everything else must be 44 × 44 px.
3. **Loading states keep the page header.** Detail screens render their `PageHeader` with a generic title ("Placement", "Request", "Worker", "Agency") and the back link, with the skeleton beneath, then swap in the real title. One `h1` at all times.
4. **Dialogs with a reason field focus that field on an error** and announce the error (already `role="alert"`); after success, focus returns to the button that opened the dialog (Radix does this; it gets a test).
5. **A states matrix** (`docs/accessibility.md`) lists every data view and form with its loading, empty, error, field-error and pending tests. Gaps found while building it get tests (and fixes if the state is missing).
6. **Keyboard-only flows** (`e2e/keyboard.spec.ts`), one per milestone: post a request (M6), propose a worker (M5), accept and pay at the demo checkout (M6), approve an agency (M7), and sign in (M4, existing). Tab, Shift+Tab, Enter, Space, Escape and arrow keys only; each asserts focus is visible and lands where expected after dialogs close.
7. **Contrast** is checked in unit tests for every semantic pairing actually used: each badge tone, each alert tone, text on the brand gradients, focus ring on white and navy. The check uses the existing `lib/contrast.ts` and the values in `tokens.css`; any failing pairing gets a token fix (the yellow/amber "verified only" rule is kept).
8. **The audit runs as its own CI job** because it's the heaviest suite (~50 routes × several widths). Locally it runs with one worker.

## Steps

### Stage A — Automated audit and the fixes it finds
1. Write `e2e/audit.spec.ts` (decisions 1–2) and a seeded-ID map per route. Run it, record every finding.
2. Fix the known items (touch targets, loading headers) and everything the audit finds. Shared components first (one fix serves many routes), then page-specific.
3. Re-run until clean. **Commit Stage A.**

### Stage B — States, forms, focus, keyboard, contrast
4. Build the states matrix; add missing loading / empty / error / field-error / pending tests and fix any missing state.
5. Focus handling in `ReasonDialog` and `RejectDialog` (decision 4), with tests.
6. `e2e/keyboard.spec.ts` (decision 6).
7. Contrast tests (decision 7) and any token fixes.
8. CI job for the audit spec; `docs/accessibility.md` (matrix, exceptions, how to run); CHANGELOG M8; CLAUDE.md. Full suites. **Commit Stage B.**

## M8 acceptance criteria (from the testing reference and spec)

- [x] `@axe-core/playwright` reports zero violations on every route (seeded data, 375 and 1280 px)
- [x] No horizontal scroll at 375, 768, 1280 and 1536 px on every route
- [x] Interactive targets ≥ 44 × 44 px, exceptions as above
- [x] Every data screen has tests for loading, empty and error states; every form has tests for field and form errors, focus on the first invalid field and a disabled submit while pending
- [x] Keyboard-only pass completes each milestone's main flow
- [x] Semantic colour pairings meet 4.5:1 (text) and 3:1 (focus ring, large text)
- [x] lint, typecheck, unit tests, build, Chromium e2e + axe all pass

## Risks

- **Machine load:** the audit spec is large. Locally it runs with one worker and in parts; CI gets its own job. Failures that pass alone are reported as such, not hidden.
- **Unknown findings:** the audit may surface more than the table above. If a finding needs a design change (not just a fix), I'll stop and ask rather than redesign silently.
