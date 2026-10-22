# Testing and milestones reference

Contents: 1. Test strategy · 2. Must-have tests · 3. QA checklist per milestone · 4. Frontend milestones M1–M9 · 5. Backend milestones B1–B8 · 6. CI pipeline

## 1. Test strategy

| Level | Web | API |
| --- | --- | --- |
| Unit | Vitest + Testing Library: components, hooks, status maps, schemas | pytest: services with fake repositories/integrations, state machine, policies |
| Integration | MSW-backed screen tests (render screen, act, assert) | pytest + httpx `AsyncClient` against a real Postgres (testcontainers or compose), transaction rollback per test |
| Concurrency | — | `tests/concurrency/`: real Postgres, two sessions via `asyncio.gather` |
| E2E | Playwright: critical flows on Chromium + WebKit mobile viewport, axe on every page | — |
| Contract | `tsc` against generated `packages/contracts` | OpenAPI schema snapshot test |

Factories (`factory_boy` / plain builders) create valid objects; tests state only what matters to them. No test depends on another's data.

## 2. Must-have tests

Write these **first** for the hard rules; they must fail before the implementation exists.

1. `test_concurrent_accepts_create_one_placement` — two families accept proposals for the same worker simultaneously → exactly one `pending_payment` placement, the other gets `WORKER_UNAVAILABLE` (409), no 500.
2. `test_illegal_transition_rejected` — `ended → trial`, `cancelled → trial`, `confirmed → trial` → `ILLEGAL_TRANSITION`; table-driven over all disallowed pairs.
3. `test_cannot_list_with_pending_item` — 3/4 verified → `WORKER_NOT_VERIFIED`; also via direct SQL update → trigger raises.
4. `test_rejecting_item_delists_worker` — listed worker, reject guarantor → `listing_status='delisted'`; active placement unaffected; agency notified.
5. `test_replacement_ends_and_reopens` — trial placement, request replacement → placement `ended/replaced`, new linked request `open`, worker available again, `replacements_used=1`.

Also required:

- Auth: 401 without token, 403 wrong role, 404 other tenant — for every router (parametrised).
- Expired item via job delists worker (frozen clock).
- Payment hold expiry cancels placement and reopens request.
- Webhook: bad signature → 401; duplicate event → 200, no second effect; amount mismatch → no state change.
- Document URL: family → 404; agency owner → URL + access log row.
- Web: ListWorkerButton disabled with reason until 4/4; accept flow shows WORKER_UNAVAILABLE message; every form shows field errors; RoleGuard redirects.

## 3. QA checklist (run at the end of every milestone)

- [ ] App starts from clean clone using README steps
- [ ] `lint`, `typecheck`, unit, integration, e2e all green
- [ ] Production build succeeds (`bun run build`, API docker image builds)
- [ ] Manual pass at 375, 768, 1280, 1536 px
- [ ] Keyboard-only pass of the milestone's flows
- [ ] axe: zero violations
- [ ] No broken links (Playwright link crawler on public routes) or missing images
- [ ] No hex values, route strings or image paths outside their homes (lint)
- [ ] No secrets in diff (gitleaks)
- [ ] Duplicated code reviewed; anything copied twice extracted
- [ ] Docs + CHANGELOG updated; milestone report written

## 4. Frontend milestones

