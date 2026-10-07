# CLAUDE.md — HelpVerified

HelpVerified lets families hire nannies, drivers and cleaners whose **ID, guarantor, references and address** have been checked by a registered agency. Agencies list workers only after all four checks pass; families post requests, agencies propose workers, and placements run **Trial → Confirmed → Ended**, with replacement requests. Agencies pay monthly; families pay a placement fee.

This file is loaded every session. Keep it short. Detailed conventions live in the project skill at `.claude/skills/helpverified/` — read the relevant `references/*.md` before working in that area.

## The two rules you must never break

1. **A worker cannot be listed unless all four verification items are `verified` and unexpired.**
2. **A worker cannot have more than one active placement** (`pending_payment`, `trial` or `confirmed`).

Both are enforced in PostgreSQL (trigger + partial unique index) **and** in one service each (`modules/verification/service.py`, `modules/placements/service.py`). The UI only reflects them. If a change could bypass either rule through a race, raw SQL, a job, or a new code path, stop and flag it.

## Current phase

<!-- Update this block at the start and end of every milestone. -->
- **Phase:** 2 — Backend (owner started it 2026-10-07)
- **Milestone:** B1 — Scaffold, signed off by owner 2026-10-07. Next: B2 — Auth (Redis option for local dev to be decided at B2).
- **Status:** Phase 1 frontend signed off 2026-10-06 (`docs/frontend-signoff.md`; Lighthouse performance still to be confirmed by the CI job). API contract frozen (ADR 0009). Backend follows `docs/backend-handoff.md`; B1 choices in ADR 0010.
- **Git:** remote `origin` = https://github.com/charlings/HelpVerified. `main` holds the signed-off frontend. Backend milestones go on `feature/backend`: commit each milestone after the owner signs it off, push the branch, and merge into `main` only when the owner asks.
- **Local database:** no Docker or admin rights on the owner's machine. PostgreSQL 16 runs from `%LOCALAPPDATA%\pgsql16` via `apps/api/scripts/pg-portable.ps1 start` (start it after each reboot).
- **Data:** frontend uses MSW mocks (`NEXT_PUBLIC_API_MOCKING=enabled`) until B7. Never imply auth or payments are real while mocks are on.

## Stack

- `apps/web` — Next.js 15 (App Router), TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, MSW, Motion. Package manager: **pnpm**.
- `apps/api` — FastAPI, Pydantic v2, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 16, Redis, Firestore (notifications only), Cloudinary, Paystack. Package manager: **uv**.
- `packages/contracts` — TypeScript types generated from the API's OpenAPI schema. Never edit by hand.

## Commands

```bash
# Setup
pnpm install
docker compose up -d postgres redis
cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.scripts.seed

# Run
pnpm --filter web dev                     # http://localhost:3000
cd apps/api && uv run fastapi dev app/main.py   # http://localhost:8000/docs

# Check (run after every meaningful change to the app you touched)
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test
pnpm --filter web test:e2e                # Playwright + axe
pnpm --filter web build
cd apps/api && uv run ruff check . && uv run mypy app && uv run pytest -q
cd apps/api && uv run pytest tests/concurrency -q   # needs Postgres running

# Utilities
pnpm --filter web images                  # optimise src/assets/images → public/images
pnpm contracts:generate                   # regenerate API types (API must be running)
cd apps/api && uv run alembic revision --autogenerate -m "<message>"
```

Run a single test: `pnpm --filter web vitest run path/to/file.test.tsx` or `uv run pytest tests/path/test_x.py::test_name -q`.

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
- Firestore is a notification mirror. Write to it after the DB commit; a Firestore failure must never roll back business state.
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

- Placement fee charged at accept (current default, uses the `pending_payment` hold) or at confirmation.
- Trial length (default 14 days), replacement window (30 days after confirmation) and free replacements (1).
- Brand fonts (proposed: Plus Jakarta Sans + Inter) and a white logo variant for dark backgrounds.
- Licences for Photo1–3 (treated as temporary until confirmed).
- Paystack test vs live mode for the demo.

When the owner decides one of these, update config, the ADR, the tests and this list together.
