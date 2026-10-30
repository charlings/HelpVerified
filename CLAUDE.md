# CLAUDE.md — HelpVerified

HelpVerified lets families hire nannies, drivers and cleaners whose **ID, guarantor, references and address** have been checked by a registered agency. Agencies list workers only after all four checks pass; families post requests, agencies propose workers, and placements run **Trial → Confirmed → Ended**, with replacement requests. Agencies pay monthly; families pay a placement fee.

This file is loaded every session. Keep it short. Detailed conventions live in the project skill at `.claude/skills/helpverified/` — read the relevant `references/*.md` before working in that area.

## The two rules you must never break

1. **A worker cannot be listed unless all four verification items are `verified` and unexpired.**
2. **A worker cannot have more than one active placement** (`pending_payment`, `trial` or `confirmed`).

Both are enforced in PostgreSQL (trigger + partial unique index) **and** in one service each (`modules/verification/service.py`, `modules/placements/service.py`). The UI only reflects them. If a change could bypass either rule through a race, raw SQL, a job, or a new code path, stop and flag it.

## Current phase

<!-- Update this block at the start and end of every milestone. -->
- **Next milestone:** **B7 — Integration. Not started.** It waits for the owner's approval of a B7 plan and for the prerequisites below. Before that: the review and completion of ADR 0017's implementation (owner, 2026-10-25).
- **Frontend (Phase 1), M1–M9:** complete and signed off 2026-10-06 (`docs/frontend-signoff.md`; Lighthouse performance still to be confirmed by the CI job). API contract frozen (ADR 0009).
- **Backend (Phase 2), B1–B5:** complete and signed off 2026-10-07: B1 (ADR 0010), B2 (ADR 0011), B3 (rule 1, ADR 0012), B4 (rule 2, ADR 0013), B5 (Paystack test mode, ADR 0014). Backend follows `docs/backend-handoff.md`.
- **Backend B6 — Notifications + jobs:** code complete and committed 2026-10-11 (ADR 0015); **not yet signed off**. Its email criterion is "partly met" until owner input #3, a real app email end to end, which the owner deferred to B7. Brevo SMTP connectivity passed 2026-10-13; tests are pinned to the outbox. Idle-worker retention 12 months; production jobs run as Render Cron Jobs with `JOBS_ENABLED=false` on the web service (owner, 2026-10-13). Firestore mirror off (`NOTIFICATIONS_MIRROR=none`; owner, 2026-10-19).
- **Google sign-in:** complete and signed off 2026-10-13 (ADR 0016; the credentials check passed). The real browser sign-in has **not** been run; it's checked at B7 (owner input #6b).
- **Pre-B7 stage** (contact form, demo seed, placement per proposal, failed-checkout recovery): committed 2026-10-15 (`4f1b00b`). Not signed off.
- **ADR 0017 (checkout attempts, tracked refunds, admin alerts):** **Proposed, not accepted.** Implemented 2026-10-19 in `9169985` (API, migration 0008) and `a6f1a3a` (web, mocks, contracts). Tested locally on disposable databases only; not signed off. On 2026-10-25 the owner authorised **retaining** the implementation and continuing its review and completion (from that date; the earlier record is left as written). Built isn't approved: the policy values in the code (attempt cap 3, settlement-time rule, refund policy, `TODO(content)` wording, legacy mapping, resubmission gate) wait for #7d. X1–X3 (`refund_pending`, `CHECKOUT_ATTEMPTS_EXHAUSTED`, `CHECKOUT_IN_PROGRESS`) are implemented but await ratification (#7e) and an ADR 0009 amendment. Paystack behaviour is unverified in live mode (#13a). The ADR's "Implementation status" section is the source of truth.
- **ADR 0018 (Bun replaces pnpm):** committed 2026-10-22 (`8e4cc97`).
- **Push status:** `feature/backend` pushed to `aa9ae44` on 2026-10-30 (owner's authorisation); `origin` matches local commits. Uncommitted work is not pushed. Don't push again without the owner's authorisation.
- **CI (#7): red** on `aa9ae44` (run 41072395963, 2026-10-30). `api`, `contracts` and `a11y-audit` pass. `web` fails lint (unused `eslint-disable` in `src/app/opengraph-image.tsx:29`); `lighthouse` fails `next build` in `next/font` (`src/app/fonts.ts`, Google font loader TypeError); `security` fails `bun audit --audit-level=high` (10 advisories, 1 critical, incl. `next@15.5.27`). Fixed in `60db69c` (see CHANGELOG). Its run (41087480525, run twice) passes those three, then fails a unit-test focus race (fixed next) and Lighthouse Home performance (88, 87 < 90: Total Blocking Time ~500 ms from framework JS). Home's score needs an owner decision (#7).
- **E2E locally:** the last Playwright run (2026-10-20) failed because `apps/web/.env.local` sets `NEXT_PUBLIC_API_MOCKING=disabled`, which the e2e build picks up. CI is unaffected (no `.env.local`; the default is `enabled`).
- **B7 prerequisites:** the owner's review of ADR 0017's implementation and its acceptance; #7d and #7e decided; #7 (CI green on GitHub; first run 2026-10-30 was **red**, see above); #7b and #7c decided; the owner's go-ahead on a B7 plan. #3 and #6b are run during B7.
- **Owner inputs:** `docs/owner-inputs.md` lists every key, account, price and decision the build waits on. Update it at the end of each milestone and report it in the milestone summary (owner's request).
- **Jobs:** run inside the API (APScheduler + a Redis lock, `app/jobs/`). Run one by hand with `cd apps/api && uv run python -m app.jobs run <name>`. Jobs call services, never repositories.
- **Git:** remote `origin` = https://github.com/charlings/HelpVerified. `main` holds the signed-off frontend. Backend milestones go on `feature/backend`: commit each milestone after the owner signs it off, push the branch, and merge into `main` only when the owner asks.
- **Local services:** no Docker or admin rights on the owner's machine. PostgreSQL 16 runs from `%LOCALAPPDATA%\pgsql16` (`apps/api/scripts/pg-portable.ps1 start`) and Redis 7.4 from `%LOCALAPPDATA%\redis7` (`apps/api/scripts/redis-portable.ps1 start`); start both after each reboot. Tests use `127.0.0.1`, not `localhost` (Windows IPv6 fallback costs ~2 s per connection).
- **Data:** frontend uses MSW mocks (`NEXT_PUBLIC_API_MOCKING=enabled`) until B7. Never imply auth or payments are real while mocks are on.

## Stack

- `apps/web` — Next.js 15 (App Router), TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, MSW, Motion. Package manager: **Bun**.
- `apps/api` — FastAPI, Pydantic v2, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 16, Redis, Cloudinary, Paystack; Firestore is an optional notification mirror, off for now (`NOTIFICATIONS_MIRROR=none`). Package manager: **uv**.
- `packages/contracts` — TypeScript types generated from the API's OpenAPI schema. Never edit by hand.

## Commands

```bash
# Setup
bun install
docker compose up -d postgres redis
cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.scripts.seed

# Run
bun --filter web dev                      # http://localhost:3000
cd apps/api && uv run fastapi dev app/main.py   # http://localhost:8000/docs

# Check (run after every meaningful change to the app you touched)
bun --filter web lint && bun --filter web typecheck && bun --filter web test
bun --filter web test:e2e                 # Playwright + axe
bun --filter web build
cd apps/api && uv run ruff check . && uv run mypy app && uv run pytest -q
cd apps/api && uv run pytest tests/concurrency -q   # needs Postgres running

# Utilities
bun --filter web images                   # optimise src/assets/images → public/images
bun run contracts:generate                # regenerate API types (API must be running)
cd apps/api && uv run alembic revision --autogenerate -m "<message>"
```

Run a single test: `cd apps/web && bunx vitest run path/to/file.test.tsx` or `uv run pytest tests/path/test_x.py::test_name -q`.

## Where things live

| Need | Location |
| --- | --- |
| Every route path | `apps/web/src/config/routes.ts` |
| Navigation menus | `apps/web/src/config/nav.ts` |
| Colours, fonts, spacing, radii, shadows, motion | `apps/web/src/styles/tokens.css` (only place hex values may appear) |
| Logo and images | `apps/web/src/assets/brand/`, `apps/web/src/assets/images/index.ts` |
| Marketing copy | `apps/web/src/content/` |
| HTTP client | `apps/web/src/lib/api-client.ts` (only place that calls `fetch`) |
| Error code → message | `apps/web/src/lib/error-messages.ts` |
| Feature logic | `apps/web/src/features/<feature>/` |
| Mock API | `apps/web/src/mocks/` |
| API settings and env | `apps/api/app/core/config.py` |
| Business rules | `apps/api/app/modules/<module>/service.py` |
| Placement transitions | `apps/api/app/modules/placements/state_machine.py` ↔ `apps/web/src/features/placements/state-machine.ts` (keep identical; labels in `status.ts`) |
| SQL triggers and functions | `apps/api/app/db/migrations/` (readable copies in `app/db/sql/`) |
| Decisions | `docs/decisions/NNNN-title.md` |
| Changelog | `docs/CHANGELOG.md` |

## How to work

1. **Plan first.** For anything beyond a small fix, state the objective and the files you will create or change, then implement.
2. **Explain each edit.** Before modifying an existing file, give a one-line reason. Do not touch unrelated files.
3. **Small steps, checked.** After each step, run the checks for the app you touched and fix failures before moving on.
4. **Tests first for the hard rules.** Listing gate, one active placement, transitions and replacements: write the failing test, then the code.
5. **Ask or default, never guess silently.** If a requirement is unclear, name the ambiguity, pick a sensible default, and record it in `docs/decisions/` or the milestone report.
6. **Finish with a report.** End each milestone with the report format in `SKILL.md` and append it to `docs/CHANGELOG.md`.

## Code rules

**Frontend**
- `app/` route files are thin: render a feature screen and set metadata. No `fetch`, no `useQuery` there.
- A feature imports other features only through their `index.ts`. `components/ui` never imports from `features/`.
- No hardcoded hex values, route strings, image paths, prices or limits. Use tokens, `routes`, the asset map and config.
- Server data in TanStack Query; Zustand only for session and UI state. Never store tokens in localStorage.
- Render placement and worker actions from the API's `allowed_actions`, labelled via each feature's `status.ts`. Do not re-implement rules in components.
- Every data view has loading (skeleton), empty and error states. Every form shows field and form-level errors.
- Accessibility is part of done: visible labels, keyboard operable, visible focus, text contrast ≥ 4.5:1, `prefers-reduced-motion` respected, zero axe violations.
- Primary blue for buttons and links is `blue-600` (#0158E1). `blue-500` (#0779FB) is for large text and icons only. Yellow/amber means "verified" and nothing else.

**Backend**
- Router → service → repository. No SQL in routers, no `HTTPException` in services.
- Services own transactions and raise `DomainError` subclasses; handlers turn them into `{ "error": { code, message, details, request_id } }`.
- Return 404, not 403, for another tenant's resources.
- Money is integer kobo. Timestamps are `timestamptz` UTC.
- Never store a raw NIN (HMAC hash + last 4 only). Never log tokens, NINs, document URLs or card data.
- Verification documents are Cloudinary `authenticated` assets, served only through short-lived signed URLs after a permission check and an access-log write. Families never see documents.
- Paystack webhooks: verify the signature on the raw body, deduplicate by event ID, and re-verify the transaction before granting value.
- Every schema change is an Alembic migration with a working `downgrade()`. Autogenerate misses partial indexes, triggers and enum changes, so add those by hand.

## Gotchas

- Concurrent accepts: lock the worker row (`SELECT … FOR UPDATE`) before checking availability; map the `placements_one_active_per_worker` unique violation to `409 WORKER_UNAVAILABLE`, never a 500.
- The listing trigger raises SQLSTATE `P0001` with hint `WORKER_NOT_VERIFIED`; the repository maps it to a 409.
- Rejecting or expiring a verified item auto-delists the worker but does **not** end an active placement.
- `ALTER TYPE … ADD VALUE` must run outside a transaction (use Alembic's `autocommit_block()`).
- PostgreSQL is the notification feed (`GET /api/v1/notifications`). Firestore is an optional mirror, off for now (`NOTIFICATIONS_MIRROR=none`; owner, 2026-10-19) and not needed for B7 or the deploy. If it's turned on, write to it after the DB commit; a Firestore failure must never roll back business state.
- The three source photos are 14–25 MB each. Always use the optimised versions from `public/images/` via the asset map.
- The logo PNG has a white background; use the trimmed transparent version in `assets/brand/`.
- Mock handlers must enforce the same rules and return the same error envelopes as the real API.

## Do not

- Swap any stack choice without an ADR.
- Copy code, text, images or branding from the reference sites (joincolab.io, the Profusion template, the login image). Adapt layout and interaction ideas only.
- Commit `.env` files, secrets or live Paystack keys. Use test keys outside production.
- Add carousels, scroll-jacking or autoplaying motion.
- Bypass the two rules for a demo, a seed script or a "quick fix".

## Open decisions (owner to confirm)

- Trial length (default 14 days), replacement window (30 days after confirmation) and free replacements (1).
- Brand fonts (proposed: Plus Jakarta Sans + Inter) and a white logo variant for dark backgrounds.
- Licences for Photo1–3 (treated as temporary until confirmed).
- Paystack test vs live mode for the demo.

When the owner decides one of these, update config, the ADR, the tests and this list together.

Decided: the placement fee is charged **at accept**, using the 30-minute `pending_payment` hold (owner, 2026-10-07; ADR 0013).
