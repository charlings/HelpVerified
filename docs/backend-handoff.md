# Backend handoff (end of Phase 1)

Everything a backend developer needs to start B1 against the finished frontend. The frontend runs entirely on a mock API in the browser (`apps/web/src/mocks/`) that enforces the real rules and returns the real error envelopes. The backend's job is to make that mock unnecessary without the screens noticing.

Read first: `specs/backend/project-helpverified-api.md` (the spec), then the skill references `backend.md`, `database.md`, `api-contracts.md`, `security-and-compliance.md`.

## 1. The contract

- **Source of truth:** `.claude/skills/helpverified/references/api-contracts.md`. It's frozen from the frontend sign-off (ADR 0009): changing a shape, path, error code or `allowed_actions` value needs an ADR.
- **Every endpoint the frontend calls is listed there**, including those added during Phase 1 (section "Added during Phase 1"). The mock implements each one: `apps/web/src/mocks/handlers/*.ts`, one file per area.
- **Error envelope:** `{ "error": { code, message, details: { fields? }, request_id } }`. The code → HTTP status table is `apps/web/src/mocks/errors.ts`; every code has a user message in `apps/web/src/lib/error-messages.ts` (tested).
- **`allowed_actions`** for placements and agencies are computed by the server. The frontend's copy of the placement rules is `apps/web/src/features/placements/state-machine.ts`; `modules/placements/state_machine.py` must match it exactly.

## 2. Rules the mock enforces that the API must

Each has unit tests against the mock (`apps/web/src/mocks/handlers/*.test.ts`) that describe the expected behaviour; use them as a checklist for the backend's own tests.

| Rule | Mock | Error |
| --- | --- | --- |
| A worker can be listed only with 4/4 checks verified and unexpired; any check leaving `verified` delists | `domain.ts` (`delistIfListed`, `applyExpiry`), `workers.ts` | `WORKER_NOT_VERIFIED` |
| One active placement per worker (`pending_payment`, `trial`, `confirmed`); concurrent accepts lose with a conflict | `family-requests.ts` accept | `WORKER_UNAVAILABLE` |
| Accept checks in order: owned (404) → request open → proposal pending → worker listed → worker available; then hold 30 min, supersede other proposals, request matched | `family-requests.ts` | `REQUEST_NOT_OPEN`, `ILLEGAL_TRANSITION`, `WORKER_NOT_LISTED`, `WORKER_UNAVAILABLE` |
| Payment: idempotent webhook, re-check before granting value, refund if the hold expired | `payments.ts` | — |
| Replacement: during trial or ≤ 30 days after confirming; linked new request; free allowance per placement fee | `family-placements.ts` | `REPLACEMENT_WINDOW_CLOSED` |
| Agencies must be approved with an active subscription to list or propose | `domain.ts` `isAgencyActive` | `AGENCY_NOT_ACTIVE` |
| Another tenant's resource is 404, never 403 | every handler | `NOT_FOUND` |
| Families never get document URLs; every document view is logged and audited | `documents.ts` | `NOT_FOUND` |
| Admin moves, suspension effects, flags, audit entries (ADR 0006) | `admin-domain.ts`, `admin.ts` | `FORBIDDEN`, `ILLEGAL_TRANSITION` |
| Sign-in: generic credentials error, rate limit, single-use tokens, suspended accounts | `auth.ts` | `INVALID_CREDENTIALS`, `RATE_LIMITED`, `TOKEN_EXPIRED`, `ACCOUNT_SUSPENDED` |
| Idempotency-Key on accept and confirm (replays return the stored response) | `family-requests.ts`, `family-placements.ts` | — |

## 3. Schema changes introduced by the frontend

Beyond `database.md` §3 (add these in the B3/B4 migrations; ADRs 0005 and 0006):

| Table | Change | Why |
| --- | --- | --- |
| `agencies` | `status_reason text NULL` | Reason shown to a rejected or suspended agency |
| `verification_items` | `flag_reason text NULL`, `flagged_at timestamptz NULL` | Admin flag on a verified check; cleared on re-verify |
| `placement_end_reason` enum | add `admin_ended` | An admin ending a placement isn't "agency ended". `ALTER TYPE … ADD VALUE` outside a transaction |
| `audit_log.action` | values `agency.approved/rejected/suspended/reinstated`, `worker.check_flagged`, `document.viewed`, `placement.ended` | Shown in the admin audit log |

## 4. Seed data

The demo seed (`apps/web/src/mocks/seed.ts`) is the reference for the backend seed script: the accounts in the README, two approved agencies, one pending, one suspended, workers in every verification and listing state, and one placement in each status. Seed passwords come from env in the backend, never from code.

## 5. Order of work (from the backend spec)

| # | Milestone | Frontend dependency |
| --- | --- | --- |
| B1 | Scaffold | none |
| B2 | Auth | auth screens and `mocks/handlers/auth.ts` define the flows |
| B3 | Agencies, workers, verification | agency workspace, admin flags, document viewer |
| B4 | Requests, proposals, placements | family workspace; the concurrency tests replace the mock's forced-error demonstrations |
| B5 | Payments | demo checkout is replaced by Paystack's hosted page; the callback page stays |
| B6 | Notifications + jobs | none yet (no notification UI in Phase 1) |
| B7 | Integration | generate `packages/contracts`, remove MSW feature by feature; every Playwright flow must pass against the real API; the Demo pill disappears |
| B8 | Hardening + deploy | — |

## 6. What isn't built on the frontend yet

Notifications UI (B6), real Paystack and subscription changes (B5), Google sign-in (mocked button), editing agency or family details (read-only settings), suspending individual users, data export/deletion tools (security reference). Each has a clear "not available yet" message in the UI where it would appear.
