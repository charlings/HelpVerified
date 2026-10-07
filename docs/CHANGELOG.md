# Changelog

## B3 — Agencies, workers, verification (2026-10-07)

### 1. Objective
Agencies onboard and are moderated; agencies add workers (NIN never stored in clear), run the four checks with evidence on Cloudinary, and list workers only through rule 1, enforced in PostgreSQL and in the verification service. Documents are viewed only through logged, short-lived links.

### 2. Files created
- Migration `20261007_0003_agencies_workers.py` and readable copy `app/db/sql/0003_agencies_workers.sql`: eight tables, six enums, `updated_at` triggers, and **rule 1**: `workers_listing_gate` and `verification_items_delist`
- `app/modules/agencies/` (onboarding, `/agencies/me`, dashboard, `is_active`), `app/modules/workers/` (CRUD), `app/modules/verification/` (checks, evidence, uploads, document links, `list_worker`, `expire_lapsed`, `flag`), `app/modules/admin/` (agency moves, admin worker views, audit log)
- `app/integrations/cloudinary.py` (signing, Admin API lookup, expiring private download URLs)
- `app/core/pagination.py`, `validation.py` (phone, state, reason), `dates.py` (`add_months`); `app/db/errors.py` (Postgres error details), `sql_script.py` (statement splitter), `types.py` (`pg_enum`)
- Tests: `test_listing_gate_sql.py` (rule 1 by direct SQL), `test_listing_gate_api.py` (rule 1 by API), `test_agencies.py`, `test_workers.py`, `test_verification.py`, `test_documents.py`, `test_admin.py`, `test_verification_expiry.py`, `unit/test_b3_units.py`; `tests/factories.py`, `tests/workflows.py`, `FakeCloudinary`
- `docs/decisions/0012-b3-agencies-workers-verification.md`
- `apps/api/scripts/cloudinary_live_check.py`: one-off check against a real Cloudinary account (signed upload → Admin API lookup → expiring download → tampered URL refused → not public → cleanup)

