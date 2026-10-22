# HelpVerified

Families in Nigeria hire nannies, drivers and cleaners whose **ID, guarantor, references and address** have been checked by a registered agency.

- Specs: `specs/frontend/project-helpverified-web.md`, `specs/backend/project-helpverified-api.md`
- Working rules for contributors and Claude Code: `CLAUDE.md` and `.claude/skills/helpverified/`
- Architecture and decisions: `docs/`

**Current phase:** 2 — Backend. Phase 1 (frontend, M1–M9) is complete and signed off (`docs/frontend-signoff.md`). B1 (API scaffold), B2 (auth), B3 (agencies, workers, verification) B4 (requests, proposals, placements) and B5 (Paystack payments, test mode) are done, and B6 (notifications, email and scheduled jobs) is code complete, with its end-to-end email check deferred to B7 (Firestore and SMTP connectivity passed). Google sign-in is code complete (ADR 0016), pending its live checks. The web app still runs on mock data, and nothing is connected to the real API, payments or email until B7. Backend work follows `docs/backend-handoff.md` and lands on the `feature/backend` branch, one commit per milestone, merged into `main` later.

## Requirements

- Node 24 (`.nvmrc`)
- Bun 1.4 (version pinned in `package.json`; installs per user, no admin rights): `powershell -c "irm bun.sh/install.ps1 | iex"`
- API: [uv](https://docs.astral.sh/uv/) (installs Python 3.14 itself), PostgreSQL 16 and Redis 7, via Docker or the portable setup below

## Setup

```bash
bun install
cp .env.example apps/web/.env.local     # PowerShell: Copy-Item .env.example apps/web/.env.local
bun run dev                             # http://localhost:3000
```

The design-token and component gallery is at http://localhost:3000/styleguide (development only).

### API (apps/api)

1. Copy the API section at the bottom of `.env.example` to `apps/api/.env`. Set `JWT_SECRET` and `NIN_PEPPER` to random values (the command is in the comment above them), fill in `CLOUDINARY_*` from your Cloudinary console, and `PAYSTACK_SECRET_KEY` with a **test** key (`sk_test_...`). Tests never upload or charge; they use fakes. To check the real accounts: `uv run python -m scripts.cloudinary_live_check` and `uv run python -m scripts.paystack_live_check start`.
2. Start PostgreSQL 16 and Redis 7 with **one** of these:
   - **Docker:** `docker compose up -d postgres redis`
   - **No Docker or no admin rights (Windows):**
     - PostgreSQL: download the EDB "PostgreSQL 16 binaries" zip and unzip it so `%LOCALAPPDATA%\pgsql16\bin\pg_ctl.exe` exists.
     - Redis: download `Redis-7.4.x-Windows-x64-msys2.zip` from github.com/redis-windows/redis-windows/releases and unzip it so `%LOCALAPPDATA%\redis7\redis-server.exe` exists.
     - Then from `apps/api`:
       ```powershell
       .\scripts\pg-portable.ps1 init       # once: data folder + databases helpverified and helpverified_test
       .\scripts\pg-portable.ps1 start      # after each reboot (also: stop, status)
       .\scripts\redis-portable.ps1 start   # after each reboot (also: stop, status)
       ```
     If scripts are blocked, run them as `powershell -ExecutionPolicy Bypass -File .\scripts\<script>.ps1 start`.
3. Then:
   ```bash
   cd apps/api
   uv sync
   uv run alembic upgrade head
   uv run fastapi dev app/main.py     # http://localhost:8000/health and /docs
   ```

**Emails in development** aren't sent. They're written as JSON files to `apps/api/.outbox/`; open the newest one and follow its `link`. To send real email, set `EMAIL_PROVIDER=smtp` and the `SMTP_*` keys (any provider's SMTP relay), then check with `uv run python -m scripts.email_live_check you@example.com`.

**Google sign-in** is off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (a Google Cloud OAuth client of type *Web application*, with authorised redirect URI `http://localhost:8000/api/v1/auth/google/callback`). Check the keys with `uv run python -m scripts.google_live_check`. The button only starts the real flow when the web app runs with mocks off. See ADR 0016.

**Notifications and jobs (B6).** Events (a proposal, a paid fee, a lapsed hold, an expiring check, …) are written to the `notifications` table with the change itself, served at `/api/v1/notifications`, emailed, and mirrored to Firestore when `NOTIFICATIONS_MIRROR=firestore` (check with `uv run python -m scripts.firestore_live_check`). Scheduled jobs run inside the API (`JOBS_ENABLED=true`): `uv run python -m app.jobs list` shows them, and `uv run python -m app.jobs run <name>` runs one now. See ADR 0015.

## Commands

Run from the repository root (or use `bun --filter web <script>`).

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the web app |
| `bun run build` | Production build |
| `bun run lint` | ESLint, including module-boundary, raw-colour and route-literal rules |
| `bun --filter web lint:css` | Stylelint (no hex colours outside `tokens.css`) |
| `bun run typecheck` | TypeScript, strict (runs `next typegen` first, so it works on a clean clone) |
| `bun run test` | Unit tests (Vitest) |
| `bun --filter web test:e2e` | Playwright on Chromium and WebKit (iPhone 13); builds into `apps/web/.next-e2e` and serves on port 3100, so `bun run dev` can keep running |
| `bunx playwright test e2e/audit.spec.ts --project=chromium --workers=1` (from `apps/web`) | Accessibility and layout audit of every route (heavy; add `--shard=1/8` on a low-memory machine). See `docs/accessibility.md` |
| `bunx playwright test -c playwright.firefox.config.ts` (from `apps/web`) | Firefox smoke run (not in CI; `playwright install firefox` first) |
| `bun --filter web bundle:check <build log>` | Fail if a route is over its JS budget (`bun run build > build.log` first). See `docs/bundles.md` |
| `bun --filter web brand` | Regenerate transparent logo, mark and favicons from the source logo |
| `bun --filter web images` | Regenerate responsive photo variants (needs the originals, see below) |
| `bun --filter web lighthouse` | Lighthouse mobile on Home and Services against a production build (build first with `NEXT_PUBLIC_SITE_URL=http://localhost:3200`); reports in `apps/web/lighthouse/` |

**Demo accounts** (demo mode only, password `demo1234`):

| Account | What it shows |
| --- | --- |
| `family@demo.hv` | A family with a proposal to review, a trial in progress and a past placement |
| `bola@demo.hv` | A family with a placement waiting for payment, and a confirmed placement |
| `newfamily@demo.hv` | A family with nothing yet (empty states) |
| `agency@demo.hv` | Sunrise Domestic Staffing: workers in every verification and listing state, requests, placements, billing |
| `kano@demo.hv` | A second approved agency (Kano) |
| `pending@demo.hv` | An agency waiting for approval |
| `suspendedagency@demo.hv` | A suspended agency, with the admin's reason |
| `newagency@demo.hv` | An agency admin who hasn't registered an agency yet |
| `admin@demo.hv` | The super admin console |
| `unverified@demo.hv`, `suspended@demo.hv` | Sign-in edge cases |

Demo data lives in each browser tab and resets when the tab closes; to see one role's action from another role's side, stay in the same tab and sign out and in. No email is sent in demo mode; "Check your email" screens show a link to the page the email would have opened.

**Demo mode:** with `NEXT_PUBLIC_API_MOCKING=enabled` (the Phase 1 default) the app talks to a mock API in the browser, seeded with fictional agencies, workers, requests and placements. Add `?mock_error=CODE` to any page URL (e.g. `/contact?mock_error=RATE_LIMITED`) to make API calls fail with that error code; add `&mock_error_method=POST` and/or `&mock_error_path=/proposals` to limit it to matching calls. Files uploaded in demo mode never leave the browser.

First Playwright run (from `apps/web`): `bunx playwright install chromium webkit`.

**API commands** (from `apps/api`):

| Command | What it does |
| --- | --- |
| `uv run fastapi dev app/main.py` | Start the API with reload on http://localhost:8000 |
| `uv run ruff check . && uv run ruff format --check .` | Lint and formatting |
| `uv run mypy app tests` | Type check (strict) |
| `uv run pytest -q` | All tests; database tests skip if PostgreSQL or Redis isn't running (CI never skips) |
| `uv run pytest tests/concurrency -q` | Rule 2 under real concurrency (needs PostgreSQL) |
| `uv run alembic upgrade head` / `downgrade base` | Apply or roll back migrations |
| `uv run alembic revision -m "<message>"` | New migration (then hand-write triggers, partial indexes and enum changes) |

## Docs

| Document | What's in it |
| --- | --- |
| `docs/frontend-signoff.md` | Every spec acceptance item with its evidence, and the owner's sign-off |
| `docs/backend-handoff.md` | What the backend must implement, schema changes, order of work |
| `docs/architecture.md` | How the frontend is organised |
| `docs/route-map.md` | Every route, who can open it, and when it was built |
| `docs/accessibility.md` | What's checked automatically, exceptions, patterns |
| `docs/bundles.md` | JS per page and the budgets CI enforces |
| `docs/design-tokens.md`, `docs/asset-inventory.md`, `docs/content.md`, `docs/placeholders.md`, `docs/reference-adaptation.md` | Design system, assets, copy, temporary items, reference sites |
| `docs/database.md` | What's in the database now: migrations, ERD, rules enforced in SQL |
| `docs/decisions/` | Architecture decision records (ADRs 0001–0015) |
| `docs/owner-inputs.md` | Keys, accounts, prices and decisions the build is waiting on |
| `docs/CHANGELOG.md` | A report per milestone |

## Brand originals

The source logo and photos live in `specs/frontend/brandfiles/`. The photos (14–25 MB each) are **not committed** (ADR 0002). Only the optimised variants in `apps/web/public/images/` are. To regenerate them, place `Photo1.jpg` (cleaner), `Photo2.jpg` (driver) and `Photo3.jpg` (nanny) in that folder and run `bun --filter web images`.

## Structure

```
apps/web/            Next.js 15 frontend (see docs/architecture.md)
apps/api/            FastAPI backend (app/core, app/db, app/modules from B2; tests/)
packages/contracts/  Generated API types (from B7)
docs/                Architecture, ADRs, route map, tokens, assets, changelog
specs/               Approved specs and milestone plans
```
