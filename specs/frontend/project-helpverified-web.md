# Project: HelpVerified Web (Phase 1 — Frontend)

**Status:** Approved 2026-10-04

The Next.js frontend for HelpVerified: a public marketing site plus role-based workspaces where families post requests, agencies list fully verified workers and propose them, and super admins approve agencies. Phase 1 runs entirely against MSW mocks that enforce the real business rules, so the UI is built and signed off before any backend exists.

Source brief: `Claude Code Prompt_ Brand-Led, Scalable Website Development.md`. Detailed conventions: `.claude/skills/helpverified/references/frontend.md` and `design-system.md`.

## Goals

- A visitor can understand the service (nanny, driver, cleaner; four checks) and reach sign-up from any marketing page.
- A family, an agency admin and a super admin can each complete their core flows end to end against mocks.
- The UI cannot be used to break the two hard rules: no listing below 4/4 verified items, no second active placement for a worker.
- Any single route, component, asset or feature can be changed without edits outside its home (routes map, tokens, asset map, feature folder).
- Switching from mocks to the real API (B7) requires no feature-code changes.

## Non-goals

- Real authentication, payments, uploads or notifications (all mocked; the UI must say so via a "Demo mode" pill).
- Dark mode (tokens are role-named so it can be added later).
- Worker logins or a worker-facing app.
- Final copy, final photography, white logo variant (placeholders, tracked in `docs/placeholders.md`).
- Copying code, text, colours, fonts or images from joincolab.io, the Profusion template or the `login` image.

## Requirements

**Architecture**
1. Monorepo `apps/web` on Next.js 15 App Router, TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, MSW, Motion; pnpm workspaces.
2. Every route path is defined once in `src/config/routes.ts`; menus are built from it in `src/config/nav.ts`. No path string literals in components (lint-enforced).
3. Every design value (colour, font, size, spacing, radius, shadow, motion, focus ring) lives only in `src/styles/tokens.css`. Raw hex outside that file fails lint.
4. Every image path lives only in `src/assets/images/index.ts`, with alt text, focal point, ratio and a `temporary` flag.
5. `app/` route files only render a feature screen and set metadata; no `fetch` or `useQuery` there.
6. Features (`auth`, `marketing`, `requests`, `proposals`, `placements`, `workers`, `verification`, `agencies`, `billing`, `notifications`, `admin`) import each other only through `index.ts`; `components/ui` never imports from `features/` (ESLint-enforced).
7. All HTTP goes through `src/lib/api-client.ts`, which turns error envelopes into a typed `ApiError`; error codes map to messages in `src/lib/error-messages.ts`.
8. Placement and worker action buttons render from the API's `allowed_actions`, labelled via each feature's `status.ts`.

**Brand and assets**
9. Logo from the supplied `HelpVerified_Gradient_Logo.png` (trimmed, transparent) in header, footer, auth; mark used for favicons (16, 32, 180, 192, 512, `.ico`, `site.webmanifest`).
10. Photo1–3 are mapped to cleaner, driver, nanny; an image script produces 640/1024/1600/2400 px AVIF/WebP/JPEG, ≤ 300 KB at 1600 px.
11. A missing image renders the brand-gradient placeholder and is listed in `docs/placeholders.md`.

**Pages** (route map in `references/frontend.md` §2)
12. Marketing: Home, Services, service detail ×3, How it works, For agencies, Pricing, About, Contact (mocked submit), Privacy, Terms, 404, 403, error.
13. Auth: login, sign-up with role picker, agency onboarding, forgot password, reset password, verify email, session-expired, auth loading/failure/redirect states; Google button (mocked).
14. Agency: dashboard, workers list, add worker (multi-step), worker detail with 4-item checklist and document upload, list/delist, incoming requests, propose dialog, placements, billing, settings.
15. Family: dashboard, new request (multi-step), requests list, request detail with proposals, worker public profile, accept + mocked payment, placement detail with timeline and actions, payments, settings.
16. Admin: overview, agencies (approve/reject/suspend), worker flags, placements, audit log.

