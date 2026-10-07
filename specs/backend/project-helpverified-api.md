# Project: HelpVerified API (Phase 2 — Backend)

**Status:** Approved 2026-10-04

The FastAPI backend that becomes the source of truth for HelpVerified: accounts and roles, agency approval, worker verification, requests, proposals, placements, replacements, payments and notifications. It replaces the Phase 1 MSW mocks without changing frontend feature code, and enforces the platform's two promises to families in the database as well as in services.

Source brief: `Claude Code Prompt_ Brand-Led, Scalable Website Development.md` (Phase 2). Detailed conventions: `.claude/skills/helpverified/references/backend.md`, `database.md`, `api-contracts.md`, `security-and-compliance.md`.

## Goals

- Every endpoint the frontend mocks exists with the same request/response shapes and error envelopes.
- A worker can never be listed unless all four verification items are `verified` and unexpired, through any code path, job or direct SQL.
- A worker can never be in two active placements (`pending_payment`, `trial`, `confirmed`), even under concurrent accepts.
- Identity documents are visible only to the owning agency and super admins, every view is logged, and families never see them.
- Payments are confirmed only after a verified Paystack event, and duplicate webhooks have no second effect.

## Non-goals

- Worker accounts or a worker-facing API.
- Multiple users per family or per-member agency permissions beyond `agency_admin`.
- Currencies other than NGN; payment providers other than Paystack.
- Firestore as a data source (notification mirror only).
- Horizontal scaling of jobs (single API instance with a Redis lock; ARQ is a later option).

## Requirements

**Architecture**
1. `apps/api` on FastAPI, Pydantic v2, async SQLAlchemy 2.0 (`asyncpg`), Alembic, PostgreSQL 16, Redis; uv.
2. Modules (`auth`, `users`, `agencies`, `families`, `workers`, `verification`, `requests`, `proposals`, `placements`, `payments`, `notifications`, `admin`) each split into router → service → repository. No SQL in routers; no HTTP types in services.
3. Settings read only in `core/config.py`; startup fails if a required key from `.env.example` is missing outside tests.
4. Every non-2xx response uses `{ "error": { code, message, details, request_id } }` with codes from `api-contracts.md` §2; unknown exceptions return 500 `INTERNAL_ERROR` with a generic message.
5. OpenAPI at `/docs` is the contract; TypeScript types are generated into `packages/contracts`.

**Data and hard rules**
6. Schema, enums and constraints per `database.md` §1–3: UUID keys, `timestamptz`, money as `bigint` kobo, `citext` emails.
7. Listing gate: `list_worker` service check plus `workers_listing_gate` trigger raising `P0001`/`WORKER_NOT_VERIFIED` → 409. Rejecting or expiring a verified item auto-delists the worker without ending an active placement.
8. One active placement: worker row locked `FOR UPDATE` in the accept transaction, plus partial unique index `placements_one_active_per_worker`; a unique violation maps to 409 `WORKER_UNAVAILABLE`, never 500.
9. Placement transitions follow the table in `database.md` §6 only; anything else returns 409 `ILLEGAL_TRANSITION`; each transition writes one `placement_events` row in the same transaction.
10. Replacement allowed during trial or within `REPLACEMENT_WINDOW_DAYS` of confirmation; ends the placement with `replaced`, opens a linked request, increments `replacements_used`; fee waived while `replacements_used <= FREE_REPLACEMENTS`.
11. `allowed_actions` on placement responses is computed from the state machine and the caller's role.
12. Every migration has a working `downgrade()`; triggers, partial indexes and enum changes are written by hand.

**Auth and access**
13. argon2id passwords (min 8 chars, common-password check); 15 min JWT access token; rotated, hashed, httpOnly refresh cookie scoped to `/api/v1/auth`; reuse of a revoked refresh token revokes the whole chain.
14. Email verification required before a family posts a request or an agency submits onboarding. Verify tokens 24 h, reset tokens 1 h, single-use, hashed.
15. Google sign-in via backend authorisation-code flow; new Google users still choose family or agency.
16. Roles `super_admin`, `agency_admin`, `family` per the permission matrix in `backend.md` §4. Another tenant's resource returns 404. Suspended users get 403 `ACCOUNT_SUSPENDED`; unapproved or unsubscribed agencies get 403 `AGENCY_NOT_ACTIVE` on list and propose.
17. Rate limits (Redis sliding window): auth 5/min per IP+email, password reset 3/h per email, authenticated 120/min per user → 429 `RATE_LIMITED` with `Retry-After`.

