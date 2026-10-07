# Plan: M5 — Agency workspace

**Spec:** `specs/frontend/project-helpverified-web.md` (requirements 8, 14, 18–20, 22–23; milestone M5)
**Status:** Approved 2026-10-05 · Implemented 2026-10-05 (Stage A and Stage B; see `docs/CHANGELOG.md`)

## Objective

An agency admin can run their whole side of HelpVerified against the mock API: see a dashboard, add workers, carry out the four checks with evidence, list a worker only when all four are verified, find open family requests, propose an available listed worker, follow placements, and see their billing status. The two promises to families are enforced in the UI **and** the mock: no listing below 4/4 verified, and no proposing a worker who is already in an active placement.

Out of scope: the family side of requests, accepting and paying (M6); admin approval and flags (M7); real uploads, payments and subscriptions (Phase 2).

## Delivery in two stages

M5 is the largest milestone so far, so it ships as two reviewable commits:

- **Stage A — Workers and verification:** data layer, shared data-view components, dashboard, workers list, add worker, worker detail with the four-check checklist, document upload, list/delist.
- **Stage B — Requests, placements, billing:** incoming requests, request detail, propose dialog, proposals, placements list and detail with timeline, billing view, settings view.

Each stage ends with lint, typecheck, unit, build and e2e green.

## Decisions needing approval

1. **TanStack Query for server data** (already in the stack): add `@tanstack/react-query`, one `QueryClient` per workspace session, query keys from a factory per feature, mutations invalidating exact keys. Toasts are a small in-house component (`aria-live="polite"`), no extra dependency.
2. **Who marks a check verified:** the agency admin, after attaching at least one document (`PATCH /workers/{id}/verification/{kind}`; no evidence → `EVIDENCE_REQUIRED`). Rejecting needs a reason. Super-admin flags come in M7. This matches the API contract.
3. **No raw NIN, even in the mock.** The add-worker form takes the 11-digit NIN, and the mock stores only a SHA-256 hash (browser crypto) plus the last 4 digits, and detects duplicates by hash (`DUPLICATE_WORKER`). The real API uses an HMAC with a secret pepper.
4. **Documents never leave the browser in demo mode.** The upload flow mirrors the real one (`POST /uploads/signature` → upload to the Cloudinary URL → register the `public_id`), but MSW intercepts the Cloudinary call, so files stay in the page's memory. Viewing works for the rest of the session; after a reload, metadata remains and viewing shows "demo document no longer available". The upload area shows "Demo mode: don't upload real identity documents". Each view writes a mock access-log entry, as the real API will.
5. **Worker consent is required to add a worker:** a checkbox confirming the worker agreed to their information being collected and shared with families (NDPA, `security-and-compliance.md` §2), stored with a timestamp.
6. **Check expiry is evaluated on read in the mock.** References and address expire after 12 months; when an item is past `expires_at` the mock reports it `expired` and delists the worker, standing in for the nightly job. Delisting never ends an active placement.
7. **Agency activity gate:** listing and proposing need an approved agency with an active subscription (`AGENCY_NOT_ACTIVE`). The seeded agency is approved and subscribed. `newagency@demo.hv` (pending after onboarding) can add workers and do checks, and sees a banner explaining why listing is disabled.
8. **Billing and settings are read-only in M5:** subscription status, period end and payment history; agency profile and account details. Starting or changing a subscription needs Paystack (B5), so the button explains that in demo mode. Editing the agency profile is left out of M5.
9. **Duplicate proposals:** proposing the same worker twice for one request returns a new `409 ALREADY_PROPOSED` (the database has `UNIQUE (request_id, worker_id)`). I'll add it to the API contract.
10. **Seed data with fictional people and no photos of them.** About 10 workers across all verification states, open requests from several families, and a placement in each state. Workers show initials avatars, not stock photos presented as real workers.

## Screens

| Route | Content | Key states |
| --- | --- | --- |
| `/agency` | Activity banner (if pending/unsubscribed); counts by worker status; open requests that match; trials ending soon; quick actions | Skeleton · empty (no workers yet → "Add your first worker") · error + retry |
| `/agency/workers` | Filter by role and listing status; table (name, role, checks n/4, listing status, availability) → cards below md; pagination | Skeleton · empty · empty-for-filter · error |
| `/agency/workers/new` | Stepper: details (name, role, experience, languages, live-in, area, expected salary range) → identity (NIN, consent) → review | Field and form errors · `DUPLICATE_WORKER` on the identity step |
| `/agency/workers/[id]` | Profile; checklist with progress n/4; per check: status badge, details form (guarantor, referees, address), documents (upload, view, remove), verify/reject; **List worker** (disabled with the reason until 4/4) / **Delist**; availability | Not found · each check state (not started, submitted, verified, rejected with reason, expired) · upload progress and errors (type, size) · `EVIDENCE_REQUIRED` · `WORKER_NOT_VERIFIED` · `AGENCY_NOT_ACTIVE` |
| `/agency/requests` | Open requests matching the agency's roles and states: role, area, schedule, live-in, start date, budget | Skeleton · empty · error |
| `/agency/requests/[id]` | Request details; this agency's proposals for it (with withdraw); **Propose a worker** dialog listing listed + available workers of the right role, with busy ones greyed out ("In a placement until …") | `WORKER_UNAVAILABLE` (refreshes the list) · `WORKER_NOT_LISTED` · `REQUEST_NOT_OPEN` · `ALREADY_PROPOSED` · `AGENCY_NOT_ACTIVE` |
| `/agency/placements` | Placements by status (filter), worker, family, trial dates | Skeleton · empty · error |
| `/agency/placements/[id]` | Status badge, trial countdown, timeline of every event, actions from `allowed_actions` (agency: End, with a reason) | Not found · `ILLEGAL_TRANSITION` |
| `/agency/billing` | Subscription status, plan, current period end, payment history | Skeleton · no subscription · error |
| `/agency/settings` | Agency profile and approval status; account details | Skeleton · error |