| # | Scope | Acceptance criteria |
| --- | --- | --- |
| M1 Scaffold + design system | Monorepo, Next.js, Tailwind tokens, fonts, favicons, image pipeline, routes.ts with all routes as placeholders, ESLint boundaries, Vitest, Playwright, CI, docs skeleton, `/styleguide` | `bun install && bun run dev` works; lint/typecheck/test/build pass in CI; tokens.css holds every design value and lint fails on raw hex elsewhere; every route renders a placeholder with correct title; favicons and manifest load; Photo1–3 optimised ≤ 300 KB at 1600 px and served via asset map; styleguide shows colours with contrast ratios, type scale, all button/input/badge states; axe clean on styleguide; `.env.example`, README, docs files exist; CHANGELOG has M1 entry |
| M2 Shell + navigation | Marketing header with grouped menus, mobile drawer, footer; AppShell with sidebar/rail/bottom tabs per role; RoleGuard stub; 404/403/error pages | Keyboard navigation through all menus; drawer traps focus; correct nav per role at 375/768/1280 |
| M3 Marketing pages | Home, Services (+ Reveal/Stagger), service detail ×3, How it works, For agencies, Pricing, About, Contact (mocked submit), Privacy, Terms; metadata, sitemap, robots, OG image | Lighthouse mobile ≥ 90 performance, 100 accessibility, 100 SEO on Home and Services; reduced-motion verified; copy from `content/` with `TODO(content)` markers listed |
| M4 Auth screens | Login, signup + role picker, agency onboarding, forgot, reset, verify email, session expired, Google button; MSW auth handlers; session store; redirects | Every state in design-system §8 / frontend §7 reachable and covered by tests; "Demo mode" pill visible |
| M5 Agency workspace | Dashboard, workers table, add worker (multi-step), worker detail + checklist + uploads (mocked), list/delist, incoming requests, propose dialog, placements, billing view | Cannot list until 4/4 (UI + mock); proposing busy worker shows conflict; tables become cards on mobile; empty/error states everywhere |
| M6 Family workspace | Dashboard, new request (multi-step), requests list, request detail with proposals, worker public profile, accept + mocked payment, placement detail with timeline and actions, payments, settings | Playwright: signup → request → agency proposes → accept → pay (mock) → trial → confirm; replacement flow; concurrent-accept error message |
| M7 Admin console | Overview, agencies list/approve/suspend, worker flags, placements, audit log | Non-admin gets 403 page; actions show confirmation dialogs |
| M8 States + a11y pass | Audit every data view and form; skeletons; focus management; contrast check of semantic colours | Zero axe violations on all routes; checklist in frontend §10 satisfied |
| M9 Freeze | Cross-browser, bundle analysis, docs | Owner sign-off recorded before B1 |

## 5. Backend milestones

| # | Scope | Acceptance criteria |
| --- | --- | --- |
| B1 Scaffold | FastAPI app factory, config, structlog, error envelope, health, compose, Alembic baseline, CI (ruff, mypy, pytest) | `/health` 200; `/docs` loads; migration up/down/up in CI; empty test passes |
| B2 Auth | Users, tokens, signup/login/refresh/logout, verify, reset, Google, `require_role`, rate limits | 401/403/404 matrix tests pass; refresh reuse revokes family; reset tokens single-use |
| B3 Agencies, workers, verification | Agency onboarding + approval, workers, NIN hashing, verification items, Cloudinary signing + registration, document URLs + access log, list/delist, listing trigger | Must-have tests 3 and 4 pass; duplicate NIN → 409; family cannot get a document URL |
| B4 Requests, proposals, placements | Requests, proposals, accept with locks, partial unique indexes, state machine, events, replacement, end | Must-have tests 1, 2, 5 pass; `allowed_actions` correct per role/state |
| B5 Payments | Paystack init/verify, webhook, holds, subscriptions, agency activity gating | Webhook tests pass; expired hold cancels and reopens request |
| B6 Notifications + jobs | Firestore feed, emails, all jobs, cache | Jobs tested with frozen clock; Firestore failure does not roll back state |
| B7 Integration | Generate contracts, remove MSW per feature, real auth | All Playwright flows pass against real API; Demo pill gone |
| B8 Hardening + deploy | Headers, CORS, limits, gitleaks/pip-audit, seed, Render + Vercel, docs | Production smoke test (signup → request → propose → accept → pay in test mode → confirm) passes |

## 6. CI pipeline (GitHub Actions)

```
on: [push, pull_request]
jobs:
  web:  bun install --frozen-lockfile → lint → typecheck → test → build → playwright (with MSW) + axe
  api:  uv sync → ruff → mypy → services: postgres:16, redis:7 → alembic up/down/up → pytest (incl. concurrency)
  security: gitleaks, bun audit --audit-level=high, pip-audit
  contracts: (from B7) regenerate types from API and fail on diff
```

Branches: `main` protected; feature branches `feat/<milestone>-<short>`; Conventional Commits (`feat(placements): enforce one active placement`). PRs reference the milestone and include the report section.