**Documents and privacy**
18. NIN stored only as HMAC-SHA256 hash with `NIN_PEPPER` plus last 4 digits; duplicate NIN → 409 `DUPLICATE_WORKER`.
19. Uploads use API-signed Cloudinary signatures; documents go to `workers/docs/<worker_id>/<kind>` as `authenticated`, jpg/png/pdf ≤ 10 MB, verified via Admin API before registration.
20. `GET /documents/{id}/url` checks permission, writes `document_access_log`, returns a signed URL valid `CLOUDINARY_SIGNED_URL_TTL_SEC` (default 300 s). URLs are never stored, cached or logged.
21. Logs are structured JSON with `request_id`; tokens, NINs, document URLs, card data and full webhook payloads are never logged. Admin actions write `audit_log`.
22. Worker records store the agency's consent confirmation (checkbox + timestamp); users store the accepted privacy-notice version.

**Payments**
23. Accepting a proposal (when `FEE_CHARGED_AT=accept`) creates a `pending_payment` placement with a `PAYMENT_HOLD_MINUTES` hold and returns a Paystack authorization URL.
24. Paystack webhook: verify HMAC-SHA512 signature on the raw body (bad → 401); dedupe by `UNIQUE(provider, event_id)` (duplicate → 200, no effect); re-verify amount, currency and status with Paystack before moving `pending_payment → trial`. If the hold expired and the worker was taken, mark for refund and never create a second active placement.
25. Agency subscriptions via Paystack plan code, reconciled hourly.

**Jobs and notifications**
26. Jobs call services only: `expire_holds` (1 min), `trial_reminders` (daily 08:00 WAT, 2 days before trial end), `verification_expiry` (daily 02:00 WAT), `subscription_sync` (hourly), `notification_retry` (5 min).
27. Firestore notification writes happen after DB commit; a Firestore failure is logged and retried and never rolls back state. Transactional emails: verify email, reset password, proposal received, trial ending, placement confirmed, agency approved.

**Hardening and deploy**
28. CORS allow-list from `CORS_ORIGINS`; 1 MB body limit; parameterised SQL only; `Idempotency-Key` stored 24 h for accept, pay and confirm.
29. CI: ruff, mypy, pytest (incl. concurrency on real Postgres), Alembic up/down/up, gitleaks, pip-audit (fail on high).
30. Deploy API, Postgres and Redis on Render; seed script creates the demo dataset in `database.md` §8 with passwords from env.

## Acceptance criteria

- [ ] `/health` returns 200 and `/docs` loads from a clean clone using README steps. (1, 5)
- [ ] An architecture test or review confirms no router imports a repository or SQLAlchemy, and no service imports FastAPI. (2)
- [ ] Removing a required env var stops startup with a named error. (3)
- [ ] Parametrised tests: every error path returns the envelope with a `request_id`; an unhandled exception returns generic 500. (4)
- [ ] CI regenerates `packages/contracts` and fails on diff. (5)
- [ ] CI runs `alembic upgrade head → downgrade base → upgrade head` successfully. (6, 12)
- [ ] `test_cannot_list_with_pending_item` passes, including the direct-SQL path. (7)
- [ ] `test_rejecting_item_delists_worker` passes; the active placement is unchanged and the agency is notified. (7)
- [ ] `test_concurrent_accepts_create_one_placement` passes: one placement, the other request gets 409 `WORKER_UNAVAILABLE`, no 500. (8)
- [ ] `test_illegal_transition_rejected` passes for every disallowed pair; each allowed transition writes one event row. (9)
- [ ] `test_replacement_ends_and_reopens` passes; replacement after the window returns 409 `REPLACEMENT_WINDOW_CLOSED`. (10)
- [ ] `allowed_actions` matches a table-driven expectation for every state × role. (11)
- [ ] For every router: no token → 401, wrong role → 403, other tenant → 404. (16)
- [ ] Refresh-token reuse revokes the chain; reset and verify tokens fail on second use with 410 `TOKEN_EXPIRED`. (13, 14)
- [ ] Unverified email cannot create a request or submit onboarding (403 `EMAIL_NOT_VERIFIED`). (14)
- [ ] Exceeding each rate limit returns 429 with `Retry-After`. (17)
- [ ] Duplicate NIN returns 409; no column contains a raw NIN. (18)
- [ ] Registering a public_id outside the expected folder, over 10 MB or in a wrong format is rejected. (19)
- [ ] Family requesting a document URL gets 404; owning agency gets a URL and one access-log row. (20)
- [ ] Log capture during the test suite contains no token, NIN or Cloudinary signed URL. (21)
- [ ] Creating a worker without the consent flag fails validation. (22)
- [ ] Webhook tests: bad signature → 401; duplicate → 200 with no second effect; amount mismatch → no state change; expired hold + taken worker → payment marked for refund. (24)
- [ ] Expired hold job cancels the placement and reopens the request (frozen clock). (23, 26)
- [ ] Verification-expiry job delists the worker (frozen clock). (26)
- [ ] Forced Firestore failure leaves the DB transaction committed and queues a retry. (27)
- [ ] gitleaks and pip-audit pass in CI. (29)
- [ ] Production smoke test passes: signup → request → propose → accept → pay (test mode) → confirm. (30)
- [ ] All Playwright flows pass against the real API with MSW removed; Demo pill gone. (Goals)