**Services page interaction**
17. Three alternating service sections with reveal-on-scroll (text fade + 24 px rise 600 ms; image fade + scale 0.96→1), badge stagger 80 ms, sticky anchor chips tracking the section in view; built from shared `Reveal`/`Stagger`. Only `opacity`/`transform` animate. No carousels, scroll-jacking or autoplay.

**States, forms, accessibility, SEO**
18. Every data view has skeleton, empty (with primary action) and error (with retry) states; mutations confirm with an `aria-live` toast.
19. Every form shows field-level and form-level errors, focuses the first invalid field on submit, and disables the submit button while pending.
20. Zero axe violations on every route; visible labels; keyboard operable; visible focus ring; text contrast ≥ 4.5:1; touch targets ≥ 44 px; `prefers-reduced-motion` renders final state with no motion.
21. Marketing pages have per-page metadata (`%s · HelpVerified`), sitemap, robots (disallows `/family`, `/agency`, `/admin`), generated OG image; app routes are `noindex`.
22. Layouts work at 375, 768, 1280 and 1536 px with no horizontal scroll; tables become card lists below `md`.

**Mocks**
23. MSW handlers implement the API contracts in `references/api-contracts.md`, persist mutations in an in-memory store, enforce the listing gate, one active placement and the placement state machine, return real error envelopes, add 300–800 ms latency, and support `?mock_error=<code>`.
24. Seeded mock users `family@demo.hv`, `agency@demo.hv`, `admin@demo.hv` (password `demo1234`, mock only).

**Session**
25. Access token in memory only (Zustand); never in localStorage. `RoleGuard` + `middleware.ts` redirect wrong roles; failed refresh redirects to login with `?expired=1&next=<path>`; post-login redirect to a same-origin `next` or the role home.

## Acceptance criteria

- [ ] `pnpm install && pnpm --filter web dev` runs from a clean clone; lint, typecheck, unit tests and build pass in CI. (1)
- [ ] Lint fails on a path literal in a component, a raw hex outside `tokens.css`, an image path outside the asset map, and a cross-feature deep import. (2, 3, 4, 6)
- [ ] No route file contains `fetch` or `useQuery`. (5)
- [ ] Forcing each error code via `?mock_error=` shows the mapped message, never the raw code. (7)
- [ ] Placement detail shows only the buttons listed in the mocked `allowed_actions` for each state × role. (8)
- [ ] Favicons and manifest load; logo is undistorted in header, footer and auth at all four widths. (9)
- [ ] Each optimised photo at 1600 px is ≤ 300 KB; removing one from the map shows the placeholder. (10, 11)
- [ ] Every route in `routes.ts` renders with the correct title; Playwright link crawler finds no broken links. (12–16)
- [ ] Services page: sections reveal on scroll, chips track the active section; with reduced motion enabled, content renders in final state with no transition. (17)
- [ ] Every data screen has tests for loading, empty and error states; every form has a test for field and form errors. (18, 19)
- [ ] `@axe-core/playwright` reports zero violations on every route; keyboard-only pass completes each milestone's flows. (20)
- [ ] Lighthouse mobile on Home and Services: performance ≥ 90, accessibility 100, SEO 100. (21)
- [ ] Manual pass at 375/768/1280/1536 px shows no horizontal scroll. (22)
- [ ] Agency cannot list a worker at 3/4 (button disabled with reason; mock returns `WORKER_NOT_VERIFIED` if forced). (23)
- [ ] Two accepts for the same worker: the second shows "This worker has just been placed with another family". (23)
- [ ] Playwright flow passes: family signup → request → agency proposes → accept → mock pay → trial → confirm; replacement flow passes. (14, 15, 23, 24)
- [ ] Non-admin visiting `/admin` lands on 403; expired session lands on login with `expired=1`. (16, 25)
- [ ] "Demo mode" pill visible whenever mocking is on. (Non-goals)

## Shape of the system

