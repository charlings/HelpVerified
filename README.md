# HelpVerified

Families in Nigeria hire nannies, drivers and cleaners whose **ID, guarantor, references and address** have been checked by a registered agency.

- Specs: `specs/frontend/project-helpverified-web.md`, `specs/backend/project-helpverified-api.md`
- Working rules for contributors and Claude Code: `CLAUDE.md` and `.claude/skills/helpverified/`
- Architecture and decisions: `docs/`

**Current phase:** 2 — Backend. Phase 1 (frontend, M1–M9) is complete and signed off (`docs/frontend-signoff.md`). B1 (API scaffold) and B2 (auth) are done; the web app still runs on mock data, and nothing is connected to the real API, payments or email until B7. Backend work follows `docs/backend-handoff.md` and lands on the `feature/backend` branch, one commit per milestone, merged into `main` later.

## Requirements

- Node 24 (`.nvmrc`)
- pnpm via corepack: `corepack enable`
- API: [uv](https://docs.astral.sh/uv/) (installs Python 3.14 itself), PostgreSQL 16 and Redis 7, via Docker or the portable setup below

## Setup

```bash
corepack enable
pnpm install
cp .env.example apps/web/.env.local     # PowerShell: Copy-Item .env.example apps/web/.env.local
pnpm dev                                # http://localhost:3000
```

The design-token and component gallery is at http://localhost:3000/styleguide (development only).

### API (apps/api)

1. Copy the API section at the bottom of `.env.example` to `apps/api/.env`, and set `JWT_SECRET` to a random value (the command is in the comment above it).
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

**Emails in development** (verify email, reset password) aren't sent. They're written as JSON files to `apps/api/.outbox/`; open the newest one and follow its `link`. A real provider arrives in B6.

## Commands

Run from the repository root (or use `pnpm --filter web <script>`).

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the web app |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint, including module-boundary, raw-colour and route-literal rules |
| `pnpm --filter web lint:css` | Stylelint (no hex colours outside `tokens.css`) |
| `pnpm typecheck` | TypeScript, strict (runs `next typegen` first, so it works on a clean clone) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm --filter web test:e2e` | Playwright on Chromium and WebKit (iPhone 13); builds into `apps/web/.next-e2e` and serves on port 3100, so `pnpm dev` can keep running |
| `pnpm --filter web exec playwright test e2e/audit.spec.ts --project=chromium --workers=1` | Accessibility and layout audit of every route (heavy; add `--shard=1/8` on a low-memory machine). See `docs/accessibility.md` |
| `pnpm --filter web exec playwright test -c playwright.firefox.config.ts` | Firefox smoke run (not in CI; `playwright install firefox` first) |
| `pnpm --filter web bundle:check <build log>` | Fail if a route is over its JS budget (`pnpm build > build.log` first). See `docs/bundles.md` |
| `pnpm --filter web brand` | Regenerate transparent logo, mark and favicons from the source logo |
| `pnpm --filter web images` | Regenerate responsive photo variants (needs the originals, see below) |
| `pnpm --filter web lighthouse` | Lighthouse mobile on Home and Services against a production build (build first with `NEXT_PUBLIC_SITE_URL=http://localhost:3200`); reports in `apps/web/lighthouse/` |

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

First Playwright run: `pnpm --filter web exec playwright install chromium webkit`.

**API commands** (from `apps/api`):

| Command | What it does |
| --- | --- |
| `uv run fastapi dev app/main.py` | Start the API with reload on http://localhost:8000 |
| `uv run ruff check . && uv run ruff format --check .` | Lint and formatting |
| `uv run mypy app tests` | Type check (strict) |
| `uv run pytest -q` | All tests; database tests skip if PostgreSQL or Redis isn't running (CI never skips) |
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
| `docs/decisions/` | Architecture decision records (ADRs 0001–0011) |
| `docs/CHANGELOG.md` | A report per milestone |

## Brand originals

The source logo and photos live in `specs/frontend/brandfiles/`. The photos (14–25 MB each) are **not committed** (ADR 0002). Only the optimised variants in `apps/web/public/images/` are. To regenerate them, place `Photo1.jpg` (cleaner), `Photo2.jpg` (driver) and `Photo3.jpg` (nanny) in that folder and run `pnpm --filter web images`.

## Structure

```
apps/web/            Next.js 15 frontend (see docs/architecture.md)
apps/api/            FastAPI backend (app/core, app/db, app/modules from B2; tests/)
packages/contracts/  Generated API types (from B7)
docs/                Architecture, ADRs, route map, tokens, assets, changelog
specs/               Approved specs and milestone plans
```