## Shape of the system

- **`app/main.py`**: app factory; middleware (request ID, CORS, body limit), routers, exception handlers.
- **`app/core/`**: `config`, `security` (argon2, JWT, NIN HMAC), `deps` (`get_db`, `get_current_user`, `require_role`), `errors` (`DomainError` hierarchy), `logging`, `rate_limit`.
- **`app/modules/<name>/`**: `router.py`, `schemas.py`, `service.py`, `repository.py`, `models.py`, plus `state_machine.py` (placements) and `policies.py` where needed.
- **`app/db/`**: session, base, `migrations/`, readable SQL copies in `sql/`.
- **`app/integrations/`**: `cloudinary`, `paystack`, `firestore`, `email`, each behind a protocol so tests use fakes.
- **`app/jobs/`**: APScheduler with a Redis lock.
- **PostgreSQL**: source of truth and backstop for both hard rules. **Redis**: rate limits, idempotency keys, job lock, short cache. **Firestore**: per-user notification feed.
- **Boundary to frontend**: `/api/v1` contracts in `api-contracts.md`; `state_machine.py` must stay identical to `apps/web/src/features/placements/state-machine.ts` (transitions and `allowed_actions`; labels live in `status.ts`).

## Constraints

- **Sequencing**: no backend work until frontend M9 sign-off.
- **Compliance**: Nigeria Data Protection Act 2023 obligations in `security-and-compliance.md` §2; DPIA (`docs/dpia.md`) and incident runbook (`docs/incident.md`) before production. Section numbers must be checked against the official Act before quoting.
- **Payments**: Paystack test keys in all non-production environments; card data never touches our servers.
- **Data integrity**: money in kobo, timestamps UTC, no float currency anywhere.
- **Process**: tests written first for the hard rules; milestone report appended to `docs/CHANGELOG.md`; stack changes need an ADR.

## Milestones

| # | Milestone | Done when |
| - | --------- | --------- |
| B1 | Scaffold | App factory, config, logging, error envelope, `/health`, compose, Alembic baseline, CI; migration up/down/up green |
| B2 | Auth | Signup/login/refresh/logout/verify/reset/Google, `require_role`, rate limits; 401/403/404 matrix and token tests pass |
| B3 | Agencies, workers, verification | Onboarding + approval, NIN hashing, items, Cloudinary signing/registration, document URLs + access log, listing trigger; must-have tests 3 and 4 pass |
| B4 | Requests, proposals, placements | Accept with locks, partial unique indexes, state machine, events, replacement, end; must-have tests 1, 2, 5 pass; `allowed_actions` correct |
| B5 | Payments | Paystack init/verify, webhook, holds, subscriptions, agency gating; webhook and hold tests pass |
| B6 | Notifications + jobs | Firestore feed, emails, all jobs, cache; frozen-clock job tests pass; Firestore failure isolated |
| B7 | Integration | Contracts generated; MSW removed feature by feature; all Playwright flows pass on real API |
| B8 | Hardening + deploy | Headers, CORS, limits, gitleaks/pip-audit, seed, Render + Vercel; production smoke test passes |

## Assumptions

- Business defaults from the skill apply until the owner overrides them: trial 14 days (7–30), replacement window 30 days after confirmation, 1 free replacement, fee charged at accept, 30-minute payment hold, references/address valid 12 months. All live in config.
- One user account per family and one `agency_admin` role per agency member in v1.
- Email provider is chosen at B6; the integration is behind an interface so the choice does not affect services.
- Hosting is Render for API/Postgres/Redis and Vercel for web.

## Open questions

- Placement fee charged at accept (uses `pending_payment` hold) or at confirmation? Changes the state machine and B4/B5 tests. (owner)
- Confirm trial length, replacement window and number of free replacements. (owner)
- Placement fee amount and agency subscription price, in naira. (owner)
- Paystack test or live mode for the capstone demo; to be recorded in an ADR. (owner)
- Which transactional email provider? (owner, by B6)
- Document retention periods (24 months inactive, 90 days rejected, 6 years for ended placements): accept as defaults? (owner)
