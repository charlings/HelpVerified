# Plan: M9 — Freeze

**Spec:** `specs/frontend/project-helpverified-web.md` (acceptance checklist; milestone M9: "cross-browser pass, bundle analysis, docs complete, owner sign-off recorded")
**Status:** Approved 2026-10-06 · Built 2026-10-06 (Stages A and B) · Signed off 2026-10-06

## Objective

Close Phase 1 so backend work (B1) can start against a frontend that is finished, verified and documented:

- every item in the spec's acceptance checklist is verified and the evidence written down;
- the app passes on the phone browser (WebKit, iPhone 13) as well as Chromium;
- bundle sizes are measured, explained, and the known excess fixed;
- the docs a backend developer needs are complete and correct;
- the owner signs off, and that sign-off is recorded.

No new features. Anything found that needs a design or product decision is listed for the owner, not changed silently.

## What I found while planning

| Area | Finding |
| --- | --- |
| Phone browser | The `webkit-mobile` project has never run locally (WebKit isn't installed on this laptop); CI runs it but hasn't been checked against M5–M8 |
| Acceptance checks with no automated test | No link crawler (spec: "no broken links"); no test that lint fails on a path literal / raw hex / image path / cross-feature import; no check that optimised photos are ≤ 300 KB at 1600 px |
| Bundles | No analysis tooling. Known: admin worker pages ship ~47 kB more than the agency equivalent (M7) |
| Carry-overs | `RoleGuard`'s session skeleton has no `h1` (M8); Lighthouse performance ≥ 90 not consistently met locally (ADR 0004, CI job) |
| Docs | `CLAUDE.md` and the backend spec name `features/placements/status.ts` as the mirror of the backend state machine; it's actually `state-machine.ts`. No single handoff document for backend work |

## Decisions needing approval

1. **Browsers: Chromium (desktop) and WebKit (iPhone 13, 375 px)**, as the testing reference specifies, run in full locally and in CI. **Firefox gets a one-off smoke run** (sign in, each workspace home, the family journey) recorded in the report, but isn't added to CI. Say if you want Firefox in CI.
2. **Spec acceptance evidence** goes in `docs/frontend-signoff.md`: each checklist item, its result, and the test or manual check that proves it. Items without automation get one:
   - link crawler over every public route (no broken internal links, no missing images);
   - lint-rule tests: small fixture files that must fail lint for a path literal, raw hex, raw image path and cross-feature deep import;
   - image budget test: every optimised photo at 1600 px ≤ 300 KB.
3. **Bundle analysis** with `@next/bundle-analyzer` (dev dependency, `pnpm analyze`). Results go in `docs/bundles.md`: first-load JS per route, the shared chunk, and what's in the largest ones. **Budgets**: marketing routes ≤ 150 kB first load (Home is the Lighthouse target), workspace routes ≤ 200 kB; a CI check fails above them. The admin worker excess gets fixed (most likely by importing the workers feature's status helpers without its form schema).
4. **`RoleGuard` loading** renders the workspace header and a visually hidden "Loading your workspace" `h1`, so every page has one `h1` even for that moment.
5. **Docs complete** means: README (setup, demo accounts, commands, how to run the audit), architecture, route map, API contracts (checked against every mock handler), placeholders and open decisions, accessibility, bundles, ADRs for the decisions made in M5–M8 that aren't recorded yet, and a **backend handoff** (`docs/backend-handoff.md`): what the mock enforces that the API must, the schema changes the frontend introduced (`flag_reason`/`flagged_at`, `admin_ended`, `status_reason`), the contract freeze, and the order of B1–B8.
6. **Contract freeze:** after sign-off, a change to a request or response shape in `api-contracts.md` needs an ADR, because the backend is built against it.
7. **Lighthouse** stays as ADR 0004 decided (CI is the measure). The report states the latest CI-equivalent numbers if available and the local ones.

## Steps

### Stage A — Verification and fixes
1. Install WebKit; run the full suite on `webkit-mobile` (in parts); fix what fails or record why a test doesn't apply on a phone.
2. Firefox smoke run (decision 1).
3. Link crawler, lint-rule tests, image budget test (decision 2).
4. Bundle analysis, budgets in CI, the admin worker fix (decision 3); `RoleGuard` `h1` (decision 4).
5. Full suites on Chromium and WebKit; audit. **Commit Stage A.**

### Stage B — Docs and sign-off
6. Go through the spec acceptance checklist item by item into `docs/frontend-signoff.md`.
7. Docs (decision 5): fix the state-machine pointer, write the backend handoff and missing ADRs, refresh README and the rest.
8. CHANGELOG M9 and the Phase 1 summary; CLAUDE.md phase block ready to switch to Phase 2 on sign-off. **Commit Stage B.**
9. Owner review and sign-off, recorded in `docs/frontend-signoff.md`, the CHANGELOG and CLAUDE.md. Backend B1 starts only after that.

## M9 acceptance criteria

- [x] Full Playwright + axe suite passes on Chromium and WebKit (iPhone 13); Firefox smoke run recorded
- [x] Every spec acceptance item verified, with evidence, in `docs/frontend-signoff.md`
- [x] Bundle report written; budgets enforced in CI; admin worker excess fixed
- [x] Docs complete and consistent with the code (including the backend handoff)
- [x] lint, typecheck, unit tests, build, e2e, audit all pass
- [x] Owner sign-off recorded before any backend work

## Risks

- **WebKit differences** (date inputs, focus, `backdrop-filter`) may need small fixes; each is listed in the report.
- **Memory on this laptop:** two browser engines and the audit are heavy; runs stay in small foreground parts.
- **Budgets** may flag routes beyond the known admin case; if a fix needs a design change (e.g. dropping an image or animation), I'll ask.