- **`app/`**: route groups `(marketing)`, `(auth)`, `(app)/family|agency|admin`; thin route files.
- **`config/`**: `routes.ts`, `nav.ts`, `site.ts`, `env.ts`.
- **`styles/tokens.css`**: single source of design values; `globals.css` holds reveal CSS.
- **`assets/`**: `brand/`, `images/index.ts`, `icons/`.
- **`components/`**: `ui/`, `layout/`, `navigation/`, `forms/` (`FormField`, `Stepper`, `FileDrop`), `feedback/` (`Skeleton`, `EmptyState`, `ErrorState`, `Toast`), `animation/` (`Reveal`, `Stagger`).
- **`features/<name>/`**: `components/`, `screens/`, `hooks/`, `api.ts`, `schemas.ts`, `status.ts`, `types.ts`, `index.ts`.
- **`lib/`**: `api-client.ts`, `query-client.ts`, `error-messages.ts`, `format.ts`, `cn.ts`.
- **`mocks/`**: `handlers/<feature>.ts`, `fixtures/`, `db.ts`.
- **Boundary to backend**: the contracts in `references/api-contracts.md`; types later generated into `packages/contracts`.

## Constraints

- **Stack**: fixed as above; any swap needs an ADR in `docs/decisions/`.
- **Design priority**: user clarity → accessibility → responsive → brand → performance → reference similarity. Deviations from references recorded in `docs/reference-adaptation.md`.
- **Colour use**: blue-600 for buttons/links; blue-500 only for large text and icons; yellow/amber means "verified" and nothing else.
- **Process**: plan before code, one-line reason before editing a file, checks after every step, milestone report appended to `docs/CHANGELOG.md`.
- **Sequencing**: backend work does not start until M9 sign-off.

## Milestones

| # | Milestone | Done when |
| - | --------- | --------- |
| M1 | Scaffold + design system | Monorepo runs; tokens, fonts, favicons, image pipeline, all routes as placeholders, ESLint boundaries, Vitest, Playwright, CI, `/_styleguide` with contrast ratios; axe clean; docs skeleton + CHANGELOG entry |
| M2 | Shell + navigation | Marketing header with grouped menus, mobile drawer (focus-trapped), footer; AppShell per role; RoleGuard stub; 404/403/error; keyboard-navigable at 375/768/1280 |
| M3 | Marketing pages | All marketing pages with Reveal/Stagger, metadata, sitemap, robots, OG image; Lighthouse targets met; reduced motion verified |
| M4 | Auth screens | All auth screens and states reachable and tested; MSW auth handlers; session store; Demo pill |
| M5 | Agency workspace | Listing gate and busy-worker conflict enforced in UI + mocks; mobile card tables; all states present |
| M6 | Family workspace | End-to-end Playwright flow, replacement flow, concurrent-accept message pass |
| M7 | Admin console | Admin screens with confirmation dialogs; non-admin gets 403 |
| M8 | States + a11y pass | Zero axe violations on all routes; frontend §10 checklist satisfied |
| M9 | Freeze | Cross-browser pass, bundle analysis, docs complete, owner sign-off recorded |

## Assumptions

- Project name, audience (Nigerian families and registered agencies), pages and roles are taken from the HelpVerified skill, which fills the brief's `[Insert …]` placeholders.
- Photo1 = cleaner, Photo2 = driver, Photo3 = nanny. Confirmed against `specs/frontend/brandfiles/` on 2026-10-04.
- Fonts default to Plus Jakarta Sans (display) + Inter (body) until the owner confirms.
- Deployment target for web is Vercel.

## Open questions

- Brand fonts: confirm Plus Jakarta Sans + Inter, or supply brand fonts? (owner)
- Is a white logo variant approved for navy/gradient backgrounds? (owner)
- Licences for Photo1–3: are they cleared for production, or temporary only? (owner)
- Final marketing copy and pricing figures: who supplies them, and by which milestone? (owner)
- Google sign-in: required at launch, or can the button be hidden until B2? (owner)