## Steps

### Stage A
1. **Data foundations.** Add `@tanstack/react-query`; `lib/query-client.ts`; a `QueryProvider` in the workspace layouts. Shared feedback components in `components/feedback/`: `Skeleton`, `EmptyState`, `ErrorState` (message from `lib/error-messages`, Retry), `Toast` + `useToast`. `components/data/`: `DataTable` (caption, scoped headers, row → card list below md), `Pagination`, `FilterBar`. `components/ui/Dialog.tsx` (Radix), `components/forms/FileDrop.tsx` (jpg/png/pdf ≤ 10 MB, keyboard-operable, progress, errors).
2. **Domain maps.** `features/workers/status.ts` (listing status → label and tone), `features/verification/status.ts` (check status → label, tone, description), `features/placements/status.ts` + a TypeScript mirror of the placement state machine for labels only (actions still come from the API).
3. **Mock domain.** Extend `mocks/db.ts` with workers, verification items, documents, access log, requests, proposals, placements, placement events, subscriptions and payments, plus the seed in decision 10. Handlers: `workers.ts`, `verification.ts`, `uploads.ts` (signature + Cloudinary intercept), `documents.ts`, `agency-dashboard.ts`. Rules enforced: tenant isolation (another agency's worker → 404), listing gate, evidence required, expiry on read, auto-delist on reject/expire, agency activity gate, duplicate NIN.
4. **Screens:** dashboard, workers list, add worker, worker detail (checklist, documents, list/delist). Content in `content/agency.ts`.
5. **Tests:** unit tests for the status maps, `DataTable` (cards on mobile), `FileDrop` (type, size, keyboard), mock rules (listing gate at 3/4, evidence required, reject delists without ending a placement, tenant 404, duplicate NIN); screen tests for every state in the table. E2E: add a worker → complete four checks with uploads → list; **List disabled at 3/4 with the reason**; a forced `WORKER_NOT_VERIFIED` shows its message; mobile cards at 375 px; axe on every screen and state.
6. **Commit Stage A.**

### Stage B
7. **Mock domain:** `requests.ts` (agency view: open, matching roles and states), `proposals.ts` (create with the one-active-placement check, withdraw, `ALREADY_PROPOSED`), `placements.ts` (list, detail with `events` and `allowed_actions` computed from the state machine, end with reason), `billing.ts`.
8. **Screens:** requests list, request detail + propose dialog, placements list and detail with timeline, billing, settings.
9. **Tests:** unit tests for `allowed_actions` per state for the agency role; the propose dialog greys out busy workers; `WORKER_UNAVAILABLE` refreshes and explains. E2E: **proposing a busy worker shows the conflict** (two tabs: propose the same worker to two requests where one already became a placement); withdraw; end a placement with a reason → timeline updates; axe on every screen.
10. **Docs and report:** architecture (data layer, domain maps, mock domain), API contract (`ALREADY_PROPOSED`), placeholders (uploads, billing), CHANGELOG M5, CLAUDE.md. **Commit Stage B.**

## M5 acceptance criteria (from the testing reference)

- [ ] Dashboard, workers table, add worker (multi-step), worker detail + checklist + uploads (mocked), list/delist, incoming requests, propose dialog, placements, billing view
- [ ] Cannot list until 4/4, in the UI **and** the mock
- [ ] Proposing a busy worker shows the conflict
- [ ] Tables become cards on mobile
- [ ] Empty and error states everywhere
- [ ] lint, typecheck, unit tests, build, Chromium e2e + axe all pass

## Risks

- **Mock complexity:** the mock now carries real business rules. Each rule gets a unit test against the handler so the UI isn't built against a wrong mock, and the rules mirror `database.md` so B3/B4 can reuse the same test cases.
- **Test run time:** about 30 more e2e tests. Runs use 2 workers; if the suite passes 10 minutes locally, I'll tag the slowest axe-per-state tests to run in CI only, and say so.
- **Session storage size:** uploaded files are kept in memory, not `sessionStorage`, so the persisted mock database stays small.