### 3. Files modified
- `app/main.py`: Cloudinary on `app.state`; four new routers
- `app/core/config.py`: `NIN_PEPPER`, `CLOUDINARY_*`, `VERIFICATION_TTL_MONTHS`
- `app/core/deps.py`: service factories, `CurrentAgency`, `AdminUser`, `client_ip` (real IPs only)
- `app/core/security.py`: `hash_nin` (HMAC-SHA256)
- **`app/core/logging.py`: tracebacks no longer include frame locals** (a crash log had included a bearer token's prefix; now tested)
- `app/modules/users/`: `UserOut.agency` filled for agency admins (`/me`, login); phone rule moved to `core/validation.py`
- Repositories: SQLAlchemy 2.1's deprecated `Result.tuples()` removed
- `tests/conftest.py`: one shared app per session, `DELETE` instead of `TRUNCATE`, B3 settings; suite runs in about 2 minutes instead of 32
- `.env.example`, `.github/workflows/ci.yml` (per-run random `NIN_PEPPER` and Cloudinary placeholders), `README.md`, `CLAUDE.md`, `docs/database.md` (ERD and rules), skill `references/database.md` (B3 columns)

### 4. Key decisions
ADR 0012: rule 1 in trigger, service and repository mapping; lapsed counts as unverified before the job runs; minimal `subscriptions` now (Paystack in B5); B4-dependent fields return empty values in the contract shape; Cloudinary via `httpx`; asset checks at registration; access log plus audit entry per document view; normalised CAC; admin moves and effects; no locals in crash logs; migration SQL kept identical to its copy; shared test app.

### 5. Tests and checks
| Check | Result |
| --- | --- |
| `ruff check`, `ruff format --check`, `mypy app tests` (strict) | Pass, 98 files |
| `pytest -q` (Postgres 16.15, Redis 7.4.11, fake Cloudinary) | **218 passed** in about 2 minutes |
| Rule 1, direct SQL | Each of the 4 checks missing, each non-verified status, a lapsed `expires_at`, inserting as listed: all refused with `WORKER_NOT_VERIFIED`; leaving `verified` delists |
| Rule 1, API | `test_cannot_list_with_pending_item` (×4), `test_rejecting_item_delists_worker`, evidence removal and flags delist, expired blocks, inactive agency → 403 |
| Migrations | up → base → up with every B3 table and type; models match migrations; SQL copy matches the migration |
| Live Cloudinary (`scripts/cloudinary_live_check.py`, owner's account) | **Passed**: signed upload 200 → Admin API lookup found → expiring download 200 → tampered signature 401 → public URL 404 → asset deleted |
| Live server | Dev DB migrated 0002 → 0003; server starts with 30 routes; no token → 401 envelope |

### 6. Known issues
- `GET /admin/overview` and `GET /workers/{id}/public` aren't built (they need B4 tables).
- The dashboard's request and trial fields, `available` and `active_placement` return placeholder values until B4.
- Suspending an agency doesn't withdraw proposals yet (no proposals until B4).
- Soft-deleted documents stay in Cloudinary until a cleanup job (B6).
- Alembic loads the full settings, so migrating locally also needs the Cloudinary keys in `.env`.

### 7. Assumptions
- Expiry adds calendar months (31 January + 1 month = 28 or 29 February).
- Check `details` are free-form short text (up to 12 fields, 500 characters each); the web form defines which fields each check uses.

### 8. Acceptance criteria (B3 row: "Onboarding + approval, NIN hashing, items, Cloudinary signing/registration, document URLs + access log, listing trigger; must-have tests 3 and 4 pass")
| Item | Result |
| --- | --- |
| Onboarding and approval | **Met** |
| NIN hashing; duplicate → 409; no raw NIN stored | **Met** |
| The four checks and their rules | **Met** |
| Cloudinary signing and registration (folder, size, format checks) | **Met** (fake in tests; live check passed) |
| Document URLs and access log; family → 404 | **Met** |
| Listing trigger; `test_cannot_list_with_pending_item` incl. direct SQL; `test_rejecting_item_delists_worker` | **Met** (the placement-continues half is tested in B4) |
| Consent required to create a worker | **Met** |
| 401/403/404 for each B3 router | **Met** |

### 9. Recommended next step
B4: requests, proposals and placements, with **rule 2** (the one-active-placement index and a locked accept, tested under concurrency).

**Signed off by the owner 2026-10-07.**

## B2 — Auth (2026-10-07)

### 1. Objective
Real accounts and sessions behind the endpoints the frontend's mock already defines: sign-up, sign-in, refresh rotation with reuse detection, logout, email verification, password reset, `/me`, role and verified-email guards, and Redis rate limits. Google sign-in is deferred to its own stage (owner decision, ADR 0011).

### 2. Files created
- `app/core/security.py` (argon2id, common-password check, JWT, opaque tokens and their hashes), `app/core/common_passwords.txt`
- `app/core/deps.py`: `get_db`, `get_current_user`, `require_role`, `require_verified_email`, service factories
- `app/core/rate_limit.py`: Redis sliding window (atomic Lua script); `app/core/clock.py`
- `app/integrations/email.py`: `EmailSender` interface, development outbox
- `app/modules/users/`: `models.py` (`User`, roles, statuses), `repository.py`, `schemas.py` (`UserOut`, `MeUpdate`), `service.py`, `router.py` (`GET`/`PATCH /me`)
- `app/modules/auth/`: `models.py` (refresh and one-time tokens), `repository.py`, `schemas.py`, `service.py`, `emails.py`, `router.py` (8 endpoints)
- `app/db/models.py` (model registry), migration `20261007_0002_identity.py`, readable copy `app/db/sql/0002_identity.sql`
- `apps/api/scripts/redis-portable.ps1`
- Tests: `unit/test_security.py`, `unit/test_auth_emails.py`, `integration/test_auth_accounts.py`, `test_auth_tokens.py`, `test_rate_limits.py`, `test_access_control.py`, `test_log_hygiene.py`, `test_schema_drift.py`; `tests/fakes.py`, `tests/helpers.py`
- `docs/database.md` (ERD, starting now that there are tables), `docs/decisions/0011-b2-auth-choices.md`

### 3. Files modified
- `app/main.py`: lifespan owns the engine, Redis and email sender; routers under `/api/v1`
- `app/core/config.py`: B2 settings (Redis, JWT, token lifetimes, rate limits, email); outbox refused when deployed
- `app/core/errors.py`, `error_handlers.py`: `RateLimited` carries `Retry-After`
- `app/db/base.py`: timestamp mixins; `app/db/session.py`: engine and sessionmaker factories (no globals); `migrations/env.py`: loads every model
- `tests/conftest.py`: Postgres and Redis fixtures, a clean state per test, shared helper connection pool; `integration/test_migrations.py`: covers the new tables, types and trigger
- `pyproject.toml` / `uv.lock`: argon2-cffi, PyJWT, redis, time-machine; test-only ignores for fake passwords
- `.env.example`: B2 keys; `.gitignore`: `apps/api/.outbox/`
- `.github/workflows/ci.yml`: Redis service, per-run random `JWT_SECRET`
- `README.md`, `CLAUDE.md`: Redis setup, outbox, status
- `.claude/skills/helpverified/references/database.md` (privacy columns), `api-contracts.md` (logout via cookie, `UserOut` shape)

### 4. Key decisions
ADR 0011: Google deferred; portable Redis 7.4 on both loopbacks; dev email outbox (refused when deployed); logout needs only the cookie; Origin check on cookie endpoints; rate limits run before credentials and never count rejected or invalid requests; strict refresh-reuse detection (multi-tab race noted); `UserOut.phone` added; privacy-notice columns; `Secure` cookie when deployed, same-site domains needed in production; resources on `app.state`.

### 5. Tests and checks
| Check | Result |
| --- | --- |
| `ruff check` / `ruff format --check` | Pass, 55 files |
| `mypy app tests` (strict) | Pass, 55 files |
| `pytest -q` (real Postgres 16.15 and Redis 7.4.11) | **107 passed**, about 2–3 minutes locally |
| Migrations | up → down to base → up, with tables, enums and the `updated_at` trigger checked; models match migrations (autogenerate diff is empty) |
| Live server smoke test | signup 201 → verify link from `.outbox` → login 200 and cookie → `/me` 200 → refresh 200 → logout 204 → refresh 401; server log has no tokens or passwords |

Spec acceptance items covered: refresh-token reuse revokes the chain; reset and verify tokens fail on second use with 410; an unverified email is refused (`require_verified_email`, wired to real endpoints in B3/B4); each rate limit returns 429 with `Retry-After`; logs contain no tokens or passwords; no token → 401 and wrong role → 403 (other-tenant 404 arrives with tenant-owned resources in B3).

### 6. Known issues
- **Google sign-in isn't built** (deferred, ADR 0011).
- Two tabs refreshing at the same instant can sign the user out (strict reuse detection). Watch for it in B7.
- Production needs the web app and API on the same site for the `SameSite=Lax` refresh cookie (B8 checklist).
- No seed script yet, so a super admin can only be created directly in the database. The seed arrives with the demo data (database.md §8).
- Each new PostgreSQL connection costs about 0.4 s on this Windows machine (backend process start-up), so the integration suite takes about 2–3 minutes here. CI on Linux will be faster.
- Starlette's `httpx` → `httpx2` deprecation warning, as in B1.

### 7. Assumptions
- `privacy_notice_version` is stored as sent (1–64 characters); the server doesn't keep a list of valid versions.
- Each refresh rotation grants a fresh 14 days, so the session slides and has no absolute lifetime.

### 8. Acceptance criteria (B2 row: "Signup/login/refresh/logout/verify/reset/Google, `require_role`, rate limits; 401/403/404 matrix and token tests pass")
| Item | Result |
| --- | --- |
| Signup, login, refresh, logout, verify, reset | **Met** |
| Google | **Deferred** by the owner (ADR 0011) |
| `require_role`, `require_verified_email` | **Met** (probe-route tests) |
| Rate limits | **Met** (all three, with `Retry-After`) |
| 401/403 matrix | **Met** for `/me` and the guards; 404 for other tenants starts in B3 |
| Token tests | **Met** (rotation, reuse, expiry, single use) |

### 9. Recommended next step
B3 (Agencies, workers, verification): agency onboarding and approval, NIN hashing, the four checks, Cloudinary signing and registration, document URLs with the access log, and the listing-gate trigger. B3 needs Cloudinary credentials (a free account works; test uploads only).

**Signed off by the owner 2026-10-07.**

## B1 — Scaffold (2026-10-07)

### 1. Objective
Start Phase 2 with a FastAPI app that runs, documents itself, logs in JSON with a request ID, returns every error in the contract envelope, refuses to start with missing settings, and has an Alembic baseline that migrates up, down and up again, locally and in CI.

### 2. Files created
- `apps/api/pyproject.toml`, `uv.lock`, `.python-version`: Python 3.14, FastAPI 0.142, SQLAlchemy 2.1 (asyncpg), Alembic 1.20, pydantic-settings, structlog; ruff, mypy (strict), pytest
- `app/main.py`: `create_app()`, CORS, middleware, error handlers, `GET /health`
- `app/core/config.py`: settings, fail-fast `MissingSettingsError` naming each bad key
- `app/core/errors.py`: `DomainError` hierarchy, one class per contract code, no HTTP imports
- `app/core/error_handlers.py`: domain, framework, validation and unhandled errors turned into the envelope
- `app/core/middleware.py`: request ID (from `X-Request-ID` or generated) plus access log; 1 MB body limit
- `app/core/logging.py`: structlog JSON
- `app/db/base.py` (naming convention), `app/db/session.py` (engine, `get_db`)
- `alembic.ini`, `app/db/migrations/env.py` (async), `script.py.mako`, `versions/20261007_0001_baseline.py` (`pgcrypto`, `citext`, `set_updated_at()`); readable copy `app/db/sql/0001_baseline.sql`
- `tests/`: health, CORS, error envelope (parametrised), config fail-fast, error codes vs the web contract, layer-import rules, migration round-trip
- `apps/api/scripts/pg-portable.ps1`: PostgreSQL 16 without Docker or admin rights; `scripts/create-test-db.sql`
- `docker-compose.yml`: Postgres 16 and Redis 7, bound to localhost
- `docs/decisions/0010-b1-scaffold-choices.md`

### 3. Files modified
- `.env.example`: API section added (its comment said B1 would add it)
- `.github/workflows/ci.yml`: new `api` job (ruff, format, mypy, migration up/down/up, pytest) with a Postgres 16 service
- `README.md`: API setup with and without Docker, API commands, current phase, branch workflow
- `CLAUDE.md`: current phase is now B1; git workflow (`feature/backend`); local database note; removed the "don't start backend" rule, which is now met

### 4. Key decisions
ADR 0010: Python 3.14; settings keys added per milestone; framework errors keep their HTTP status with the nearest contract code (405/413 use `BAD_REQUEST`, no new codes); error codes tested against the web mock; layer rules enforced by a test; `/health` is liveness only; portable Postgres for machines without admin rights.

### 5. Tests and checks
| Check | Result |
| --- | --- |
| `uv run ruff check .` / `ruff format --check .` | Pass |
| `uv run mypy app tests` (strict) | Pass |
| `uv run pytest -q` | 36 passed, 1 skipped (layer-rule test has no modules to check until B2) |
| Migration round-trip, pytest and Alembic CLI | `upgrade head → downgrade base → upgrade head` pass on PostgreSQL 16.15 |
| Live server (`fastapi run`) | `/health` 200, `/docs` 200, unknown route returns the 404 envelope, access log is JSON with `request_id` |
| Clean copy (no `.venv`/`.env`, `uv sync --locked`, README steps) | Migrate, lint, types and tests pass |
| DB test with Postgres stopped | Skips locally; fails in CI by design |

### 6. Known issues
- Starlette warns that its test client will move from `httpx` to `httpx2`. It's harmless for now; switch when FastAPI's `TestClient` does.
- `docs/database.md` (the ERD) doesn't exist yet. The baseline has no tables, so it starts in B2 with the first tables.
- Local Postgres must be started after each reboot (`pg-portable.ps1 start`).
- The repository was re-initialised after B1 was first committed, which lost the original B1 commit. B1 was restored file for file on `feature/backend` and all checks were re-run.

### 7. Assumptions
- Dev credentials `helpverified`/`helpverified` are local-only (bound to localhost) and never used outside development and CI.
- Render's managed Postgres allows `pgcrypto` and `citext` (both are on its supported list). Confirm at B8.

### 8. Acceptance criteria
| Item (testing-and-milestones.md §5) | Result |
| --- | --- |
| `/health` 200 | **Met** |
| `/docs` loads | **Met** |
| Migration up/down/up in CI | **Met locally** (pytest and CLI); CI runs on push of `feature/backend` |
| Empty test passes (and more) | **Met**: 36 tests |
| Spec: removing a required env var stops startup with a named error | **Met** (`test_config.py`, every key) |
| Spec: every error path returns the envelope with `request_id`; unhandled → generic 500 | **Met** (`test_errors.py`) |
| Spec: architecture test for router, service and repository imports | **Met** (in place; enforces from B2 when modules exist) |

### 9. Recommended next step
B2 (Auth): users and refresh-token tables, argon2id, JWT, verify and reset tokens, `require_role`, and Redis rate limits. B2 needs Redis locally: a portable Windows build, Upstash, or a fake Redis in tests (to be decided at B2).

**Signed off by the owner 2026-10-07.**

## Phase 1 summary — Frontend complete (2026-10-06)

Nine milestones took HelpVerified's frontend from an empty repo to a finished, verified app running on a mock API that enforces the real business rules.

| Milestone | Delivered |
| --- | --- |
| M1 Scaffold and design system | Next.js 15 monorepo, tokens, components, lint rules for paths, colours, images and feature boundaries |
| M2 Shell and navigation | Marketing header and footer, app shell (sidebar, rail, bottom tabs), role menus |
| M3 Marketing pages | 13 pages, service sections with reveal-on-scroll, contact form, SEO, OG image |
| M4 Auth | Sign in, sign up, agency onboarding, password reset, email verification, session and role guards |
| M5 Agency workspace | Workers, the four checks with evidence, listing gate, requests, proposals, placements, billing |
| M6 Family workspace | Requests, proposals, accept and pay (Paystack-shaped), trial, confirm, replacement |
| M7 Admin console | Agency approval and suspension, worker review and flags, placements, audit log |
| M8 States and accessibility | Route-wide audit, states matrix, form focus, dialog focus, keyboard flows, contrast |
| M9 Freeze | WebKit and Firefox, bundle budgets, acceptance evidence, clean-clone check, backend handoff |

**The two promises hold in the UI and the mock:** a worker can't be listed without all four checks verified, and a worker can't be in two active placements.

**Numbers at the end:** 49 routes; Vitest 484; Playwright 174 (Chromium) and 168 + 6 skipped (WebKit); audit 49/49; heaviest page 174 kB of JS.

**Signed off by the owner 2026-10-06.** Backend (B1) waits for the owner's go-ahead; read `docs/backend-handoff.md` first.

## M9 — Freeze (2026-10-06)

### 1. Objective
Close Phase 1: verify every spec acceptance item with evidence, pass on the phone browser as well as Chromium, measure and budget bundles, complete the docs the backend needs, and record the owner's sign-off before B1.

### 2. Files created
Stage A (see the entry below) plus, in Stage B:
- `docs/frontend-signoff.md` — every acceptance item, result and evidence; sign-off block
- `docs/backend-handoff.md` — contract, rules the API must enforce, schema changes, seed, order of work
- `docs/decisions/0005`–`0009` — payments flow, admin moderation, accessibility verification, bundle budgets, contract freeze
- `src/lib/error-messages.test.ts` — every error code has its own human message

### 3. Files modified (Stage B)
- `apps/web/package.json`: `typecheck` runs `next typegen` first (found by the clean-clone check; CI would have failed on its first run)
- `e2e/assets.spec.ts`: logo proportions at four widths; `e2e/routes.spec.ts`: Demo pill on every route
- `api-contracts.md`: table of endpoints added during Phase 1
- State-machine pointer corrected to `features/placements/state-machine.ts` in `CLAUDE.md`, the backend spec, `SKILL.md` and `database.md`
- `README.md`: status, commands, all demo accounts, docs index

### 4. Key decisions
All seven in the approved plan held, with one change: bundle budgets are grouped by what a page does (content ≤ 130 kB; forms and workspaces ≤ 185 kB) rather than marketing 150 / workspaces 200 kB, which is tighter and puts the contact form with the other forms (ADR 0008).

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| Clean clone (`git clone`, frozen install, lint, typecheck, build, budgets, `next dev`) | Pass, after the `typegen` fix |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 484/484 |
| Playwright + axe, Chromium | 174/174 |
| Playwright, WebKit (iPhone 13) | 168 passed, 6 skipped |
| Firefox smoke | 7/7 |
| Accessibility audit | 49/49 |
| Bundle budgets | 51/51 routes |
| Lighthouse (local) | Accessibility 100, SEO 100; performance Home 60, Services 70 (CPU-starved laptop; CI is the measure, ADR 0004) |

### 6. Known issues
- **Lighthouse performance ≥ 90 is not yet proven.** Local runs on this laptop vary with free memory (60–90 across M3–M9). The CI `lighthouse` job decides; it runs on the first push.
- **CI hasn't run yet**: nothing has been pushed. The clean-clone check ran the same steps locally.
- WebKit runs reliably here only with one worker; CI uses two on a larger runner.

### 7. Assumptions
- Chromium, WebKit (iPhone) and a Firefox smoke run are the browser matrix for v1 (testing reference).
- The contract freeze takes effect at the owner's sign-off.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Full suite on Chromium and WebKit; Firefox smoke recorded | Met |
| Every spec acceptance item verified with evidence | Met: 17 of 18 proven, Lighthouse performance pending CI (`docs/frontend-signoff.md`) |
| Bundle report, budgets in CI, admin excess fixed | Met |
| Docs complete and consistent (including the backend handoff) | Met |
| lint, typecheck, unit, build, e2e, audit pass | Met |
| Owner sign-off recorded before backend work | Met (2026-10-06) |

**Owner sign-off:** 2026-10-06 (recorded in `docs/frontend-signoff.md`). Backend not started: the owner asked to wait.

### 9. Recommended next step
Push to GitHub so CI runs (web, a11y-audit, lighthouse, security), check the Lighthouse job, then sign off in `docs/frontend-signoff.md`. Then **B1 — Scaffold**.

## M9 Stage A — Verification and fixes (2026-10-06)

Interim entry; see the full M9 report above.

- **Cross-browser:** WebKit (iPhone 13, 375 px) run in full locally for the first time: **168 passed, 6 skipped** (keyboard flows and the skip-link test: Safari only Tabs to links with Option+Tab). An earlier two-worker attempt timed out on 33 page loads while memory was short; one worker, in batches, passed. Two test fixes: the noindex test now waits for the session redirect before navigating on; the skip-link test skips WebKit. **Firefox smoke run** (`playwright.firefox.config.ts`, not in CI): 7/7 — sign in for all three roles, the full sign-up → confirm journey and the replacement journey.
- **New automated acceptance checks:** `src/test/lint-rules.test.ts` (11 — lint rejects a path literal, raw hex, raw image path, cross-feature deep import, components importing features, and fetch / react-query / deep imports in route files; clean code passes); `src/assets/images/budget.test.ts` (18 — every photo at every width and format exists; 1600 px ≤ 300 KB, largest 96 KB); `e2e/links.spec.ts` (crawls the public site from Home: no broken links or images).
- **Bundles:** `"sideEffects": ["*.css", "**/features/auth/client.ts"]` lets webpack drop unused barrel exports — admin workers 187 → 140 kB, request detail 188 → 154 kB, 17 routes smaller. Budgets enforced in CI (`scripts/bundle-budget.mts`): content pages ≤ 130 kB, form pages and workspaces ≤ 185 kB; all 51 routes pass (heaviest 174 kB) and the check fails on the pre-fix build. Report: `docs/bundles.md`.
- **`RoleGuard`** session skeleton now has a `main` landmark and a visually hidden `h1`.
- **Build folders:** Playwright builds into `.next-e2e` (`NEXT_DIST_DIR`), so a running `pnpm dev` (`.next`) isn't overwritten during tests.
- **Checks:** lint, typecheck pass; Vitest 459/459; Chromium Playwright + axe 173/173; WebKit 168 passed / 6 skipped; Firefox 7/7; audit 49/49.

## M8 — States and accessibility pass (2026-10-06)

### 1. Objective
Every page and state meets the accessibility checklist (skill `frontend.md` §10) and the states requirements (spec 18–20, 22), checked by machines: axe on every route, four widths, touch targets, loading/empty/error states, form focus, keyboard-only flows and colour contrast. No new features.

### 2. Files created
Stage A (see the entry below) plus, in Stage B:
- `src/test/states.test.tsx` — 27 data screens × (loading, failing API): labelled loading region, "Try again", one `h1` throughout
- `src/test/empty-states.test.tsx` — the empty states no screen test covered
- `src/test/forms.test.tsx` — focus moves to the first problem (11 forms and dialogs); submit disabled while sending
- `src/styles/tokens-contrast.test.ts` — every semantic colour pairing, read from `tokens.css`, including text over gradients
- `e2e/keyboard.spec.ts` — one keyboard-only flow per milestone (M4–M7), visible focus at every stop, focus after dialogs
- `docs/accessibility.md` — what's checked where, exceptions, patterns to reuse

### 3. Files modified (Stage B)
- `components/ui/Dialog.tsx`: records the control that opened it and returns focus there on close; if that control is gone or disabled, focus goes to the page `h1` (never `<body>`)
- `components/forms/ReasonDialog.tsx`, `features/verification/components/RejectDialog.tsx`: focus the reason field on an error
- `components/forms/RadioCards.tsx`: `role="radiogroup"` with `aria-invalid`; each radio points at the error
- `features/payments/screens/DemoCheckoutScreen.tsx`: "Try again" when loading fails (not-found stays final); a failed payment now shows an error
- `features/marketing/components/CtaBanner.tsx`: background glow 60% → 40% opacity
- `.github/workflows/ci.yml`: new `a11y-audit` job; the main e2e run skips the audit
- `e2e/keyboard.spec.ts` skips the phone (WebKit) project; `components/forms/forms.test.tsx` expects `radiogroup`

### 4. Key decisions
All eight in the approved plan held. Found and decided during the build:
- **Focus after dialogs is handled once, in `Dialog`.** Radix only restores focus for its own trigger component; our dialogs open from ordinary buttons, so focus fell to `<body>` after Escape or success. Every dialog in the app benefits.
- **Radio groups carry `aria-invalid` on the group**, not each radio (ARIA doesn't allow it on `radio`; lint caught the first attempt).
- **The CTA glow was dimmed** because, where it overlaps the navy box on phones, 80%-white body text measured 3.32:1. It's a small visual change; the banner keeps the same look.
- **Gradient contrast is checked by calculation**, because axe reports text over gradients as "needs review", not as a violation.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 430/430 pass (97 new in M8: states 54, empty 7, forms 14, contrast 22) |
| `pnpm build` | Pass |
| `e2e/audit.spec.ts` (Chromium) | 49/49 routes clean after Stage B (8 shards, one worker) |
| Other Playwright + axe specs (Chromium) | 172/172, two workers, no re-runs |

### 6. Known issues
- The audit takes about 40 minutes on this laptop in shards; CI runs it in its own job.
- The phone project (WebKit, iPhone 13) still hasn't been run locally; keyboard flows are skipped there by design. Cross-browser is M9.
- The session-restoring skeleton in `RoleGuard` (shown for a moment before a workspace page knows who you are) has no `h1`. It's brief and not reachable by assistive tech before it's replaced; noted for M9.
- The admin worker pages' extra JavaScript (M7) is still for M9's bundle analysis.

### 7. Assumptions
- Touch targets follow WCAG 2.5.5 (44 px) with its inline, label and stretched-link exceptions.
- Keyboard-only use is tested on desktop Chromium; phone users are covered by touch-target and screen-width checks.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Zero axe violations on every route (seeded data, 375 and 1280 px) | Met (49/49) |
| No horizontal scroll at 375, 768, 1280, 1536 px | Met |
| Interactive targets ≥ 44 × 44 px, exceptions as planned | Met |
| Loading, empty and error states tested on every data screen; forms test field and form errors, first-invalid focus and disabled submit | Met |
| Keyboard-only pass completes each milestone's main flow | Met (M4 sign in, M5 propose, M6 post request and accept-and-pay, M7 approve) |
| Semantic colour pairings meet 4.5:1 / 3:1 | Met (after the CTA glow change) |
| lint, typecheck, unit tests, build, Chromium e2e + axe | Met |

**Owner sign-off:** 2026-10-06.

### 9. Recommended next step
Owner review: try the site with the keyboard only (Tab, Enter, Space, arrows, Escape), and at phone width. Then **M9 — Freeze** (cross-browser, bundle analysis, docs complete, sign-off before backend work).

## M8 Stage A — Route-wide audit and fixes (2026-10-06)

Interim entry; see the full M8 report above.

- **Audit:** `e2e/audit.spec.ts` visits all 49 routes (48 in `routes.ts` plus the 404 page) with seeded data (right role, real IDs) and checks one `h1`, zero axe violations at 375 and 1280 px, no horizontal scroll at 375/768/1280/1536 px, and every visible interactive target ≥ 44 × 44 px. Exceptions coded in the test: links inside a sentence; checkbox/radio measured by its label row; stretched card links measured by the card. Axe runs after finite animations settle (a reveal caught mid-fade failed contrast falsely). Result: **49/49 clean** (run in 16 shards with one worker for memory). `routes.spec.ts` keeps titles, status codes and the single `h1`, now including the four routes added since M6; its axe loop moved to the audit.
- **Found and fixed (all touch targets; no axe violations or horizontal scroll were found):** logo links in the header, footer, auth layout and app shell (32–40 px → 44); desktop menu triggers and links (40 → 44); short footer links (39–41 px wide → min 44); toast close (36 → 44); checkbox rows (the whole row is now the label, ≥ 44 px tall); standalone text links in tables, cards and lists, "Forgot password?" and "Full audit log" (17–26 px → 44, via the shared `components/ui/link-styles.ts` `textLink`).
- **Loading headers:** seven detail screens keep their page header (generic title and back link) while loading, so there is always one `h1`.
- **Checks:** lint, typecheck pass; Vitest 333/333; Playwright + axe 167/167 (all specs, Chromium, two workers, no re-runs) plus the audit 49/49.

## M7 — Admin console (2026-10-05)

### 1. Objective
A super admin oversees HelpVerified against the mock API: what needs attention, agency approval and suspension, any worker's checks and evidence with flagging, every placement, and an audit log. Every action is confirmed first, reasons are recorded, and non-admins get the 403 page.

### 2. Files created
Stage A (see the entry below) plus, in Stage B:
- Screens: `features/admin/screens/AdminWorkersScreen.tsx`, `AdminWorkerDetailScreen.tsx` (read-only checks, View, Flag), `AdminAuditLogScreen.tsx`
- Routes: `/admin/workers`, `/admin/workers/[id]`, `/admin/placements`, `/admin/placements/[id]`, `/admin/audit-log` (placeholders replaced or added)
- Tests: `mocks/handlers/admin-workers.test.ts`, `features/admin/screens/admin-stage-b.test.tsx`; `e2e/admin.spec.ts` extended

### 3. Files modified (Stage B)
- `mocks/handlers/admin.ts`: `GET /admin/workers`, `GET /admin/workers/{id}`, `POST /admin/workers/{id}/flag`, `GET /admin/audit-log`
- `mocks/handlers/documents.ts`: every document view also writes a `document.viewed` audit entry
- `mocks/handlers/placements.ts`, `types/domain.ts`, `features/placements/status.ts`: an admin ending a placement is recorded as `admin_ended` ("Ended by HelpVerified") and audited
- `mocks/types.ts`, `mocks/domain.ts`, `mocks/handlers/verification.ts`, `features/verification/types.ts`, `CheckCard.tsx`: `flag_reason` / `flagged_at` on a check, shown to the agency, cleared when it re-verifies
- `features/verification/index.ts`: exports `DocumentViewer`
- `features/placements/screens/PlacementsListScreen.tsx`, `PlacementDetailScreen.tsx`: `viewer="super_admin"`; `hooks.ts` refreshes admin queries after a placement action
- Docs: `architecture.md`, `route-map.md`, skill `api-contracts.md`

### 4. Key decisions
All eight in the approved plan held. Made during the build:
- **Demo logins for the new agencies are `pending@demo.hv` and `suspendedagency@demo.hv`**, not `newagency@demo.hv` as the plan suggested: that account is used, agency-less, by the onboarding tests.
- **A flag is stored on the check** (`flag_reason`, `flagged_at`) rather than reusing `rejection_reason`, because the check isn't rejected: it's back in review. The backend needs these two columns on `verification_items`.
- **`admin_ended` is a new end reason.** Recording an admin's decision as "ended by the agency" would be wrong in the family's and agency's timelines. The backend needs an enum migration (`ALTER TYPE … ADD VALUE`, outside a transaction).
- **The agency sees its suspension or rejection reason** on its dashboard banner, with a contact link and a note that running placements continue.
- **Workers aren't seeded for the new agencies**; Sunrise is used to demonstrate suspension.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 333/333 pass (19 new in Stage B, 40 in M7) |
| `pnpm build` | Pass |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | 163/163, run in three parts (86 + 47 + 30) with two workers. One failed on the first pass and passed on a re-run alone: the `/signup` accessibility scan (unchanged in M7) exceeded the 60 s test limit under load. |

### 6. Known issues
- **Load sensitivity of e2e on this laptop:** across M6 and M7, single tests in different specs have timed out under two-worker load and passed alone. Workspace accessibility loops now wait up to 30 s (`waitForPage`). CI runners should be steadier; if not, the next step is one worker per job.
- **Admin worker pages ship about 47 kB more JavaScript** than the agency's worker list (187 kB vs 140 kB first load), most likely the workers feature barrel bringing in its form schema. Not user-facing for families; to be looked at in M9's bundle analysis.
- Suspending individual user accounts, approval emails, data export/deletion and editing agency details are out of scope (plan).
- WebKit mobile project still not run locally.

### 7. Assumptions
- Rejected agencies can't reapply through the app in v1; they contact support.
- Viewing a document is audited for every viewer, including agencies viewing their own workers' evidence.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Overview, agencies list/approve/suspend, worker flags, placements, audit log | Met (plus reject and reinstate, and logged document viewing) |
| Non-admin gets the 403 page | Met (family and agency, every `/admin` route, e2e) |
| Actions show confirmation dialogs | Met (approve, reject, suspend, reinstate, flag, end) |
| lint, typecheck, unit tests, build, Chromium e2e + axe all pass | Met (see the e2e note in §5) |

**Owner sign-off:** 2026-10-06.

### 9. Recommended next step
Owner review as `admin@demo.hv` (password `demo1234`): approve Bright Hands Agency, suspend and reinstate Sunrise, open Amaka Obi's checks, view a document and flag her address check, then read the audit log. Sign in as `agency@demo.hv` to see the flag. Then **M8 — States and accessibility pass**.

## M7 Stage A — Overview and agencies (2026-10-05)

Interim entry; see the full M7 report above.

- **Built:** admin overview (headline numbers linking to their lists, approval queue, recent admin activity), agencies list (table → cards, status filter kept in the URL, pending first), agency detail (business, contact, workers and placements, subscription, reason, history) with Approve / Reject / Suspend / Reinstate, each behind a confirmation dialog; reject and suspend need a reason.
- **Mock rules:** `features/admin` types; `mocks/admin-domain.ts` (agency moves, suspension effects, audit writes); `GET /admin/overview`, `GET /admin/agencies`, `GET /admin/agencies/{id}`, `POST /admin/agencies/{id}/{action}`; non-admins get `FORBIDDEN`; a stale action gets `ILLEGAL_TRANSITION`. Suspension hides listed workers and withdraws pending proposals; running placements continue. The agency sees the reason on its dashboard.
- **Seed:** pending agency Bright Hands (`pending@demo.hv`), suspended agency Harbour Care (`suspendedagency@demo.hv`), an audit history; mock database key `hv-mock-db-v4`. `newagency@demo.hv` stays agency-less for the onboarding tests, so the plan's suggested login wasn't reused.
- **Shared pieces moved:** `ReasonDialog` → `components/forms`, the dashboard stat card → `components/data/StatCard` (agency dashboard unchanged visually).
- **Tests:** e2e accessibility loops now use `e2e/helpers/page.ts` `waitForPage` (30 s for the first heading). The same 10 s wait timed out under two-worker load in M6 and again here on a different page; each passed alone.
- **Checks:** lint, typecheck, build pass; Vitest 314/314 (21 new). Playwright + axe on Chromium: groups 1 and 2 (marketing, routes, navigation, assets, auth, agency) 133/133. Group 3 (family, journey, admin): 22/23 with two workers; the failure was the family "request with a proposal" accessibility check, whose page didn't show its heading within 30 s under memory pressure (about 3 GB free). It passed alone. A one-worker re-run was stopped by Claude Code for low memory before reporting. Committed at the owner's request; the full suite runs again at the end of Stage B.

## M6 — Family workspace (2026-10-05)

### 1. Objective
A family runs their whole side of HelpVerified against the mock API: post a request, compare proposals with the four checks and their dates, accept, pay through a Paystack-shaped redirect, follow the trial, confirm, ask for a replacement, and see their payments and details.

### 2. Files created
Stage A (see the entry below) plus, in Stage B:
- Families: `features/families/` — `api.ts`, screens `FamilyDashboardScreen`, `FamilySettingsScreen`
- Billing: `features/billing/components/PaymentHistory.tsx` (shared by agency billing and family payments), `screens/FamilyPaymentsScreen.tsx`
- Placements: `features/placements/components/ReasonDialog.tsx` (end, cancel and replacement all need a reason; replaces `EndPlacementDialog`)
- Mocks: `mocks/handlers/family-placements.ts` (confirm, cancel hold, resume payment, replacement, `GET /families/me`, `GET /families/me/dashboard`)
- Tests: `mocks/handlers/family-placements.test.ts`, `features/families/screens/family-stage-b.test.tsx`, `e2e/journey.spec.ts`

### 3. Files modified (Stage B)
- `features/placements/api.ts`, `hooks.ts` (one `usePlacementActions` hook that refreshes every affected query), `screens/PlacementDetailScreen.tsx` (every family action, payment-due banner, replacement allowance)
- `features/billing/screens/AgencyBillingScreen.tsx`: uses `PaymentHistory`; no visible change
- `mocks/db.ts` (`replacementRequests`), `mocks/handlers/index.ts`
- Route files: `/family`, `/family/payments`, `/family/settings` (placeholders replaced)
- `e2e/navigation.spec.ts`: the tab-bar overlap test now waits for the dashboard's data before measuring (it was written against the instant placeholder)
- Docs: `architecture.md`, `placeholders.md`, skill `api-contracts.md`

### 4. Key decisions
All decisions in the approved plan held. Made during the build:
- **The free replacement is counted per placement fee, not per placement.** The placement that replaces another carries its count forward, so a family who has used their one free replacement sees "1 of 1 free" on the new placement and pays for the next.
- **A replacement copies the original request** (same role, area, schedule, budget), linked by `replaces_placement_id`, starting today; the original request closes.
- **Cancelling an unpaid hold reopens the request** and returns the superseded proposals to pending, as an expired hold already did in M5. The pending payment is marked failed.
- **"Pay placement fee" resumes the same checkout** (`POST /placements/{id}/pay` returns the existing reference) rather than creating a second payment.
- **Settings are read-only** with a link to contact; editing arrives with the backend.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 293/293 pass (22 new in Stage B, 51 in M6) |
| `pnpm build` | Pass |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | 148/148, run in three parts to fit this laptop's memory (86 + 47 + 15). Two failed on the first pass and passed on a re-run: the tab-bar overlap test (fixed, see §3), and the agency "ended placement" accessibility check, a 10 s heading wait that timed out twice under parallel load. Timed alone, that page shows its heading in under 2 s, and the whole agency spec then passed 13/13 with 2 workers. |

### 6. Known issues
- The agency "ended placement" accessibility check is sensitive to machine load (see §5). Watch it in CI; if it fails there, the fix is a longer wait on that page, not a product change.
- Concurrent accepts can't race across real tabs (each tab has its own mock database); the rule is unit-tested and shown with a forced error. Real concurrency is tested in B4.
- The placement fee (₦20,000) is a demo value, marked `TODO(content)`.
- WebKit mobile project still not run locally.

### 7. Assumptions
- A replacement request starts today; the family can't edit it yet (request editing isn't in scope).
- Only the family who received a proposal can see a worker's public profile.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Dashboard, new request (multi-step), requests list, request detail with proposals, worker public profile, accept + mocked payment, placement detail with timeline and actions, payments, settings | Met |
| Playwright: signup → request → agency proposes → accept → pay (mock) → trial → confirm | Met (`e2e/journey.spec.ts`, one tab, signing in as each role) |
| Replacement flow | Met (request → agency proposes → accept with the fee waived) |
| Concurrent-accept error message | Met (forced error in the browser; rule unit-tested) |
| lint, typecheck, unit tests, build, Chromium e2e + axe all pass | Met (see the e2e note in §5) |

**Owner sign-off:** 2026-10-05.

### 9. Recommended next step
Owner review as `family@demo.hv` (password `demo1234`): accept Amaka on "Live-in nanny for two toddlers" and pay at the demo checkout; then open Blessing Eze's trial and confirm it or ask for a replacement. Sign in as `bola@demo.hv` to see a hold awaiting payment. Then **M7**.

## M6 Stage A — Requests, proposals, accept and pay (2026-10-05)

Interim entry; see the full M6 report above.

- **Built:** family requests list, new request (4 steps, role prefilled from service pages), request detail with proposal cards (first name, agency, experience, the four checks with dates), accept dialog, decline, cancel request, worker public profile, demo checkout (`/demo/checkout`, demo mode only), payment callback page (verifies with the API, handles paid / pending / cancelled / failed / refunded).
- **Mock rules:** family-only access to own requests; first request creates the family record; `EMAIL_NOT_VERIFIED`; accept checks in the database order with a 30-minute hold, superseding other proposals and an idempotency key; one active placement per worker; simulated `charge.success` processed once, re-checked, moving the placement to trial; late payment after an expired hold refunded with no placement; free-replacement waiver; public profile only for families who received a proposal.
- **Checks:** lint and typecheck pass; Vitest 271/271 (29 new); Playwright + axe 142/142 on Chromium, run in two halves (86 + 56) to stay within this laptop's memory. The new family spec covers accept → demo checkout → pay → trial in a real browser, a cancelled checkout, the concurrent-accept message and axe on each screen.
- **Decided during the build:** the demo checkout lives outside the workspaces with its own providers; the callback accepts Paystack's `trxref` as well as `reference`.

## M5 — Agency workspace (2026-10-05)

### 1. Objective
An agency admin runs their whole side of HelpVerified against the mock API — dashboard, workers, the four checks with evidence, listing, open requests, proposals, placements, billing and settings — with the two promises to families enforced in the UI and the mock.

### 2. Files created
Stage A (see the entry below) plus, in Stage B:
- Placements: `features/placements/` — `state-machine.ts` (+ test), `status.ts`, `types.ts`, `api.ts`, `hooks.ts`, `index.ts`, components `PlacementTimeline`, `EndPlacementDialog`, screens `PlacementsListScreen`, `PlacementDetailScreen` (both take a `viewer`, reused in M6)
- Requests and proposals: `features/requests/` — `types.ts`, `api.ts`, `hooks.ts`, `status.ts`, `components/ProposeDialog.tsx`, screens `AgencyRequestsScreen`, `AgencyRequestDetailScreen`
- Billing: `features/billing/` — `api.ts`, `status.ts`, `screens/AgencyBillingScreen.tsx`; agency settings: `features/agencies/screens/AgencySettingsScreen.tsx`
- Mocks: `mocks/placements-domain.ts`, `mocks/handlers/requests.ts`, `placements.ts`, `billing.ts` (+ `GET /agencies/me`)
- Tests: `mocks/handlers/requests.test.ts`, `features/placements/state-machine.test.ts`, `features/requests/screens/stage-b-screens.test.tsx`, `e2e/agency-requests.spec.ts`

### 3. Files modified (Stage B)
- `lib/api-client.ts`, `mocks/errors.ts`: forced errors can target a method and path.
- `lib/error-messages.ts`, `mocks/errors.ts`: `ALREADY_PROPOSED`.
- `lib/format.ts`: `formatDateTime`, `formatMonthlyRange`, `daysUntil`.
- `features/agencies/api.ts`: profile.
- Six agency route files (requests, request detail, placements, placement detail, billing, settings).
- Skill `api-contracts.md`: `ALREADY_PROPOSED`, M5 payload additions, verification rules.
- `playwright.config.ts`: assertion timeout 10 s (pages with several mock calls under load).
- Docs: `architecture.md`, `placeholders.md`, `README.md`.

### 4. Key decisions
All ten in the approved plan held. Made during the build:
- **Requests and proposals are one feature**; proposals never exist outside a request.
- **Agencies don't see family names on requests**, only area, schedule and budget, until there's a placement (data minimisation).
- **The placement state machine lives in `features/placements/state-machine.ts`** as the mirror of the backend's; only the mock computes `allowed_actions` with it. Screens render what the API allows and ignore actions they don't handle yet (family actions arrive in M6).
- **Re-proposing after a withdrawal** reuses the existing proposal row (the database's `UNIQUE (request_id, worker_id)` forbids a second row).
- **Ending a placement closes its request**; holds that expire reopen it and return proposals to pending.
- **Scoped forced errors** (`mock_error_method`, `mock_error_path`) so a conflict can be shown without breaking the page load.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 242/242 pass (63 new in Stage B, 99 in M5) |
| `pnpm build` | Pass (run by the e2e suite) |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | Full run: 132/133. The one failure was a 5 s assertion timeout on a three-query page under full-suite load; with the expect timeout raised to 10 s, that spec's accessibility tests re-ran 5/5. The full suite wasn't repeated after this timeout-only change. |

### 6. Known issues
- The concurrent-proposal conflict is shown in the browser with a forced error. Two real tabs can't race, because each tab has its own mock database; the rule itself is unit-tested against the mock and will be tested with real concurrency in B4 (`tests/concurrency`).
- WebKit mobile project still not run locally.
- Billing amounts are demo values; subscriptions can't be changed until Paystack (B5).

### 7. Assumptions
- An agency sees requests for the roles it offers in its own state only. Requests near a state border, or agencies covering several states, will need a coverage model later.
- An agency ending a placement is recorded as `agency_ended`; "worker left" isn't offered separately yet.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Dashboard, workers table, add worker (multi-step), worker detail + checklist + uploads (mocked), list/delist, incoming requests, propose dialog, placements, billing view | Met (plus a read-only settings view) |
| Cannot list until 4/4 — UI and mock | Met |
| Proposing a busy worker shows the conflict | Met (busy workers can't be chosen; a race shows "This worker has just been placed with another family") |
| Tables become cards on mobile | Met (workers, requests, placements, payments) |
| Empty and error states everywhere | Met (each list and detail screen has loading, empty and error states, tested) |
| lint, typecheck, unit, build, Chromium e2e + axe | Met (see the e2e note in §5) |

**Owner sign-off:** 2026-10-05.

### 9. Recommended next step
Owner review as `agency@demo.hv`: verify Joy Nwosu's address and list her, propose Musa Ibrahim for the part-time driver request, and end Blessing Eze's trial. Then **M6 — Family workspace** (post a request, accept a proposal, mock payment, trial, confirm, replacement).

## M5 Stage A — Workers and verification (2026-10-05)

Interim entry; see the full M5 report above.

- **Built:** agency dashboard (counts, trials ending, activity banner, "register your agency" prompt), workers list (URL filters, pagination, cards on mobile), add worker (3 steps with NIN and consent), worker detail with the four-check checklist (details, evidence upload with progress, in-app document viewer, verify, reject with reason), list/delist with the reason shown when listing isn't possible.
- **Mock rules:** tenant isolation (404), listing gate (4/4 verified and unexpired), evidence before verifying, expiry on read with auto-delist, rejecting delists without ending a placement, agency activity gate, duplicate NIN by hash, signed upload folders, document access log.
- **Checks:** lint, typecheck pass; Vitest 179/179 (36 new); Playwright + axe 120/120 (13 new), including the full add → four uploads → verify → list flow in a real browser.
- **Fixed during the build:** duplicate-NIN error now focuses the NIN field after returning to its step; the upload mock answers CORS preflights like Cloudinary does.
- **Decided during the build:** shared domain types in `src/types/domain.ts`; documents open in an in-app viewer (browsers block opening `data:` URLs in a new tab, and it keeps document URLs out of the address bar); upload registration is unit-tested and the browser upload is covered end to end (jsdom can't run the multipart upload).

## M4 — Auth screens (2026-10-05)

### 1. Objective
Every authentication screen and state working end to end against the mock API: sign in, sign up with a role picker, agency onboarding, forgot and reset password, email verification, session expiry and role-based redirects, with the workspaces from M2 protected for real.

### 2. Files created
- Auth feature: `features/auth/` — `types.ts`, `schemas.ts`, `session.ts`, `client.ts`, `api.ts`, `redirects.ts`; components `PromoPanel`, `AuthLegal`, `GoogleButton` (+ `EmailDivider`), `DemoAccounts`, `DemoInboxLink`, `CheckEmail`, `AccountControls`; screens `LoginScreen`, `SignupScreen`, `AgencyOnboardingScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`, `VerifyEmailScreen`
- Shared UI: `components/layout/AuthLayout.tsx`, `components/brand/VerifiedMark.tsx` (moved from marketing), `components/forms/PasswordInput.tsx`, `CheckboxField.tsx`, `RadioCards.tsx`, `Stepper.tsx`, `server-errors.ts`
- Content: `content/auth.ts`, `content/locations.ts` (36 states + FCT)
- Assets: `assets/icons/google.svg`, `assets/icons/index.ts`
- `src/middleware.ts`
- Mocks: `mocks/cookies.ts`, `mocks/handlers/auth.ts`, `mocks/handlers/agencies.ts`
- Tests: `lib/api-client.auth.test.ts`, `features/auth/redirects.test.ts`, `features/auth/components/RoleGuard.test.tsx`, `features/auth/screens/auth-screens.test.tsx`, `features/auth/screens/AgencyOnboardingScreen.test.tsx`, `mocks/handlers/auth.test.ts`, `components/forms/forms.test.tsx`, `test/auth-helpers.ts`, `e2e/auth.spec.ts`, `e2e/helpers/session.ts`
- Plan: `specs/frontend/plan-m4-auth-screens.md`

### 3. Files modified
- `lib/api-client.ts`: `configureAuth` (bearer token, single shared refresh on 401, `onAuthFailure`), `skipAuthRetry`, empty bodies return `undefined`.
- `lib/error-messages.ts`, `mocks/errors.ts`: `AGENCY_EXISTS`.
- `mocks/db.ts`: seeded demo users and agency, tokens, outbox; persisted to `sessionStorage`. `mocks/handlers/contact.ts`: shared helpers, persistence.
- `features/auth/components/RoleGuard.tsx`: real guard (restore → login with `next` / `403`), loading skeleton.
- `features/auth/index.ts`: shared exports only (no screens).
- `components/layout/app-shell/AppShell.tsx`: `account` slot; workspace layouts pass `AccountControls`.
- `app/(auth)/layout.tsx` and the six auth route files; `components/layout/AuthFrame.tsx` removed.
- `styles/tokens.css`: `--gradient-panel`, `--animate-float`.
- `eslint.config.mjs`: tests and test helpers may import feature internals.
- `e2e/routes.spec.ts`, `e2e/navigation.spec.ts`: sign in before workspace routes; auth pages now have a footer landmark.
- Skill: `api-contracts.md` (`AGENCY_EXISTS`, verify-email response), `frontend.md` (on-demand restore, no screen barrels, multi-step button keys, `signupFor`).
- Docs: `architecture.md`, `reference-adaptation.md`, `placeholders.md`, `README.md`.

### 4. Key decisions
Approved in the plan: demo refresh cookie; demo inbox link; honest Google button; agency onboarding requires an account; service CTAs carry the role; privacy notice version recorded; mock login rate limit; `zustand`; e2e sign-in helper.

Made during the build:
- **Session restored on demand, not on every page load.** The plan placed restore in a global provider; that would load the mock API and make an auth call on every marketing page, undoing M3's performance work.
- **Signed-out visitors to `/signup/agency` go to sign in (with `next`), not signup**, so returning agency admins aren't shown a signup form. Sign-in links to account creation.
- **New error code `AGENCY_EXISTS` (409)** for a second onboarding submission; recorded in the API contract.
- **`POST /auth/verify-email` returns `{verified, role}`** so the UI can send agencies on to onboarding; recorded in the API contract.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 143/143 pass (59 new) |
| `pnpm build` | Pass (44 static pages + middleware) |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | 107/107 pass (21 new) |

Bugs the tests caught and fixed:
- **Agency onboarding skipped the review step**: React reused the "Continue" button as the submit button, so the click that opened the review also submitted. Fixed with distinct keys (the e2e test caught it; unit tests can't, as synthetic clicks have no default action).
- Review list markup (`<dl>`) and the auth legal line outside a landmark (axe).
- `role="status"` on headings removed their heading role.

### 6. Known issues
- **Session expiry mid-session** is covered by unit tests (`api-client.auth.test.ts`: refresh failure → `onAuthFailure`) and the expired banner by e2e, but there's no e2e test that expires a live session, because no workspace page makes API calls until M5.
- WebKit mobile project still not run locally.
- Google sign-in and email delivery are demo stand-ins until the backend (B2, B6).

### 7. Assumptions
- Nigerian phone format `0`/`+234` followed by `7–9`, `0–1` and 8 digits; CAC numbers `RC`, `BN` or `IT` plus 4–8 digits. To confirm against real agency data.
- LGA is free text (774 LGAs; a picker can come later).

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Every state in design-system §8 / frontend §7 reachable and covered by tests | Met (see the screen/state table in the plan; each has a unit or e2e test) |
| Login, signup + role picker, agency onboarding, forgot, reset, verify email, session expired, Google button | Met |
| MSW auth handlers, session store, redirects | Met |
| "Demo mode" notice visible | Met (since M3) |
| lint, typecheck, unit, build, Chromium e2e + axe | Met |

**Owner sign-off:** 2026-10-05.

### 9. Recommended next step
Owner review: sign in with the demo accounts at http://localhost:3000/login, try signup and password reset with the demo inbox, and register an agency as `newagency@demo.hv`. Then **M5 — Agency workspace** (workers, the four-check verification flow and the listing gate).

## M3 — Marketing pages (2026-10-05)

### 1. Objective
Replace the marketing placeholders with real pages built from typed content, add the Services page reveal and scroll-tracking behaviour, a working contact form against the mock API, per-page metadata and a generated Open Graph image, and measure the Lighthouse targets.

### 2. Files created
- Content: `src/content/` — `types.ts`, `home.ts`, `services.ts`, `checks.ts`, `journey.ts`, `trial.ts`, `pages.ts`, `contact.ts`, `legal.ts`, `testimonials.ts`, `metadata.ts`
- Config: `src/config/business.ts` (trial, replacement and re-check numbers shown in copy)
- Animation: `components/animation/useInView.ts`, `useReducedMotion.ts`, `Reveal.tsx`, `Stagger.tsx`
- Marketing feature: `features/marketing/metadata.ts`, `index.ts`; components `Section`, `Hero`, `SoftShape`, `RoleCards`, `ChecksBand`, `VerifiedMark`, `Steps`, `EditorialCards`, `TrialPromise`, `CtaBanner`, `FaqList`, `Testimonials`, `ServiceBlock`, `ServiceChips`; screens `Home`, `Services`, `ServiceDetail`, `HowItWorks`, `ForAgencies`, `About`, `Pricing`, `Contact`, `Legal`; `contact/schemas.ts`, `api.ts`, `ContactForm.tsx`
- Data layer: `lib/api-client.ts`, `lib/error-messages.ts`, `lib/format.ts`
- Forms and UI: `components/forms/FormField.tsx`, `components/ui/Textarea.tsx`, `Select.tsx`, `components/feedback/DemoModePill.tsx`
- Mocks: `src/mocks/browser.ts`, `server.ts`, `db.ts`, `errors.ts`, `latency.ts`, `handlers/index.ts`, `handlers/contact.ts`; `public/mockServiceWorker.js`
- App: `app/providers.tsx`, `app/opengraph-image.tsx`
- Scripts: `scripts/lighthouse.mts`
- Tests: `config/env.test.ts`, `content/metadata.test.ts`, `lib/api-client.test.ts`, `components/animation/animation.test.tsx`, `features/marketing/contact/ContactForm.test.tsx`, `features/marketing/screens/PricingScreen.test.tsx`, `e2e/marketing.spec.ts`
- Docs: `docs/content.md`; plan `specs/frontend/plan-m3-marketing-pages.md`

### 3. Files modified
- Marketing route files (`app/(marketing)/*/page.tsx`): render screens with `pageMetadata`.
- `app/layout.tsx`: `Providers` wrapper; `<noscript>` rule so reveal content shows without JavaScript.
- `app/fonts.ts`: Inter no longer preloaded, so the heading font loads first.
- `config/routes.ts`: `auth.signupFor(role)` for service CTAs.
- `config/env.ts`: plain validation instead of zod (this module is in every page's bundle).
- `styles/base.css`, `styles/tokens.css`: `scale` reveal variant, per-item delay, smooth in-page scrolling with an offset for sticky bars.
- `components/layout/app-shell/AppShell.tsx`: sidebar `aside` labelled "Workspace sidebar".
- `next.config.ts`: `msw/browser` aliased away in the server build; `experimental.inlineCss`.
- `eslint.config.mjs`: route files may import `@/features/x/screens/Y` (regex rule); OG image exempt from the hex rule; generated files ignored.
- `playwright.config.ts`: local workers capped at 3 (memory).
- `e2e/routes.spec.ts`, `e2e/navigation.spec.ts`: new titles; sidebar selector.
- `.github/workflows/ci.yml`: Lighthouse job on a GitHub runner.
- `.claude/skills/helpverified/references/api-contracts.md`: `POST /contact` payload recorded.
- Docs: `architecture.md`, `placeholders.md`, `reference-adaptation.md`, `README.md`, `.gitignore`.

### 4. Key decisions
Approved in the plan: draft copy with `TODO(content)`; no invented proof; prices "To be confirmed"; legal pages as outlines with a draft notice; contact form on the real api-client + MSW pattern; no parallax.

Made during the build:
- **No barrel for screens.** Re-exporting screens from `features/marketing/index.ts` made every page ship every screen's client code (zod and react-hook-form were on the Home page). Route files now import screens directly; the lint rule allows exactly `@/features/x/screens/Y` from `app/`. This refines the skill's rule ("`app/` imports feature screens") and keeps feature-to-feature imports going through `index.ts`. Home first-load JS: 162 KB → 109 KB.
- **MSW starts on the first API request, not on page load**, so pages that never call the API never load it.
- **Hero is never animated** and text on the brand gradient is avoided (contrast); the CTA banner is navy with a decorative gradient.
- **Services scroll-spy uses a throttled scroll listener**, not IntersectionObserver: with sections taller than the viewport, "topmost intersecting" picked the previous section.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 84/84 pass (30 new) |
| `pnpm build` | Pass, 44 static pages |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | 86/86 pass (22 new), axe clean on all 44 routes |
| Lighthouse mobile, Home | Performance 86 and 90 (two runs) · Accessibility 100 · SEO 100 |
| Lighthouse mobile, Services | Performance 88 and 79 (two runs) · Accessibility 100 · SEO 100 |

Lighthouse history on this machine (Home / Services performance): 53 / 68 at first → 77 / 81 after removing zod, react-hook-form and eager MSW from the shared bundle → 86–90 / 79–88 after inlining CSS and prioritising the heading font. Lighthouse's CPU benchmark on this laptop varied from 680 to 940 between runs, below the ~1000 its 4× throttle assumes, which explains the spread.

### 6. Known issues
- **Lighthouse performance ≥ 90 is not consistently met locally** (see above). The new CI job measures it on a GitHub runner; it hasn't run yet (no remote).
- The Home and Services LCP element is the hero heading. `font-display: optional` was measured after the M3 commit and did not improve LCP, so `swap` stays (ADR 0004). The remaining delay needs investigating if CI also scores < 90.
- WebKit mobile project still not run locally.
- All copy is draft; see `docs/content.md` for the 12 open markers.

### 7. Assumptions
- Business numbers in copy (14-day trial, 30-day replacement window, 1 free replacement, 12-month re-checks) are the skill's defaults.
- "You only pay when you accept a worker" reflects the default `FEE_CHARGED_AT=accept`.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| All marketing pages (Home, Services + Reveal/Stagger, 3 service pages, How it works, For agencies, Pricing, About, Contact with mocked submit, Privacy, Terms) | Met |
| Metadata per page, sitemap, robots, OG image | Met |
| Lighthouse mobile ≥ 90 performance on Home and Services | **Not met locally** (79–90, machine-bound); pending the CI measurement |
| Lighthouse 100 accessibility, 100 SEO on Home and Services | Met |
| Reduced motion verified | Met (e2e: every reveal element fully visible under `prefers-reduced-motion`) |
| Copy from `content/`, every `TODO(content)` listed | Met (`docs/content.md`) |
| lint, typecheck, unit, build, Chromium e2e + axe | Met |

### 9. Recommended next step
Owner review of the draft copy (`docs/content.md`) and pages at http://localhost:3000. Push to a GitHub remote so CI runs the WebKit tests and the Lighthouse job. Then **M4 — Auth screens** (needs the `login` reference image).

## M2 — Shell + navigation (2026-10-05)

### 1. Objective
Put every page in the right frame: marketing and auth pages get a header (grouped menus, mobile drawer) and footer; family, agency and admin workspaces get an app shell whose navigation adapts to the screen. All of it keyboard-operable and axe-clean.

### 2. Files created
- Navigation: `components/navigation/SiteHeader.tsx`, `DesktopNav.tsx`, `MobileNav.tsx`, `icons.ts`
- Frames: `components/layout/MarketingFrame.tsx`, `AuthFrame.tsx`, `SiteFooter.tsx`
- App shell: `components/layout/app-shell/AppShell.tsx`, `AppNavList.tsx`, `BottomTabs.tsx`
- Auth feature: `features/auth/components/RoleGuard.tsx`, `features/auth/index.ts`
- Workspace layouts: `app/(app)/family/layout.tsx`, `agency/layout.tsx`, `admin/layout.tsx`
- Lib: `lib/active-link.ts`
- Tests: `lib/active-link.test.ts`, `config/nav.test.ts`, `components/navigation/icons.test.ts`, `components/navigation/MobileNav.test.tsx`, `components/layout/app-shell/AppNav.test.tsx`, `e2e/navigation.spec.ts`
- Plan: `specs/frontend/plan-m2-shell-navigation.md`

### 3. Files modified
- `config/nav.ts`: icon names, exact-match homes, `primaryCount`, header actions, `isNavGroup`.
- `components/brand/Logo.tsx`: height driven by a `--logo-h` CSS variable so it can be responsive (32 px mobile, 40 px desktop).
- `components/layout/PlaceholderPage.tsx`, `StatusPage.tsx`: no longer render `<main>`; frames own it.
- `app/(marketing)/layout.tsx`, `app/(auth)/layout.tsx`, `app/(app)/layout.tsx`, `app/not-found.tsx`: use the new frames.
- `eslint.config.mjs`: `jsx-a11y/aria-role` ignores non-DOM components (our `role` prop is a user role).
- `playwright.config.ts`: local workers 50%, test timeout 60 s (axe scans timed out under full parallelism).
- `package.json`: `lucide-react`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-dialog`.
- Docs: `architecture.md`, `placeholders.md`, `reference-adaptation.md`; `CLAUDE.md` phase block.

### 4. Key decisions (approved in the plan)
- Sidebar shows the logo mark on a white tile until a white logo exists.
- Agency phone nav: 4 tabs + "More" (Billing, Settings).
- `lucide-react` for icons via a name → component map; config stays React-free.
- Radix NavigationMenu (click/Enter, no hover) and Radix Dialog (drawer, More sheet).
- 404 renders inside the marketing frame.
- `RoleGuard` pass-through until M4.
- Not in the plan: the sidebar and the rail share one `AppNavList` with two variants instead of separate `Sidebar.tsx` / `NavRail.tsx` files, to avoid duplicating the active-state logic.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint`, `lint:css`, `typecheck` | Pass |
| `pnpm test` (Vitest) | 54/54 pass (20 new) |
| `pnpm build` | Pass |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | 64/64 pass (14 new) |

New e2e coverage: Services dropdown operable by keyboard (Tab in, through every link, Esc closes and focus returns); mobile drawer traps focus over 15 Tabs, Esc closes and returns focus, link click navigates and closes; app shell shows sidebar at 1280, rail at 768 and bottom tabs at 375; nested route highlights its section; content isn't hidden behind the tab bar; agency More sheet; each role sees only its own items; landmark counts on marketing, 404, auth and app pages; axe clean on all 44 routes.

### 6. Known issues
- WebKit mobile project still not run locally; CI covers it once a remote exists.
- The app top bar is empty on desktop until the account menu and notifications arrive (M4–M6).
- Manual check at 375/768/1280/1536 px by a person still pending.

### 7. Assumptions
- Footer on slate-50 rather than a dark band, until a white logo exists.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| Keyboard navigation through all menus | Met (header dropdown and drawer e2e-tested; sidebar, rail, tabs and More sheet are plain links/buttons in tab order) |
| Drawer traps focus | Met |
| Correct nav per role at 375/768/1280 | Met |
| Marketing header with grouped menus, mobile drawer, footer | Met |
| AppShell with sidebar/rail/bottom tabs per role | Met |
| RoleGuard stub | Met |
| 404/403/error pages | Met (404 and 403 in the marketing frame; `error.tsx` replaces the subtree) |
| lint, typecheck, unit, build, e2e + axe | Met (Chromium) |

**Owner sign-off:** 2026-10-05.

### 9. Recommended next step
Owner review at http://localhost:3000 (header, drawer at phone width, `/family`, `/agency`, `/admin`). Then **M3 — Marketing pages**, which needs a decision on marketing copy: write draft copy marked `TODO(content)`, or wait for owner copy.

## M1 — Scaffold + design system (2026-10-05)

### 1. Objective
Stand up the monorepo and `apps/web` so every route renders a titled placeholder, all design values live in `tokens.css`, brand assets and optimised photos are served through one asset map, lint enforces module boundaries, and tests run end to end with axe.

### 2. Files created
- Root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`, `README.md`, `.github/workflows/ci.yml`
- `apps/web` config: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.stylelintrc.json`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `playwright.config.ts`
- Styles: `src/styles/tokens.css`, `base.css`, `globals.css`
- Config: `src/config/routes.ts`, `nav.ts`, `site.ts`, `env.ts`
- Routes: 41 placeholder pages across `(marketing)`, `(auth)`, `(app)/family|agency|admin`; `(dev)/styleguide`; `403`, `not-found`, `error`, `global-error`, `sitemap.ts`, `robots.ts`; segment layouts
- Components: `ui/Button`, `Input`, `Label`, `Badge`, `Card`, `Alert`; `layout/PlaceholderPage`, `StatusPage`; `brand/Logo`; `shared/ResponsiveImage`
- Feature: `features/styleguide` (screen, swatch, token lists)
- Lib: `cn.ts`, `contrast.ts`
- Assets: `src/assets/brand/{logo-full,logo-mark}.png` + map, `src/assets/images/index.ts`, `public/favicon/*`, `public/images/*` (36 variants)
- Scripts: `scripts/brand.mts`, `scripts/images.mts`
- Tests: 6 Vitest files (34 tests), `e2e/routes.spec.ts`, `e2e/assets.spec.ts` (50 tests)
- Docs: `architecture.md`, `decisions/0001–0003`, `route-map.md`, `design-tokens.md`, `asset-inventory.md`, `placeholders.md`, `reference-adaptation.md`, this changelog

### 3. Files modified
- `CLAUDE.md`: current-phase block updated at start and end of M1.
- `.claude/skills/helpverified/references/design-system.md`: added `danger-700`, after a failed contrast test (ADR 0003 §3).
- `specs/frontend/project-helpverified-web.md`: photo mapping assumption marked as confirmed.
- `specs/frontend/plan-m1-scaffold-design-system.md`: status set to approved.

### 4. Key decisions
- ADR 0001: stack.
- ADR 0002: original photos stay out of git; optimised variants are committed.
- ADR 0003: `/styleguide` instead of `/_styleguide`; `<picture>`-based `ResponsiveImage`; `danger-700` token; built-in ESLint rules instead of `eslint-plugin-boundaries`; Tailwind default palette removed.

### 5. Tests and checks run
| Check | Result |
| --- | --- |
| `pnpm lint` (ESLint, zero warnings) | Pass |
| `pnpm lint:css` (Stylelint) | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` (Vitest) | 34/34 pass |
| `pnpm build` | Pass, 43 static pages |
| `pnpm test:e2e --project=chromium` (Playwright + axe) | 50/50 pass (49 in the full run, then the fixed styleguide spec re-run) |
| Lint rule probes (hex in TSX, hex in CSS, path literal, raw image path, deep cross-feature import, `components`→`features`, `fetch` in `app/`) | All 7 caught |
| Image budget (1600 px ≤ 300 KB) | Pass: 39–96 KB |

Bugs found by the tests and fixed: `danger-600` on `danger-50` was 4.41:1 (below AA); `Button asChild` crashed; `parseHex` rejected minified `#fff`, which hid styleguide contrast ratios in production builds.

### 6. Known issues
- WebKit (375 px) Playwright project not run locally; the browser isn't downloaded on this machine. CI installs and runs it.
- CI has not run: there is no GitHub remote yet.
- `gitleaks` only runs in CI; nothing was scanned locally.
- Manual pass at 375/768/1280/1536 px and a keyboard-only pass not done by a person. Automated checks cover titles, one `h1` per page, the skip link and axe.
- Next.js logs `NoFallbackError` when an unknown `/services/<slug>` 404s. This is framework noise; the response is a correct 404.
- Home title is "Home · HelpVerified"; a proper title comes with M3 copy.

### 7. Assumptions
- Plus Jakarta Sans + Inter until the owner confirms brand fonts.
- Photo mapping Photo1 = cleaner, Photo2 = driver, Photo3 = nanny (confirmed visually).
- pnpm 12.9.1 via corepack; Node 24.

### 8. Acceptance criteria
| Criterion | Status |
| --- | --- |
| `pnpm install && pnpm dev` works from a clean clone | Met locally (README steps); clean-clone test not repeated |
| lint/typecheck/test/build pass in CI | Partly met: pass locally, CI not yet run (no remote) |
| `tokens.css` holds every design value; lint fails on raw hex elsewhere | Met (one documented exception: `themeColor` in `site.ts`) |
| Every route renders a placeholder with the correct title | Met (Playwright) |
| Favicons and manifest load | Met (Playwright) |
| Photo1–3 ≤ 300 KB at 1600 px via asset map | Met |
| Styleguide shows colours with contrast ratios, type scale, button/input/badge states | Met |
| axe clean on styleguide | Met (and on every placeholder route) |
| `.env.example`, README, docs exist | Met |
| CHANGELOG has M1 entry | Met |

**Owner sign-off:** 2026-10-05 (styleguide, logo crop and favicons reviewed).

### 9. Recommended next step
Owner review of `/styleguide` (colours, logo crop, favicons) and the open decisions in `CLAUDE.md`. Then add a GitHub remote so CI runs, and start **M2 — Shell + navigation**.
